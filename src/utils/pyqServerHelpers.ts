import type {
  DifficultyLevel,
  Question,
  QuestionFormat,
  QuestionOption,
  SubjectId,
  TipItem,
} from '../types';

export const VALID_SUBJECT_IDS: readonly SubjectId[] = [
  'ga',
  'em',
  'dl',
  'coa',
  'pds',
  'algo',
  'toc',
  'cd',
  'os',
  'dbms',
  'cn',
];

export const ALLOWED_PUBLIC_GATE_HOSTS = new Set<string>([
  'gateoverflow.in',
  'www.gateoverflow.in',
  'goclasses.in',
  'www.goclasses.in',
  'gate.iitm.ac.in',
  'gate2027.iitm.ac.in',
  'nptel.ac.in',
  'www.nptel.ac.in',
]);

/**
 * Returns the calendar date string (YYYY-MM-DD) in Asia/Kolkata (IST).
 * Used to enforce the strict once-per-IST-day Autopilot quota boundary.
 */
export function getIstDateString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Deterministic, collision-resistant normalized fingerprint for PYQ deduplication.
 * Produces a safe alphanumeric key (16 chars) compatible with Firestore IDs.
 */
export function computeQuestionFingerprint(prompt: string): string {
  const normalized = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 300);

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fp_${p1}${p2}`;
}

/**
 * SSRF-hardened validator for One-Click Public URL Importer.
 * Accepts ONLY HTTPS public GATE Overflow, GO Classes, IITM GATE, and NPTEL URLs.
 * Rejects private IPs, localhost, embedded credentials, non-HTTPS, and arbitrary hosts.
 */
export function validatePublicGateUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Please paste a public GATE Overflow or GO Classes URL.' };
  }
  if (trimmed.length > 500) {
    return { valid: false, error: 'URL exceeds maximum allowed length (500 characters).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format. Include https:// at the start.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS public URLs are permitted.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with embedded credentials are not permitted.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':')
  ) {
    return { valid: false, error: 'Local or raw IP addresses are blocked.' };
  }

  if (!ALLOWED_PUBLIC_GATE_HOSTS.has(host)) {
    return {
      valid: false,
      error:
        'Only public gateoverflow.in, goclasses.in, gate.iitm.ac.in, or nptel.ac.in URLs are allowed.',
    };
  }

  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'Non-standard ports are not allowed.' };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

/**
 * Extracts a JSON object or array from model output text,
 * tolerating markdown ```json code fences and conversational preamble.
 */
export function extractJsonFromModelText(text: string): unknown {
  const raw = (text ?? '').trim();
  if (!raw) return null;

  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to fence/brace extraction
  }

  // Try fenced JSON block
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // Locate outermost JSON object or array
  const firstObj = raw.indexOf('{');
  const firstArr = raw.indexOf('[');
  let start = -1;
  let openChar = '{';
  let closeChar = '}';

  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    start = firstObj;
    openChar = '{';
    closeChar = '}';
  } else if (firstArr !== -1) {
    start = firstArr;
    openChar = '[';
    closeChar = ']';
  }

  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        const slice = raw.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Detects Gemini Free-Tier 429 / RESOURCE_EXHAUSTED quota errors.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const obj = err as { status?: number; code?: number | string; message?: string };
  if (obj.status === 429 || obj.code === 429 || obj.code === 'RESOURCE_EXHAUSTED') {
    return true;
  }
  const msg = String(obj.message ?? err).toUpperCase();
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('QUOTA') ||
    msg.includes('RATE LIMIT') ||
    msg.includes('TOO MANY REQUESTS')
  );
}

function clampString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function normalizeSubjectId(val: unknown, fallback: SubjectId = 'algo'): SubjectId {
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase() as SubjectId;
    if (VALID_SUBJECT_IDS.includes(lower)) return lower;
  }
  return fallback;
}

function normalizeFormat(val: unknown): QuestionFormat {
  const upper = typeof val === 'string' ? val.trim().toUpperCase() : '';
  if (upper === 'MSQ' || upper === 'NAT' || upper === 'MCQ') return upper;
  return 'MCQ';
}

function normalizeDifficulty(val: unknown): DifficultyLevel {
  if (typeof val === 'string') {
    const cap = val.trim().toLowerCase();
    if (cap === 'easy') return 'Easy';
    if (cap === 'hard') return 'Hard';
  }
  return 'Medium';
}

function normalizeOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const out: QuestionOption[] = [];
  for (let i = 0; i < Math.min(raw.length, 6); i++) {
    const item = raw[i];
    if (typeof item === 'string' && item.trim()) {
      out.push({ id: letters[i], text: item.trim().slice(0, 600) });
    } else if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const id = clampString(rec.id, 4).toUpperCase() || letters[i];
      const text = clampString(rec.text, 600);
      if (text) out.push({ id, text });
    }
  }
  return out;
}

function safeSourceUrl(val: unknown, fallback?: string): string {
  const candidate = clampString(val, 500) || clampString(fallback, 500);
  if (!candidate) return '';
  try {
    const u = new URL(candidate);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString().slice(0, 500);
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Validates, normalizes, fingerprints, and deduplicates fetched PYQs
 * so every stored question strictly satisfies Firestore rules and app schema.
 */
export function sanitizeFetchedQuestions(
  raw: unknown,
  options?: {
    defaultSubjectId?: SubjectId;
    fallbackSourceUrl?: string;
    existingFingerprints?: Set<string>;
    maxItems?: number;
  }
): Question[] {
  const list = Array.isArray(raw) ? raw : [];
  const existing = new Set<string>(options?.existingFingerprints ?? []);
  const maxItems = options?.maxItems ?? 10;
  const result: Question[] = [];

  for (const entry of list) {
    if (result.length >= maxItems) break;
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;

    const prompt = clampString(item.prompt, 3800);
    const explanation = clampString(item.explanation, 4800);
    if (prompt.length < 10 || explanation.length < 10) continue;

    const fingerprint = computeQuestionFingerprint(prompt);
    if (existing.has(fingerprint)) continue;

    const format = normalizeFormat(item.format);
    const marks: 1 | 2 = Number(item.marks) === 1 ? 1 : 2;
    const subjectId = normalizeSubjectId(item.subjectId, options?.defaultSubjectId ?? 'algo');
    const subtopic = clampString(item.subtopic, 150) || 'Core Concepts';
    const difficulty = normalizeDifficulty(item.difficulty);
    const sourceTag = clampString(item.sourceTag, 110) || 'GATE PYQ · Web Grounded';
    const sourceUrl = safeSourceUrl(item.sourceUrl, options?.fallbackSourceUrl);
    const codeSnippet = clampString(item.codeSnippet, 3800);
    const wrongOptionAnalysis =
      clampString(item.wrongOptionAnalysis, 2800) ||
      'Review edge cases and verify each option against first-principles definitions.';

    const normalizedOpts = normalizeOptions(item.options);

    let correctOption = '';
    let correctOptions: string[] = [];
    let natAnswer = 0;
    let natTolerance = 0;
    let natUnit = '';

    if (format === 'MCQ') {
      if (normalizedOpts.length < 2) continue;
      const optId = clampString(item.correctOption, 4).toUpperCase();
      if (!normalizedOpts.some((o) => o.id === optId)) continue;
      correctOption = optId;
    } else if (format === 'MSQ') {
      if (normalizedOpts.length < 2) continue;
      const rawCorrect = Array.isArray(item.correctOptions) ? item.correctOptions : [];
      const validSet = new Set(normalizedOpts.map((o) => o.id));
      correctOptions = Array.from(
        new Set(
          rawCorrect
            .map((x) => clampString(x, 4).toUpperCase())
            .filter((x) => validSet.has(x))
        )
      ).sort();
      if (correctOptions.length === 0) continue;
    } else {
      const num = Number(item.natAnswer);
      if (Number.isNaN(num) || !Number.isFinite(num)) continue;
      natAnswer = num;
      const tol = Number(item.natTolerance);
      natTolerance = Number.isFinite(tol) && tol >= 0 && tol <= 100 ? tol : 0.01;
      natUnit = clampString(item.natUnit, 35);
    }

    existing.add(fingerprint);
    result.push({
      id: `pyq_${fingerprint}_${Date.now().toString(36).slice(-4)}`,
      subjectId,
      subtopic,
      format,
      marks,
      difficulty,
      sourceTag,
      sourceUrl: sourceUrl || undefined,
      prompt,
      codeSnippet: codeSnippet || undefined,
      options: format === 'NAT' ? undefined : normalizedOpts,
      correctOption: format === 'MCQ' ? correctOption : undefined,
      correctOptions: format === 'MSQ' ? correctOptions : undefined,
      natAnswer: format === 'NAT' ? natAnswer : undefined,
      natTolerance: format === 'NAT' ? natTolerance : undefined,
      natUnit: format === 'NAT' && natUnit ? natUnit : undefined,
      explanation,
      wrongOptionAnalysis,
      fingerprint,
      isCustom: true,
    });
  }

  return result;
}

/**
 * Validates and normalizes an Autopilot Daily Trap tip card.
 */
export function sanitizeFetchedTip(
  raw: unknown,
  fallbackSourceUrl?: string
): Omit<TipItem, 'id' | 'isCustom'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;

  const title = clampString(item.title, 175);
  const detail = clampString(item.detail, 2800);
  if (title.length < 4 || detail.length < 10) return null;

  const subjectId = normalizeSubjectId(item.subjectId, 'algo');
  const rawCat = clampString(item.category, 30);
  const validCategories: TipItem['category'][] = ['Exam Trap', 'Formula', 'Shortcut', 'Edge Case'];
  const category = validCategories.includes(rawCat as TipItem['category'])
    ? (rawCat as TipItem['category'])
    : 'Exam Trap';

  const summary = clampString(item.summary, 380) || detail.slice(0, 140);
  const formula = clampString(item.formula, 380);
  const sourceUrl = safeSourceUrl(item.sourceUrl, fallbackSourceUrl);

  return {
    subjectId,
    title,
    category,
    summary,
    detail,
    formula: formula || undefined,
    sourceUrl: sourceUrl || undefined,
  };
}
