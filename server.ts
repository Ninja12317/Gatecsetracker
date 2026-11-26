import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { SUBJECT_MAP } from './src/data/syllabus.ts';
import {
  getIstDateString,
  validatePublicGateUrl,
  extractJsonFromModelText,
  isQuotaExceededError,
  sanitizeFetchedQuestions,
  sanitizeFetchedTip,
  VALID_SUBJECT_IDS,
} from './src/utils/pyqServerHelpers.ts';
import type { Question, SubjectId, TipItem } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// STRICT FREE-TIER MODEL LOCK:
// gemini-2.5-flash-lite supports Google Search Grounding & URL Context on the unpaid Free Tier.
const FREE_TIER_MODEL = 'gemini-2.5-flash-lite';
const VERIFY_PRIMARY_MODEL = 'gemini-2.5-flash';
const VERIFY_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const QUOTA_EXCEEDED_MESSAGE = 'Daily free fetch limit reached · Using cached DB';
const SUBJECT_COOLDOWN_MS = 45_000;
const GATER_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface GateRRepoCacheEntry {
  sourceUrl: string;
  branch: string;
  syncedAt: string;
  fetchedAtMs: number;
  count: number;
  rawText: string;
}

let gaterRepoCache: GateRRepoCacheEntry | null = null;

interface DailyAutopilotCacheEntry {
  istDate: string;
  questions: Question[];
  dailyTrap: Omit<TipItem, 'id' | 'isCustom'> | null;
  sources: string[];
  fetchedAt: string;
}

// Server-side IST calendar-day cache for /api/daily-autopilot (at most 1 upstream call/day)
let dailyAutopilotCache: DailyAutopilotCacheEntry | null = null;
// Per-subject cooldown tracker to protect Free Tier quota
const subjectCooldownMap = new Map<string, number>();

function getGenAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function stripHtmlServer(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'gate27-war-room-sync',
        Accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractGroundingUrls(response: unknown): string[] {
  const urls: string[] = [];
  try {
    const resp = response as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string } }>;
        };
      }>;
    };
    const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (typeof uri === 'string' && uri.startsWith('http')) {
        urls.push(uri);
      }
    }
  } catch {
    // Ignore malformed metadata
  }
  return Array.from(new Set(urls)).slice(0, 8);
}

const QUESTION_SCHEMA_INSTRUCTIONS = `Return ONLY a valid JSON object (no prose outside JSON) with this exact shape:
{
  "questions": [
    {
      "subjectId": "ga|em|dl|coa|pds|algo|toc|cd|os|dbms|cn",
      "subtopic": "Concise GATE subtopic name",
      "format": "MCQ|MSQ|NAT",
      "marks": 1 or 2,
      "difficulty": "Easy|Medium|Hard",
      "sourceTag": "GATE CSE YYYY Set X · GATE Overflow",
      "sourceUrl": "https://gateoverflow.in/...",
      "prompt": "Full unambiguous GATE question statement",
      "codeSnippet": "Optional C/pseudocode snippet or empty string",
      "options": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],
      "correctOption": "A (for MCQ only, else empty string)",
      "correctOptions": ["A","C"] (for MSQ only, else []),
      "natAnswer": 0 (exact number for NAT, else 0),
      "natTolerance": 0.01 (for NAT, else 0),
      "natUnit": "optional unit string",
      "explanation": "Rigorous first-principles GATE proof and step-by-step derivation",
      "wrongOptionAnalysis": "Why common distractors fail or exam traps to watch"
    }
  ]
}`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // Health & free-tier status endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      model: FREE_TIER_MODEL,
      istDate: getIstDateString(),
      dailyAutopilotCached: dailyAutopilotCache?.istDate === getIstDateString(),
      gaterCachedCount: gaterRepoCache?.count ?? 0,
    });
  });

  /**
   * GET /api/sync-gater-repo
   * Server-side CORS-free proxy for khushit-shah/gater-frontend public/questions-filtered.json.
   * Resolves default branch via GitHub API with automatic fallbacks to main, master, and khushitshah.com.
   */
  app.get('/api/sync-gater-repo', async (req, res) => {
    const force = req.query.force === '1' || req.query.force === 'true';
    const now = Date.now();

    if (!force && gaterRepoCache && now - gaterRepoCache.fetchedAtMs < GATER_CACHE_TTL_MS) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(gaterRepoCache.rawText);
      return;
    }

    let resolvedBranch = 'main';
    try {
      const repoMetaResp = await fetchWithTimeout(
        'https://api.github.com/repos/khushit-shah/gater-frontend',
        6_000
      );
      if (repoMetaResp.ok) {
        const meta = (await repoMetaResp.json()) as { default_branch?: string };
        if (typeof meta?.default_branch === 'string' && /^[a-zA-Z0-9._-]+$/.test(meta.default_branch)) {
          resolvedBranch = meta.default_branch;
        }
      }
    } catch {
      // Fallback gracefully to main/master
    }

    const candidateUrls = Array.from(
      new Set([
        `https://raw.githubusercontent.com/khushit-shah/gater-frontend/${resolvedBranch}/public/questions-filtered.json`,
        'https://raw.githubusercontent.com/khushit-shah/gater-frontend/main/public/questions-filtered.json',
        'https://raw.githubusercontent.com/khushit-shah/gater-frontend/master/public/questions-filtered.json',
        'https://khushitshah.com/gater-frontend/questions-filtered.json',
      ])
    );

    let lastError = 'Unable to reach GitHub raw dataset.';
    for (const url of candidateUrls) {
      try {
        const resp = await fetchWithTimeout(url, 20_000);
        if (!resp.ok) {
          lastError = `HTTP ${resp.status} from ${url}`;
          continue;
        }
        const text = await resp.text();
        if (text.length < 100 || text.length > 25_000_000) {
          lastError = 'Unexpected dataset size.';
          continue;
        }
        const parsed: unknown = JSON.parse(text);
        const count = Array.isArray(parsed)
          ? parsed.length
          : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)
          ? ((parsed as { questions: unknown[] }).questions).length
          : parsed && typeof parsed === 'object'
          ? Object.keys(parsed).length
          : 0;

        if (count === 0) {
          lastError = 'Dataset contained 0 entries.';
          continue;
        }

        const syncedAt = new Date().toISOString();
        const envelope = JSON.stringify({
          ok: true,
          sourceUrl: url,
          branch: resolvedBranch,
          syncedAt,
          count,
          data: parsed,
        });

        gaterRepoCache = {
          sourceUrl: url,
          branch: resolvedBranch,
          syncedAt,
          fetchedAtMs: now,
          count,
          rawText: envelope,
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(envelope);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Fetch failed';
      }
    }

    if (gaterRepoCache) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(gaterRepoCache.rawText);
      return;
    }

    res.status(200).json({
      ok: false,
      message: `Could not sync GateR dataset right now (${lastError}). Serving local cached bank.`,
    });
  });

  /**
   * POST /api/verify-single-pyq
   * On-Demand Free-Tier verification for a single GATE PYQ.
   * Uses gemini-2.5-flash with automatic fallback to gemini-2.5-flash-lite.
   */
  app.post('/api/verify-single-pyq', async (req, res) => {
    const rawPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    const rawBodyHtml = typeof req.body?.bodyHtml === 'string' ? req.body.bodyHtml : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 200) : 'GATE CSE PYQ';
    const formatRaw = typeof req.body?.format === 'string' ? req.body.format.toUpperCase() : 'MCQ';
    const format: 'MCQ' | 'MSQ' | 'NAT' =
      formatRaw === 'MSQ' || formatRaw === 'NAT' ? formatRaw : 'MCQ';
    const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.slice(0, 400) : '';
    const rawOptions = Array.isArray(req.body?.options) ? req.body.options.slice(0, 6) : [];

    const questionText = (rawBodyHtml ? stripHtmlServer(rawBodyHtml) : rawPrompt).slice(0, 6000);
    if (questionText.length < 6) {
      res.status(400).json({ ok: false, message: 'Question statement is too short to verify.' });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.status(200).json({
        ok: false,
        quotaExceeded: false,
        message: 'Gemini API key is not configured on the server. Use GateOverflow link or Self-Check.',
      });
      return;
    }

    const optionsBlock =
      format !== 'NAT' && rawOptions.length > 0
        ? `\nOptions:\n${rawOptions
            .map((o: { id?: string; text?: string }) => `${String(o?.id ?? '')}. ${stripHtmlServer(String(o?.text ?? '')).slice(0, 500)}`)
            .join('\n')}`
        : '';

    const verificationPrompt = `You are a senior IIT Madras GATE CSE professor verifying an official GATE Computer Science Previous Year Question.
Solve the question rigorously from first principles and provide the exact official answer key.

Title: ${title}
Format: ${format}
Reference URL: ${sourceUrl || 'N/A'}
Question:
${questionText}${optionsBlock}

Return ONLY a valid JSON object (no markdown outside JSON) with this exact schema:
{
  "format": "${format}",
  "correctOption": "Single uppercase letter A/B/C/D if MCQ, else empty string",
  "correctOptions": ["Array of uppercase letters like A, C if MSQ, else []"],
  "natAnswer": 0,
  "natTolerance": 0.01,
  "explanation": "Clear, rigorous step-by-step GATE proof and derivation (max 1500 chars)",
  "wrongOptionAnalysis": "Concise explanation of why distractors fail or the key exam trap (max 600 chars)"
}`;

    const modelsToTry = [VERIFY_PRIMARY_MODEL, VERIFY_FALLBACK_MODEL];
    let sawQuotaError = false;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: verificationPrompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const parsed = extractJsonFromModelText(response.text ?? '') as Record<string, unknown> | null;
        if (!parsed || typeof parsed !== 'object') {
          continue;
        }

        const outFormat: 'MCQ' | 'MSQ' | 'NAT' =
          parsed.format === 'MSQ' || parsed.format === 'NAT' || parsed.format === 'MCQ'
            ? parsed.format
            : format;

        const cleanMcq =
          outFormat === 'MCQ' && typeof parsed.correctOption === 'string'
            ? parsed.correctOption.trim().toUpperCase().replace(/[^A-E]/g, '').slice(0, 1)
            : '';

        const cleanMsq =
          outFormat === 'MSQ' && Array.isArray(parsed.correctOptions)
            ? Array.from(
                new Set(
                  parsed.correctOptions
                    .map((x) => String(x).trim().toUpperCase().replace(/[^A-E]/g, '').slice(0, 1))
                    .filter((x) => /^[A-E]$/.test(x))
                )
              ).sort()
            : [];

        const cleanNat =
          outFormat === 'NAT' && typeof parsed.natAnswer === 'number' && Number.isFinite(parsed.natAnswer)
            ? parsed.natAnswer
            : outFormat === 'NAT' && typeof parsed.natAnswer === 'string' && Number.isFinite(Number(parsed.natAnswer))
            ? Number(parsed.natAnswer)
            : 0;

        const validKey =
          (outFormat === 'MCQ' && cleanMcq.length === 1) ||
          (outFormat === 'MSQ' && cleanMsq.length > 0) ||
          (outFormat === 'NAT' && Number.isFinite(cleanNat));

        if (!validKey) continue;

        const explanation =
          typeof parsed.explanation === 'string' && parsed.explanation.trim().length > 0
            ? parsed.explanation.trim().slice(0, 4800)
            : 'Verified from first principles.';
        const wrongOptionAnalysis =
          typeof parsed.wrongOptionAnalysis === 'string'
            ? parsed.wrongOptionAnalysis.trim().slice(0, 2800)
            : '';
        const natTolerance =
          outFormat === 'NAT' && typeof parsed.natTolerance === 'number' && Number.isFinite(parsed.natTolerance)
            ? Math.max(0, Math.min(100, parsed.natTolerance))
            : 0.01;

        res.json({
          ok: true,
          modelUsed: modelName,
          verified: {
            format: outFormat,
            correctOption: cleanMcq,
            correctOptions: cleanMsq,
            natAnswer: cleanNat,
            natTolerance,
            explanation,
            wrongOptionAnalysis,
          },
        });
        return;
      } catch (err) {
        if (isQuotaExceededError(err)) {
          sawQuotaError = true;
          continue;
        }
        console.error(`[verify-single-pyq] ${modelName} error:`, err);
      }
    }

    res.status(200).json({
      ok: false,
      quotaExceeded: sawQuotaError,
      message: sawQuotaError
        ? 'Daily free AI limit reached · Use GateOverflow Solution or Self-Check'
        : 'Could not verify this question automatically right now · Open GateOverflow Solution or use Self-Check.',
    });
  });

  /**
   * POST /api/daily-autopilot
   * Runs at most ONCE per calendar day (IST).
   * Uses Free-Tier gemini-2.5-flash-lite + Search Grounding to fetch 6 unseen
   * GATE CSE PYQs from public gateoverflow.in / open goclasses.in pages + 1 Daily Trap card.
   */
  app.post('/api/daily-autopilot', async (req, res) => {
    const istDate = getIstDateString();
    const existingFingerprints = new Set<string>(
      Array.isArray(req.body?.existingFingerprints)
        ? req.body.existingFingerprints.filter((x: unknown): x is string => typeof x === 'string').slice(0, 500)
        : []
    );

    if (dailyAutopilotCache && dailyAutopilotCache.istDate === istDate) {
      const unseen = dailyAutopilotCache.questions.filter(
        (q) => !q.fingerprint || !existingFingerprints.has(q.fingerprint)
      );
      res.json({
        ok: true,
        istDate,
        cached: true,
        questions: unseen,
        dailyTrap: dailyAutopilotCache.dailyTrap,
        sources: dailyAutopilotCache.sources,
      });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.json({
        ok: false,
        quotaExceeded: false,
        message: 'Gemini API key is not configured on the server · Using cached DB',
      });
      return;
    }

    try {
      const prompt = `Search public GATE Overflow (site:gateoverflow.in) and open GO Classes (site:goclasses.in) GATE CSE previous year questions (2015-2025).
Retrieve 6 high-rigor, authentic GATE CSE PYQs across diverse subjects (OS, DBMS, COA, Algorithms, TOC, Computer Networks, Engineering Math) with a mix of MCQ, MSQ, and NAT formats, PLUS 1 high-yield GATE CSE Daily Exam Trap card.
Every question must have a verified answer key and rigorous first-principles proof.

Return ONLY valid JSON with this shape:
{
  "questions": [
    {
      "subjectId": "ga|em|dl|coa|pds|algo|toc|cd|os|dbms|cn",
      "subtopic": "Subtopic",
      "format": "MCQ|MSQ|NAT",
      "marks": 1 or 2,
      "difficulty": "Easy|Medium|Hard",
      "sourceTag": "GATE CSE YYYY · GATE Overflow",
      "sourceUrl": "https://gateoverflow.in/...",
      "prompt": "Complete question text",
      "codeSnippet": "",
      "options": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],
      "correctOption": "A",
      "correctOptions": [],
      "natAnswer": 0,
      "natTolerance": 0.01,
      "natUnit": "",
      "explanation": "Step-by-step mathematical/CS proof",
      "wrongOptionAnalysis": "Why wrong options fail"
    }
  ],
  "dailyTrap": {
    "subjectId": "ga|em|dl|coa|pds|algo|toc|cd|os|dbms|cn",
    "title": "Concise trap title",
    "category": "Exam Trap",
    "summary": "One-sentence summary of the pitfall",
    "detail": "Detailed explanation of the exact GATE CSE trap and how to avoid negative marks",
    "formula": "Key formula or invariant",
    "sourceUrl": "https://gateoverflow.in/..."
  }
}`;

      const response = await ai.models.generateContent({
        model: FREE_TIER_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const sources = extractGroundingUrls(response);
      const fallbackUrl = sources[0] ?? 'https://gateoverflow.in/';
      const parsed = extractJsonFromModelText(response.text ?? '') as {
        questions?: unknown;
        dailyTrap?: unknown;
      } | null;

      const questions = sanitizeFetchedQuestions(parsed?.questions ?? [], {
        fallbackSourceUrl: fallbackUrl,
        existingFingerprints,
        maxItems: 8,
      });
      const dailyTrap = sanitizeFetchedTip(parsed?.dailyTrap, fallbackUrl);

      if (questions.length > 0 || dailyTrap) {
        dailyAutopilotCache = {
          istDate,
          questions,
          dailyTrap,
          sources,
          fetchedAt: new Date().toISOString(),
        };
      }

      res.json({
        ok: true,
        istDate,
        cached: false,
        questions,
        dailyTrap,
        sources,
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        res.json({
          ok: false,
          quotaExceeded: true,
          message: QUOTA_EXCEEDED_MESSAGE,
        });
        return;
      }
      console.error('[daily-autopilot] error:', err);
      res.status(200).json({
        ok: false,
        quotaExceeded: false,
        message: 'Could not reach public PYQ search right now · Using cached DB',
      });
    }
  });

  /**
   * POST /api/fetch-subject-pyqs
   * Fetches 5 unseen GATE PYQs for a specific subject using Search Grounding on gemini-2.5-flash-lite.
   * Protected by per-subject 45s cooldown and strict fingerprint deduplication.
   */
  app.post('/api/fetch-subject-pyqs', async (req, res) => {
    const rawSubject = typeof req.body?.subjectId === 'string' ? req.body.subjectId.trim().toLowerCase() : '';
    if (!VALID_SUBJECT_IDS.includes(rawSubject as SubjectId)) {
      res.status(400).json({ ok: false, message: 'Invalid GATE CSE subjectId.' });
      return;
    }
    const subjectId = rawSubject as SubjectId;

    const now = Date.now();
    const lastRun = subjectCooldownMap.get(subjectId) ?? 0;
    const elapsed = now - lastRun;
    if (elapsed < SUBJECT_COOLDOWN_MS) {
      const waitSecs = Math.ceil((SUBJECT_COOLDOWN_MS - elapsed) / 1000);
      res.status(429).json({
        ok: false,
        cooldown: true,
        retryAfterSeconds: waitSecs,
        message: `Cooldown active for ${SUBJECT_MAP[subjectId].shortName}. Try again in ${waitSecs}s.`,
      });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.json({
        ok: false,
        quotaExceeded: false,
        message: 'Gemini API key is not configured on the server · Using cached DB',
      });
      return;
    }

    const existingFingerprints = new Set<string>(
      Array.isArray(req.body?.existingFingerprints)
        ? req.body.existingFingerprints.filter((x: unknown): x is string => typeof x === 'string').slice(0, 600)
        : []
    );

    subjectCooldownMap.set(subjectId, now);
    const subj = SUBJECT_MAP[subjectId];

    try {
      const prompt = `Search public GATE Overflow (site:gateoverflow.in) and open GO Classes (site:goclasses.in) for 5 distinct, authentic GATE CSE previous year questions (2014-2025) specifically for the subject: "${subj.name}" (subjectId: "${subj.id}").
Cover topics from: ${subj.subtopics.map((s) => s.title).join('; ')}.
Include a realistic mix of MCQ, MSQ, and NAT formats with exact verified answer keys and complete step-by-step proofs.

${QUESTION_SCHEMA_INSTRUCTIONS}`;

      const response = await ai.models.generateContent({
        model: FREE_TIER_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const sources = extractGroundingUrls(response);
      const fallbackUrl = sources[0] ?? 'https://gateoverflow.in/';
      const parsed = extractJsonFromModelText(response.text ?? '') as
        | { questions?: unknown }
        | unknown[]
        | null;

      const rawList = Array.isArray(parsed) ? parsed : parsed?.questions ?? [];
      const questions = sanitizeFetchedQuestions(rawList, {
        defaultSubjectId: subjectId,
        fallbackSourceUrl: fallbackUrl,
        existingFingerprints,
        maxItems: 5,
      });

      res.json({
        ok: true,
        subjectId,
        questions,
        sources,
        cooldownSeconds: Math.round(SUBJECT_COOLDOWN_MS / 1000),
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        res.json({
          ok: false,
          quotaExceeded: true,
          message: QUOTA_EXCEEDED_MESSAGE,
        });
        return;
      }
      console.error('[fetch-subject-pyqs] error:', err);
      res.status(502).json({
        ok: false,
        quotaExceeded: false,
        message: 'Could not fetch subject PYQs right now · Using cached DB',
      });
    }
  });

  /**
   * POST /api/ingest-url
   * One-Click Public URL Importer using Free-Tier gemini-2.5-flash-lite + URL Context.
   * Strictly SSRF-validated against public gateoverflow.in / goclasses.in / gate.iitm.ac.in / nptel.ac.in.
   */
  app.post('/api/ingest-url', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const validation = validatePublicGateUrl(rawUrl);
    if (!validation.valid || !validation.normalizedUrl) {
      res.status(400).json({
        ok: false,
        message: validation.error ?? 'Invalid public GATE URL.',
      });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.json({
        ok: false,
        quotaExceeded: false,
        message: 'Gemini API key is not configured on the server.',
      });
      return;
    }

    const existingFingerprints = new Set<string>(
      Array.isArray(req.body?.existingFingerprints)
        ? req.body.existingFingerprints.filter((x: unknown): x is string => typeof x === 'string').slice(0, 600)
        : []
    );

    const targetUrl = validation.normalizedUrl;

    try {
      const prompt = `Read the public GATE CSE study page at this URL: ${targetUrl}
Extract every GATE CSE question (MCQ, MSQ, or NAT) present on that page along with its official/verified answer key and rigorous first-principles proof.
If the page contains a single GATE Overflow PYQ discussion, extract that exact question and synthesize the cleanest accepted proof.
If the page contains multiple questions (e.g., a quiz/DPP), extract up to 8 structured questions.
Set sourceUrl to "${targetUrl}".

${QUESTION_SCHEMA_INSTRUCTIONS}`;

      const response = await ai.models.generateContent({
        model: FREE_TIER_MODEL,
        contents: prompt,
        config: {
          tools: [{ urlContext: {} }],
        },
      });

      const parsed = extractJsonFromModelText(response.text ?? '') as
        | { questions?: unknown }
        | unknown[]
        | null;

      const rawList = Array.isArray(parsed) ? parsed : parsed?.questions ?? [];
      const questions = sanitizeFetchedQuestions(rawList, {
        fallbackSourceUrl: targetUrl,
        existingFingerprints,
        maxItems: 8,
      });

      if (questions.length === 0) {
        res.json({
          ok: false,
          quotaExceeded: false,
          message:
            'No new structured GATE questions could be extracted from that URL (or they are already in your bank).',
        });
        return;
      }

      res.json({
        ok: true,
        sourceUrl: targetUrl,
        questions,
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        res.json({
          ok: false,
          quotaExceeded: true,
          message: QUOTA_EXCEEDED_MESSAGE,
        });
        return;
      }
      console.error('[ingest-url] error:', err);
      res.status(502).json({
        ok: false,
        quotaExceeded: false,
        message: 'Unable to parse that public URL right now. Verify the page is publicly accessible.',
      });
    }
  });

  /**
   * POST /api/parse-mock-result
   * Layer 2 Free-Tier Gemini Universal Mock Test Result Parser.
   * Only invoked when Layer 1 local deterministic parser has low confidence or when user requests AI refinement.
   * Uses unpaid Free-Tier gemini-2.5-flash-lite with fallback to gemini-2.5-flash.
   */
  app.post('/api/parse-mock-result', async (req, res) => {
    const rawText = typeof req.body?.rawText === 'string' ? req.body.rawText.trim() : '';
    if (rawText.length < 10) {
      res.status(400).json({
        ok: false,
        message: 'Paste at least 10 characters of a mock test summary to parse.',
      });
      return;
    }
    if (rawText.length > 8000) {
      res.status(400).json({
        ok: false,
        message: 'Pasted summary is too long (maximum 8,000 characters).',
      });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.status(200).json({
        ok: false,
        quotaExceeded: false,
        message: 'Free-Tier AI key not configured · Using local parser preview.',
      });
      return;
    }

    const cleanedText = stripHtmlServer(rawText).slice(0, 6000);
    const prompt = `You are a strict JSON parser for GATE CSE mock test summaries (GO Classes, Made Easy, ACE Academy, GateOverflow, Testbook, Zeal, etc.).
Extract structured fields from the raw pasted exam summary below. Return ONLY a single valid JSON object (no markdown fences, no commentary).

Allowed JSON schema (use null for any field not present in the text):
{
  "name": string (test title without provider prefix if possible, max 140 chars),
  "source": string (e.g. "GO Classes", "Made Easy", "ACE Academy", "GateOverflow", "Testbook", "Zeal", or "GATE Test Series"),
  "subjectId": "all" | "ga" | "em" | "dl" | "coa" | "pds" | "algo" | "toc" | "cd" | "os" | "dbms" | "cn",
  "type": "Full-Length Mock" | "Subject Test" | "Topic-Wise Test",
  "score": number (net / resultant marks obtained),
  "maxScore": number (total maximum marks, e.g. 25, 50, 100),
  "percentage": number | null (score percentage if shown),
  "accuracy": number | null (0-100 accuracy percentage),
  "totalQuestions": number | null,
  "attempted": number | null,
  "correct": number | null,
  "wrong": number | null,
  "unattempted": number | null,
  "q1Attempted": number | null,
  "q2Attempted": number | null,
  "q1Correct": number | null,
  "q2Correct": number | null,
  "q1Wrong": number | null,
  "q2Wrong": number | null,
  "q1Total": number | null,
  "q2Total": number | null,
  "positiveMarks": number | null,
  "penaltyMarks": number | null (always non-negative magnitude of negative marks deducted),
  "q1PositiveMarks": number | null,
  "q2PositiveMarks": number | null,
  "q1PenaltyMarks": number | null,
  "q2PenaltyMarks": number | null,
  "durationMinutes": number | null,
  "timeTakenMinutes": number | null,
  "rank": number | null,
  "totalCandidates": number | null,
  "percentile": number | null
}

Mapping rules:
- Discrete Mathematics, Linear Algebra, Calculus, Probability -> subjectId "em"
- Programming & Data Structures / C / Trees / Linked Lists -> subjectId "pds"
- Full-Length Mock / AIMT / Grand Test -> type "Full-Length Mock", subjectId "all"
- Topic Wise Test / Mini Test / Chapter Test -> type "Topic-Wise Test"
- Subject Wise Test / Multi-Subject -> type "Subject Test"
- Parenthesized "(a + b)" splits in GO Classes summaries always represent (1-Mark + 2-Mark).

RAW EXAM SUMMARY:
"""
${cleanedText}
"""`;

    const clampOptNum = (v: unknown, min: number, max: number, roundInt = false): number | undefined => {
      if (v === null || v === undefined || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      const clamped = Math.max(min, Math.min(max, n));
      return roundInt ? Math.round(clamped) : Math.round(clamped * 100) / 100;
    };

    try {
      let rawModelText = '';
      try {
        const response = await ai.models.generateContent({
          model: FREE_TIER_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
        rawModelText = response.text ?? '';
      } catch (firstErr) {
        if (isQuotaExceededError(firstErr)) {
          throw firstErr;
        }
        const fallbackResp = await ai.models.generateContent({
          model: VERIFY_PRIMARY_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
        rawModelText = fallbackResp.text ?? '';
      }

      const parsed = extractJsonFromModelText(rawModelText) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        res.status(200).json({
          ok: false,
          quotaExceeded: false,
          message: 'Free-Tier AI could not structure this paste · Edit fields manually below.',
        });
        return;
      }

      const validTypes = new Set(['Full-Length Mock', 'Subject Test', 'Topic-Wise Test']);
      const validMockSubjects = new Set<string>(['all', ...VALID_SUBJECT_IDS]);

      const rawType = typeof parsed.type === 'string' && validTypes.has(parsed.type)
        ? (parsed.type as 'Full-Length Mock' | 'Subject Test' | 'Topic-Wise Test')
        : 'Subject Test';
      const rawSubjectId =
        typeof parsed.subjectId === 'string' && validMockSubjects.has(parsed.subjectId.toLowerCase())
          ? parsed.subjectId.toLowerCase()
          : 'all';

      const maxScore = clampOptNum(parsed.maxScore, 1, 300) ?? 100;
      const score = clampOptNum(parsed.score, -100, 300) ?? 0;
      const normalizedScore = Math.max(
        -100,
        Math.min(100, Math.round((score / maxScore) * 10000) / 100)
      );
      const percentage = clampOptNum(parsed.percentage, -100, 100) ?? normalizedScore;

      const correct = clampOptNum(parsed.correct, 0, 300, true);
      const wrong = clampOptNum(parsed.wrong, 0, 300, true);
      const attempted =
        clampOptNum(parsed.attempted, 0, 300, true) ??
        (correct !== undefined && wrong !== undefined ? correct + wrong : undefined);
      const totalQuestions = clampOptNum(parsed.totalQuestions, 0, 300, true);
      const unattempted =
        clampOptNum(parsed.unattempted, 0, 300, true) ??
        (totalQuestions !== undefined && attempted !== undefined
          ? Math.max(0, totalQuestions - attempted)
          : 0);

      let accuracy = clampOptNum(parsed.accuracy, 0, 100, true);
      if (accuracy === undefined) {
        if (correct !== undefined && attempted !== undefined && attempted > 0) {
          accuracy = Math.max(0, Math.min(100, Math.round((correct / attempted) * 100)));
        } else {
          accuracy = Math.max(0, Math.min(100, Math.round(Math.max(0, normalizedScore))));
        }
      }

      const nameStr =
        typeof parsed.name === 'string' && parsed.name.trim().length >= 3
          ? parsed.name.trim().slice(0, 160)
          : `${typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source.trim() : 'GATE'} · ${rawType}`;
      const sourceStr =
        typeof parsed.source === 'string' && parsed.source.trim().length >= 1
          ? parsed.source.trim().slice(0, 120)
          : 'GATE Test Series';

      const draft = {
        name: nameStr,
        source: sourceStr,
        subjectId: rawType === 'Full-Length Mock' ? 'all' : rawSubjectId,
        type: rawType,
        score,
        maxScore,
        normalizedScore,
        percentage,
        accuracy,
        totalQuestions,
        attempted,
        correct,
        wrong,
        unattempted,
        q1Attempted: clampOptNum(parsed.q1Attempted, 0, 200, true),
        q2Attempted: clampOptNum(parsed.q2Attempted, 0, 200, true),
        q1Correct: clampOptNum(parsed.q1Correct, 0, 200, true),
        q2Correct: clampOptNum(parsed.q2Correct, 0, 200, true),
        q1Wrong: clampOptNum(parsed.q1Wrong, 0, 200, true),
        q2Wrong: clampOptNum(parsed.q2Wrong, 0, 200, true),
        q1Total: clampOptNum(parsed.q1Total, 0, 200, true),
        q2Total: clampOptNum(parsed.q2Total, 0, 200, true),
        positiveMarks: clampOptNum(parsed.positiveMarks, 0, 300),
        penaltyMarks: clampOptNum(
          parsed.penaltyMarks !== null && parsed.penaltyMarks !== undefined
            ? Math.abs(Number(parsed.penaltyMarks))
            : undefined,
          0,
          150
        ),
        q1PositiveMarks: clampOptNum(parsed.q1PositiveMarks, 0, 200),
        q2PositiveMarks: clampOptNum(parsed.q2PositiveMarks, 0, 300),
        q1PenaltyMarks: clampOptNum(
          parsed.q1PenaltyMarks !== null && parsed.q1PenaltyMarks !== undefined
            ? Math.abs(Number(parsed.q1PenaltyMarks))
            : undefined,
          0,
          150
        ),
        q2PenaltyMarks: clampOptNum(
          parsed.q2PenaltyMarks !== null && parsed.q2PenaltyMarks !== undefined
            ? Math.abs(Number(parsed.q2PenaltyMarks))
            : undefined,
          0,
          150
        ),
        durationMinutes: clampOptNum(parsed.durationMinutes, 0, 600),
        timeTakenMinutes: clampOptNum(parsed.timeTakenMinutes, 0, 600),
        rank: clampOptNum(parsed.rank, 1, 500000, true),
        totalCandidates: clampOptNum(parsed.totalCandidates, 1, 500000, true),
        percentile: clampOptNum(parsed.percentile, 0, 100),
        parseSource: 'ai_free_tier' as const,
      };

      res.json({
        ok: true,
        model: FREE_TIER_MODEL,
        draft,
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        res.status(200).json({
          ok: false,
          quotaExceeded: true,
          message: 'Daily free AI limit reached · Edit preview fields manually.',
        });
        return;
      }
      console.error('[parse-mock-result] error:', err);
      res.status(200).json({
        ok: false,
        quotaExceeded: false,
        message: 'Could not reach Free-Tier AI right now · Edit preview fields manually.',
      });
    }
  });

  /**
   * POST /api/generate-daily-traps
   * Generates exam-grade GATE CSE conceptual traps, edge cases, and shortcuts tailored to weak subjects
   * and Mistake Bucket items using Free-Tier gemini-2.5-flash (fallback gemini-2.5-flash-lite).
   * Uses strict responseMimeType: 'application/json' without Search tool conflicts.
   */
  app.post('/api/generate-daily-traps', async (req, res) => {
    const istDate = getIstDateString();
    const rawCount = Number(req.body?.count);
    const count = Number.isFinite(rawCount) ? Math.max(1, Math.min(8, Math.round(rawCount))) : 5;
    const modeRaw = typeof req.body?.mode === 'string' ? req.body.mode : 'daily';
    const mode: 'ai_daily' | 'ai_subject' | 'mistake_mined' =
      modeRaw === 'mistakes' || modeRaw === 'mistake_mined'
        ? 'mistake_mined'
        : modeRaw === 'subject' || modeRaw === 'ai_subject'
        ? 'ai_subject'
        : 'ai_daily';

    const requestedSubjects: SubjectId[] = Array.isArray(req.body?.subjects)
      ? req.body.subjects
          .map((s: unknown) => String(s).trim().toLowerCase())
          .filter((s: string): s is SubjectId => VALID_SUBJECT_IDS.includes(s as SubjectId))
          .slice(0, 11)
      : [];

    const weakTopics: string[] = Array.isArray(req.body?.weakTopicsFromMistakeBucket)
      ? req.body.weakTopicsFromMistakeBucket
          .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x: string) => x.trim().slice(0, 100))
          .slice(0, 15)
      : [];

    const existingTitlesRaw: string[] = Array.isArray(req.body?.existingTitles)
      ? req.body.existingTitles
          .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x: string) => x.trim().slice(0, 160))
          .slice(0, 120)
      : [];
    const existingTitleSet = new Set(existingTitlesRaw.map((t) => t.toLowerCase()));

    const mistakeSamples: Array<{
      questionId?: string;
      subjectId?: string;
      subtopic?: string;
      errorTag?: string;
      promptSnippet?: string;
      userNote?: string;
    }> = Array.isArray(req.body?.mistakeSamples) ? req.body.mistakeSamples.slice(0, 6) : [];

    const ai = getGenAiClient();
    if (!ai) {
      res.status(200).json({
        ok: false,
        quotaExceeded: false,
        istDate,
        message: 'Free-Tier AI key not configured · Showing cached & GateR tag traps.',
      });
      return;
    }

    const subjectContext =
      requestedSubjects.length > 0
        ? requestedSubjects
            .map((id) => `${SUBJECT_MAP[id]?.name ?? id} (subjectId: "${id}")`)
            .join(', ')
        : 'All 11 GATE CSE 2027 subjects (focus on high-weightage OS, DBMS, COA, Algorithms, TOC, CN, EM, DL, PDS, CD, GA)';

    const avoidList =
      existingTitlesRaw.length > 0
        ? `\nDO NOT repeat or closely paraphrase any of these already-saved titles:\n- ${existingTitlesRaw.slice(0, 45).join('\n- ')}`
        : '';

    const mistakeBlock =
      mode === 'mistake_mined' && mistakeSamples.length > 0
        ? `\nMINE CONCISE PERSONAL TRAP CARDS DIRECTLY FROM THESE ACTUAL WRONG PYQs:\n${mistakeSamples
            .map(
              (m, idx) =>
                `${idx + 1}. [subjectId=${m.subjectId ?? 'algo'}, questionId=${m.questionId ?? ''}, errorTag=${m.errorTag ?? 'Conceptual Gap'}, subtopic=${m.subtopic ?? ''}] ${stripHtmlServer(String(m.promptSnippet ?? '')).slice(0, 320)}${m.userNote ? ` | Student note: ${m.userNote.slice(0, 160)}` : ''}`
            )
            .join('\n')}`
        : weakTopics.length > 0
        ? `\nPrioritize conceptual traps from these weak topics & mistake tags: ${weakTopics.join(', ')}.`
        : '';

    const prompt = `You are a senior IIT Madras GATE CSE 2027 professor writing ultra-sharp, non-trivial exam traps, edge cases, counter-examples, and solving shortcuts.
Generate EXACTLY ${count} distinct, high-rigor GATE CSE cards for: ${subjectContext}.${mistakeBlock}${avoidList}

Rules:
- Every card must expose a REAL GATE CSE pitfall where students lose negative marks (e.g., strict vs non-strict inequalities, 0-indexed vs 1-indexed, byte vs word addressing, MSQ partial traps, boundary conditions, counter-examples).
- Keep summaries punchy (1 sentence), details mathematically rigorous (2–4 crisp sentences with a concrete counter-example or derivation), and include a compact formula/invariant when applicable.
- Allowed subjectId values: "ga","em","dl","coa","pds","algo","toc","cd","os","dbms","cn".
- Allowed category values: "Exam Trap", "Formula", "Shortcut", "Edge Case".

Return ONLY valid JSON with this exact schema:
{
  "traps": [
    {
      "subjectId": "os",
      "title": "Concise non-generic title (max 110 chars)",
      "category": "Exam Trap",
      "summary": "One crisp sentence stating the exact pitfall or shortcut",
      "detail": "Concrete GATE CSE derivation, edge case, or counter-example showing how to avoid the trap",
      "formula": "Key formula or invariant (or empty string)",
      "sourceQuestionId": "Optional matching questionId from mistakeSamples if mistake_mined, else empty string"
    }
  ]
}`;

    const modelsToTry = [VERIFY_PRIMARY_MODEL, VERIFY_FALLBACK_MODEL];
    let sawQuotaError = false;
    const validCategories = new Set(['Exam Trap', 'Formula', 'Shortcut', 'Edge Case']);

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.45,
          },
        });

        const parsed = extractJsonFromModelText(response.text ?? '') as { traps?: unknown } | unknown[] | null;
        const rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.traps) ? parsed.traps : [];

        const cleaned: Array<{
          subjectId: SubjectId;
          title: string;
          category: 'Exam Trap' | 'Formula' | 'Shortcut' | 'Edge Case';
          summary: string;
          detail: string;
          formula: string;
          trapSource: 'ai_daily' | 'ai_subject' | 'mistake_mined';
          generatedDateIst: string;
          sourceQuestionId?: string;
        }> = [];

        for (const entry of rawList) {
          if (cleaned.length >= count) break;
          if (!entry || typeof entry !== 'object') continue;
          const obj = entry as Record<string, unknown>;

          const rawSubj = typeof obj.subjectId === 'string' ? obj.subjectId.trim().toLowerCase() : '';
          const subjectId: SubjectId = VALID_SUBJECT_IDS.includes(rawSubj as SubjectId)
            ? (rawSubj as SubjectId)
            : requestedSubjects[0] ?? 'algo';

          const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 160) : '';
          const detail = typeof obj.detail === 'string' ? obj.detail.trim().slice(0, 2800) : '';
          if (title.length < 4 || detail.length < 10) continue;
          if (existingTitleSet.has(title.toLowerCase())) continue;
          existingTitleSet.add(title.toLowerCase());

          const rawCat = typeof obj.category === 'string' ? obj.category.trim() : 'Exam Trap';
          const category = (validCategories.has(rawCat) ? rawCat : 'Exam Trap') as
            | 'Exam Trap'
            | 'Formula'
            | 'Shortcut'
            | 'Edge Case';
          const summary =
            typeof obj.summary === 'string' && obj.summary.trim().length > 0
              ? obj.summary.trim().slice(0, 380)
              : detail.slice(0, 180);
          const formula = typeof obj.formula === 'string' ? obj.formula.trim().slice(0, 380) : '';
          const sourceQuestionId =
            typeof obj.sourceQuestionId === 'string' && obj.sourceQuestionId.trim().length > 0
              ? obj.sourceQuestionId.trim().slice(0, 120)
              : undefined;

          cleaned.push({
            subjectId,
            title,
            category,
            summary,
            detail,
            formula,
            trapSource: mode,
            generatedDateIst: istDate,
            ...(sourceQuestionId ? { sourceQuestionId } : {}),
          });
        }

        if (cleaned.length > 0) {
          res.json({
            ok: true,
            istDate,
            modelUsed: modelName,
            traps: cleaned,
          });
          return;
        }
      } catch (err) {
        if (isQuotaExceededError(err)) {
          sawQuotaError = true;
          continue;
        }
        console.error(`[generate-daily-traps] ${modelName} error:`, err);
      }
    }

    res.status(200).json({
      ok: false,
      quotaExceeded: sawQuotaError,
      istDate,
      message: sawQuotaError
        ? 'Daily free AI limit reached · Showing cached & GateR tag traps'
        : 'Could not reach Free-Tier AI right now · Showing cached & GateR tag traps',
    });
  });

  /**
   * POST /api/visualize-code
   * Deep Trace & Flowchart Mode for complex C / Python / GATE pseudocode snippets
   * (pointers, structs, linked lists, trees, recursion).
   * Uses Free-Tier gemini-2.5-flash with gemini-2.5-flash-lite fallback.
   */
  app.post('/api/visualize-code', async (req, res) => {
    const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const language =
      typeof req.body?.language === 'string' && ['c', 'pseudocode', 'python'].includes(req.body.language)
        ? req.body.language
        : 'c';

    if (rawCode.length < 5 || rawCode.length > 6000) {
      res.status(400).json({
        ok: false,
        engine: 'ai',
        error: 'Provide between 5 and 6,000 characters of code to trace.',
      });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.status(200).json({
        ok: false,
        engine: 'ai',
        error: 'Free-Tier AI key not configured · Use Fast Local Run (₹0 offline) instead.',
      });
      return;
    }

    const numberedCode = rawCode
      .split('\n')
      .map((line: string, i: number) => `${i + 1}: ${line}`)
      .join('\n');

    const prompt = `You are a strict GATE CSE compiler & dry-run execution tracer.
Trace this ${language.toUpperCase()} snippet step-by-step with exact C semantics (static variables, integer division, pointer dereferences, recursion stack, exact stdout).
Return ONLY valid JSON (no markdown fences, no prose) matching this exact schema:
{
  "stdout": "exact printed console output",
  "flowchart": {
    "mode": "recursion_tree" or "flowchart",
    "nodes": [
      { "id": "n1", "label": "short <=28 chars", "type": "start|process|decision|call|return|io|end", "line": 1, "stepRefs": [1], "returnLabel": "optional return value" }
    ],
    "edges": [
      { "from": "n1", "to": "n2", "label": "optional True/False" }
    ]
  },
  "frames": [
    {
      "step": 1,
      "line": 1,
      "activeNodeId": "n1",
      "variables": { "x": "1" },
      "memoryPointers": [{ "name": "p", "address": "0x1000", "value": "*p = 10" }],
      "callStack": ["main()"],
      "outputSoFar": "",
      "branchTaken": "true|false|null",
      "explanation": "Concise 1-sentence dry-run note"
    }
  ]
}
Keep frames <= 45 and nodes <= 28. Use mode "recursion_tree" when a function calls itself recursively, else "flowchart".

CODE:
${numberedCode}`;

    const modelsToTry = [VERIFY_PRIMARY_MODEL, VERIFY_FALLBACK_MODEL];
    let sawQuotaError = false;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const parsed = extractJsonFromModelText(response.text ?? '') as {
          stdout?: unknown;
          flowchart?: {
            mode?: unknown;
            nodes?: Array<Record<string, unknown>>;
            edges?: Array<Record<string, unknown>>;
          };
          frames?: Array<Record<string, unknown>>;
        } | null;

        if (!parsed || !Array.isArray(parsed.frames) || parsed.frames.length === 0) {
          continue;
        }

        const validTypes = new Set(['start', 'end', 'process', 'decision', 'call', 'return', 'io']);
        const rawNodes = Array.isArray(parsed.flowchart?.nodes) ? parsed.flowchart.nodes : [];
        const nodes = rawNodes.slice(0, 32).map((n, idx) => ({
          id: String(n.id || `n_${idx + 1}`).slice(0, 40),
          label: String(n.label || `Step ${idx + 1}`).slice(0, 40),
          type: validTypes.has(String(n.type))
            ? (String(n.type) as 'start' | 'end' | 'process' | 'decision' | 'call' | 'return' | 'io')
            : 'process',
          line: Math.max(1, Math.min(500, Number(n.line) || 1)),
          stepRefs: Array.isArray(n.stepRefs)
            ? n.stepRefs.map(Number).filter((x) => Number.isInteger(x) && x >= 1)
            : [],
          returnLabel:
            typeof n.returnLabel === 'string' && n.returnLabel.trim()
              ? n.returnLabel.trim().slice(0, 24)
              : undefined,
        }));

        const nodeIds = new Set(nodes.map((n) => n.id));
        const rawEdges = Array.isArray(parsed.flowchart?.edges) ? parsed.flowchart.edges : [];
        const edges = rawEdges
          .slice(0, 64)
          .map((e) => ({
            from: String(e.from || '').slice(0, 40),
            to: String(e.to || '').slice(0, 40),
            label:
              typeof e.label === 'string' && e.label.trim()
                ? e.label.trim().slice(0, 16)
                : undefined,
          }))
          .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

        const frames = parsed.frames.slice(0, 60).map((f, idx) => {
          const varsObj: Record<string, string> = {};
          if (f.variables && typeof f.variables === 'object' && !Array.isArray(f.variables)) {
            for (const [k, v] of Object.entries(f.variables as Record<string, unknown>).slice(0, 20)) {
              varsObj[String(k).slice(0, 32)] = String(v).slice(0, 64);
            }
          }
          const memPtrs = Array.isArray(f.memoryPointers)
            ? (f.memoryPointers as Array<Record<string, unknown>>).slice(0, 12).map((m) => ({
                name: String(m.name || 'ptr').slice(0, 24),
                address: String(m.address || '0x1000').slice(0, 24),
                value: String(m.value || '').slice(0, 48),
              }))
            : [];
          const stack = Array.isArray(f.callStack)
            ? f.callStack.slice(0, 20).map((s) => String(s).slice(0, 48))
            : ['main()'];
          const bt =
            f.branchTaken === 'true' || f.branchTaken === true
              ? ('true' as const)
              : f.branchTaken === 'false' || f.branchTaken === false
              ? ('false' as const)
              : null;
          const activeId = String(f.activeNodeId || nodes[0]?.id || 'n1').slice(0, 40);
          return {
            step: idx + 1,
            line: Math.max(1, Math.min(500, Number(f.line) || 1)),
            activeNodeId: activeId,
            variables: varsObj,
            memoryPointers: memPtrs,
            callStack: stack,
            outputSoFar: String(f.outputSoFar ?? '').slice(0, 1000),
            branchTaken: bt,
            explanation: String(f.explanation || `Executed step ${idx + 1}`).slice(0, 220),
          };
        });

        // Ensure every node has stepRefs linked from frames
        for (const frame of frames) {
          const nd = nodes.find((n) => n.id === frame.activeNodeId);
          if (nd && !nd.stepRefs.includes(frame.step)) {
            nd.stepRefs.push(frame.step);
          }
        }

        const mode =
          parsed.flowchart?.mode === 'recursion_tree' ? 'recursion_tree' : 'flowchart';

        res.json({
          ok: true,
          engine: 'ai',
          modelUsed: modelName,
          stdout: String(parsed.stdout ?? frames[frames.length - 1]?.outputSoFar ?? '').slice(0, 2000),
          frames,
          flowchart: { mode, nodes, edges },
        });
        return;
      } catch (err) {
        if (isQuotaExceededError(err)) {
          sawQuotaError = true;
          continue;
        }
        console.error(`[visualize-code] ${modelName} error:`, err);
      }
    }

    res.status(200).json({
      ok: false,
      engine: 'ai',
      quotaExceeded: sawQuotaError,
      error: sawQuotaError
        ? 'Daily free AI limit reached · Fast Local Run (₹0) is always available.'
        : 'Deep Trace AI unavailable right now · Use Fast Local Run (₹0).',
    });
  });

  // --- TOC Studio: Custom Formal Language Classifier (Free-Tier Gemini 2.5 Flash + In-Memory Cache) ---
  interface ClassifiedLanguageResult {
    expression: string;
    chomskyClass: string;
    isDcfl: boolean;
    complementClass: string;
    myhillNerode: string;
    pumpingSketch: string;
    automatonOrGrammarHint: string;
    gateTrap: string;
  }
  const languageClassifyCache = new Map<string, ClassifiedLanguageResult>();

  app.post('/api/classify-language', async (req, res) => {
    const rawExpr = typeof req.body?.expression === 'string' ? req.body.expression.trim() : '';
    if (rawExpr.length < 3 || rawExpr.length > 300) {
      res.status(400).json({
        ok: false,
        error: 'Enter a formal language definition between 3 and 300 characters.',
      });
      return;
    }

    const cacheKey = rawExpr.toLowerCase().replace(/\s+/g, ' ');
    const cached = languageClassifyCache.get(cacheKey);
    if (cached) {
      res.json({ ok: true, cached: true, result: cached });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.status(200).json({
        ok: false,
        error: 'Free-Tier AI key not configured · Explore the 28 curated GATE languages below offline (₹0).',
      });
      return;
    }

    const prompt = `You are an IIT Madras GATE CSE Theory of Computation (TOC) professor.
Classify the following formal language accurately within the Chomsky Hierarchy and GATE CSE syllabus.
Return ONLY valid JSON (no markdown fences, no extra prose) with this exact schema:
{
  "chomskyClass": "One of: Regular | DCFL | CFL (Non-DCFL) | CSL | Recursive | RE (Non-Recursive) | Not RE",
  "isDcfl": true or false,
  "complementClass": "Exact class of complement L-bar and brief reason (<= 110 chars)",
  "myhillNerode": "Finite index value or Infinite equivalence classes explanation (<= 160 chars)",
  "pumpingSketch": "Concise Pumping Lemma or closure-property proof sketch (<= 220 chars)",
  "automatonOrGrammarHint": "Minimal DFA / DPDA / NPDA / LBA / TM or CFG construction idea (<= 180 chars)",
  "gateTrap": "Most common GATE exam trap or edge case for this language (<= 160 chars)"
}

LANGUAGE:
${rawExpr}`;

    const modelsToTry = [VERIFY_PRIMARY_MODEL, VERIFY_FALLBACK_MODEL];
    let sawQuotaError = false;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const parsed = extractJsonFromModelText(response.text ?? '') as Record<string, unknown> | null;
        if (!parsed || typeof parsed.chomskyClass !== 'string') {
          continue;
        }

        const result: ClassifiedLanguageResult = {
          expression: rawExpr,
          chomskyClass: String(parsed.chomskyClass).slice(0, 40),
          isDcfl: Boolean(parsed.isDcfl),
          complementClass: String(parsed.complementClass ?? 'Depends on closure of this class.').slice(0, 180),
          myhillNerode: String(parsed.myhillNerode ?? 'See equivalence class behavior.').slice(0, 220),
          pumpingSketch: String(parsed.pumpingSketch ?? 'Apply Regular or CFL Pumping Lemma.').slice(0, 280),
          automatonOrGrammarHint: String(parsed.automatonOrGrammarHint ?? 'Construct minimal recognizer.').slice(0, 220),
          gateTrap: String(parsed.gateTrap ?? 'Verify alphabet size and exponent bounds carefully.').slice(0, 220),
        };

        if (languageClassifyCache.size >= 200) {
          const oldestKey = languageClassifyCache.keys().next().value;
          if (oldestKey) languageClassifyCache.delete(oldestKey);
        }
        languageClassifyCache.set(cacheKey, result);

        res.json({ ok: true, cached: false, modelUsed: modelName, result });
        return;
      } catch (err) {
        if (isQuotaExceededError(err)) {
          sawQuotaError = true;
          continue;
        }
        console.error(`[classify-language] ${modelName} error:`, err);
      }
    }

    res.status(200).json({
      ok: false,
      quotaExceeded: sawQuotaError,
      error: sawQuotaError
        ? 'Daily free AI limit reached · All 28 curated GATE languages below work 100% offline.'
        : 'AI classifier temporarily unavailable · Use the 28 curated GATE languages below.',
    });
  });

  // Ensure PWA manifest & Service Worker always serve with exact headers in both dev & production
  const pwaStaticMiddleware = (staticRoot: string) =>
    express.static(staticRoot, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=3600');
        } else if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Service-Worker-Allowed', '/');
        }
      },
    });

  // Frontend serving: Vite middleware in dev, dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const publicDir = path.resolve(__dirname, 'public');
    app.use(pwaStaticMiddleware(publicDir));
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      plugins: [
        {
          name: 'disable-vite-client-ws-when-hmr-off',
          enforce: 'post',
          transform(code, id) {
            if (id.includes('vite/dist/client/client.mjs') || id.endsWith('/@vite/client')) {
              return {
                code: code.replace(
                  'transport.connect(createHMRHandler(handleMessage));',
                  '/* WebSocket transport disabled while HMR is off */',
                ),
                map: null,
              };
            }
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(pwaStaticMiddleware(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`GATE '27 // WAR ROOM server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
