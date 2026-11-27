import type {
  DifficultyLevel,
  Question,
  QuestionFormat,
  QuestionOption,
  QuestionSourceCategory,
  SubjectId,
} from '../types/index.ts';
import { classifyPdsToCprogOrDs } from './subjectMigration.ts';

export interface ArshanPyqKeyRecord {
  paper: string;
  year: number;
  set: number | null;
  qno: number;
  csQno: number; // In GATE papers, Q.1–Q.10 are GA and Q.11–Q.65 are CS Q.1–Q.55
  subjectId: SubjectId;
  subtopic: string;
  extraTags: string[];
  format: QuestionFormat;
  marks: 1 | 2;
  correctOption?: string;
  correctOptions?: string[];
  natAnswer?: number;
  natRangeMin?: number;
  natRangeMax?: number;
  natTolerance?: number;
  summaryText: string;
  pdfUrl?: string;
  isOutOf2027Syllabus: boolean;
}

export interface CanonicalSubjectResult {
  subjectId: SubjectId;
  subtopicOverride?: string;
  extraTags: string[];
}

const REMOVED_2027_KEYWORDS = [
  'secondary storage',
  'magnetic disk',
  'disk scheduling',
  'disk management',
  'arp',
  'icmp',
  'dhcp',
  'smtp',
  'ftp',
  'udp',
  'user datagram protocol',
  'pop3',
  'imap',
];

/**
 * Canonical 12 -> 11 Subject Normalizer:
 * Maps Discrete Mathematics (`dm`) under `em` (Engineering Mathematics) while preserving
 * `subtopic: "Discrete Mathematics"` and tag `"discrete-mathematics"`, and normalizes all
 * subject aliases (`DB`, `COA`, `PDS`, `C Programming`, `CO & Architecture`, etc.).
 */
export function normalizeCanonicalSubjectId(
  rawSubject?: string,
  rawTopic?: string,
  rawText?: string
): CanonicalSubjectResult {
  const s = String(rawSubject ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  // 1. Discrete Mathematics -> Engineering Mathematics ('em') with preserved DM metadata
  if (
    s === 'dm' ||
    s === 'discrete' ||
    s === 'discrete math' ||
    s === 'discrete mathematics' ||
    s.includes('discrete math')
  ) {
    return {
      subjectId: 'em',
      subtopicOverride: 'Discrete Mathematics',
      extraTags: ['discrete-mathematics'],
    };
  }

  // 2. Direct code & alias matches
  if (s === 'ga' || s.includes('general aptitude') || s === 'aptitude') {
    return { subjectId: 'ga', extraTags: [] };
  }
  if (s === 'em' || s.includes('engineering math') || s === 'mathematics' || s === 'maths') {
    return { subjectId: 'em', extraTags: [] };
  }
  if (s === 'dl' || s.includes('digital logic') || s === 'digital') {
    return { subjectId: 'dl', extraTags: [] };
  }
  if (
    s === 'coa' ||
    s.includes('computer organization') ||
    s.includes('co & architecture') ||
    s.includes('co and architecture') ||
    s.includes('computer architecture')
  ) {
    return { subjectId: 'coa', extraTags: [] };
  }
  if (
    s === 'cprog' ||
    s === 'c programming' ||
    s === 'programming in c' ||
    s === 'c' ||
    (s.includes('programming') && !s.includes('data structure'))
  ) {
    return { subjectId: 'cprog', extraTags: ['c-programming'] };
  }
  if (s === 'ds' || s === 'dsa' || (s.includes('data structure') && !s.includes('programming'))) {
    return { subjectId: 'ds', extraTags: ['data-structures'] };
  }
  if (s === 'pds' || (s.includes('programming') && s.includes('data structure'))) {
    const resolved = classifyPdsToCprogOrDs({ subtopic: rawTopic, text: rawText });
    return {
      subjectId: resolved,
      extraTags: [resolved === 'cprog' ? 'c-programming' : 'data-structures'],
    };
  }
  if (s === 'algo' || s === 'algos' || s.includes('algorithm')) {
    return { subjectId: 'algo', extraTags: [] };
  }
  if (
    s === 'toc' ||
    s.includes('theory of computation') ||
    s.includes('automata') ||
    s.includes('formal language')
  ) {
    return { subjectId: 'toc', extraTags: [] };
  }
  if (s === 'cd' || s.includes('compiler')) {
    return { subjectId: 'cd', extraTags: [] };
  }
  if (s === 'os' || s.includes('operating system')) {
    return { subjectId: 'os', extraTags: [] };
  }
  if (s === 'db' || s === 'dbms' || s.includes('database')) {
    return { subjectId: 'dbms', extraTags: [] };
  }
  if (s === 'cn' || s.includes('computer network') || s === 'networks' || s === 'networking') {
    return { subjectId: 'cn', extraTags: [] };
  }

  // 3. Fallback inference from topic / text when subject is 'OLD' or omitted
  const hay = `${rawTopic ?? ''} ${rawText ?? ''}`.toLowerCase();
  if (/\b(propositional|predicate|poset|lattice|combinator|graph theory|group theory|set theory|relation)\b/.test(hay)) {
    return {
      subjectId: 'em',
      subtopicOverride: 'Discrete Mathematics',
      extraTags: ['discrete-mathematics'],
    };
  }
  if (/\b(compiler|parser|lalr|slr|ll\(1\)|lexical|three-address|syntax-directed)\b/.test(hay)) {
    return { subjectId: 'cd', extraTags: [] };
  }
  if (/\b(dfa|nfa|turing|context-free|pumping lemma|regular language|decidable|undecidable|pda)\b/.test(hay)) {
    return { subjectId: 'toc', extraTags: [] };
  }
  if (/\b(paging|page fault|deadlock|semaphore|scheduling|fork\(\)|virtual memory|inode|thread)\b/.test(hay)) {
    return { subjectId: 'os', extraTags: [] };
  }
  if (/\b(bcnf|3nf|functional dependenc|relational algebra|sql|serializab|b\+\s*tree|2pl|transaction)\b/.test(hay)) {
    return { subjectId: 'dbms', extraTags: [] };
  }
  if (/\b(tcp|udp|subnet|ipv4|cidr|csma|sliding window|routing|crc|ethernet|dns|http|socket)\b/.test(hay)) {
    return { subjectId: 'cn', extraTags: [] };
  }
  if (/\b(cache|pipeline|hit ratio|addressing mode|dma|interrupt|alu|datapath)\b/.test(hay)) {
    return { subjectId: 'coa', extraTags: [] };
  }
  if (/\b(flip-flop|k-map|multiplexer|boolean|two'?s complement|ieee\s*754|nand|nor|sequential circuit|counter)\b/.test(hay)) {
    return { subjectId: 'dl', extraTags: [] };
  }
  if (/\b(asymptotic|dynamic programming|dijkstra|kruskal|quicksort|mergesort|np-complete|mst|recurrence|shortest path)\b/.test(hay)) {
    return { subjectId: 'algo', extraTags: [] };
  }
  if (/\b(#include|printf|malloc|pointer|recursion|static\s+int|sizeof|struct)\b/.test(hay)) {
    return { subjectId: 'cprog', extraTags: ['c-programming'] };
  }
  if (/\b(linked list|bst|avl|heap|stack|queue|binary tree|hashing|adjacency list)\b/.test(hay)) {
    return { subjectId: 'ds', extraTags: ['data-structures'] };
  }
  if (/\b(eigenvalue|matrix|determinant|probability|bayes|integral|calculus|limit|derivative)\b/.test(hay)) {
    return { subjectId: 'em', extraTags: [] };
  }

  return { subjectId: 'ga', extraTags: [] };
}

export function detectArshanRemoved2027(topic?: string, text?: string): boolean {
  const hay = `${topic ?? ''} ${text ?? ''}`.toLowerCase();
  if (!hay.trim()) return false;
  for (const kw of REMOVED_2027_KEYWORDS) {
    if (kw.length <= 4) {
      const re = new RegExp(`\\b${kw}\\b`, 'i');
      if (re.test(hay)) return true;
    } else if (hay.includes(kw)) {
      return true;
    }
  }
  return false;
}

function escapeHtmlBasic(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Converts safe Markdown + KaTeX + fenced code blocks from Arshan repo JSON/MD into
 * clean sanitized HTML ready for RichQuestionContent (zero eval, zero raw HTML injection).
 */
export function renderArshanMarkdownToSafeHtml(rawMarkdown: string): string {
  const src = String(rawMarkdown ?? '').trim();
  if (!src) return '';

  // 1. Protect fenced code blocks first
  const codeBlocks: string[] = [];
  let text = src.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const idx = codeBlocks.length;
    const safeLang = lang.replace(/[^a-zA-Z0-9_-]/g, '');
    codeBlocks.push(
      `<pre><code${safeLang ? ` class="language-${safeLang}"` : ''}>${escapeHtmlBasic(code.replace(/\n$/, ''))}</code></pre>`
    );
    return `@@ARSHAN_FENCE_${idx}@@`;
  });

  // 2. Protect inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtmlBasic(code)}</code>`);
    return `@@ARSHAN_CODE_${idx}@@`;
  });

  // 3. Protect display and inline LaTeX math (leave delimiters intact so RichQuestionContent renders KaTeX)
  const mathBlocks: string[] = [];
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m) => {
    const idx = mathBlocks.length;
    mathBlocks.push(escapeHtmlBasic(m));
    return `@@ARSHAN_MATH_${idx}@@`;
  });
  text = text.replace(/(?<!\\)\$(?!\s)([^$\n]{1,500}?)(?<!\s)\$/g, (m) => {
    const idx = mathBlocks.length;
    mathBlocks.push(escapeHtmlBasic(m));
    return `@@ARSHAN_MATH_${idx}@@`;
  });

  // 4. Escape all remaining raw HTML in prose
  text = escapeHtmlBasic(text);

  // 5. Inline emphasis (**bold**, *italic*)
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');

  // 6. Block-level formatting (paragraphs, simple markdown tables, bullet lists)
  const blocks = text.split(/\n{2,}/);
  const htmlParts: string[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    if (/^@@ARSHAN_FENCE_\d+@@$/.test(block)) {
      htmlParts.push(block);
      continue;
    }

    const lines = block.split('\n');

    // Markdown table block
    if (
      lines.length >= 2 &&
      lines[0].includes('|') &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[1])
    ) {
      const parseRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const headers = parseRow(lines[0]);
      const bodyRows = lines.slice(2).map(parseRow);
      const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      htmlParts.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // Unordered list block
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      const items = lines.map((l) => `<li>${l.replace(/^\s*[-*]\s+/, '')}</li>`).join('');
      htmlParts.push(`<ul>${items}</ul>`);
      continue;
    }

    htmlParts.push(`<p>${lines.join('<br/>')}</p>`);
  }

  let out = htmlParts.join('\n');

  // 7. Restore placeholders
  out = out.replace(/@@ARSHAN_MATH_(\d+)@@/g, (_m, i: string) => mathBlocks[Number(i)] ?? '');
  out = out.replace(/@@ARSHAN_CODE_(\d+)@@/g, (_m, i: string) => inlineCodes[Number(i)] ?? '');
  out = out.replace(/@@ARSHAN_FENCE_(\d+)@@/g, (_m, i: string) => codeBlocks[Number(i)] ?? '');

  return out;
}

export function stripMarkdownToPlainText(md: string): string {
  return String(md ?? '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z0-9_+-]*\n?/g, '').replace(/```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ParsedAnswerKey {
  hasKey: boolean;
  correctOption?: string;
  correctOptions?: string[];
  natAnswer?: number;
  natRangeMin?: number;
  natRangeMax?: number;
  natTolerance?: number;
}

/**
 * Parses answer keys across MCQ ("A"), MSQ (["A","B"] or "A,B,D"), and NAT
 * ({min, max}, "509 to 509", "10.5 to 11.5", "to 5", "42.5").
 */
export function parseArshanAnswerKey(rawAnswer: unknown, format: QuestionFormat): ParsedAnswerKey {
  if (rawAnswer === null || rawAnswer === undefined) {
    return { hasKey: false };
  }

  // Handle "MTA" (Marks to All) gracefully without bogus keys
  if (typeof rawAnswer === 'string' && /^\s*(mta|marks\s*to\s*all|dropped|null|n\/a)\s*$/i.test(rawAnswer)) {
    return { hasKey: false };
  }

  if (format === 'MCQ') {
    const str = Array.isArray(rawAnswer) ? String(rawAnswer[0] ?? '') : String(rawAnswer);
    const match = str.toUpperCase().match(/\b([A-E])\b/) ?? str.toUpperCase().match(/([A-E])/);
    if (match) {
      return { hasKey: true, correctOption: match[1] };
    }
    return { hasKey: false };
  }

  if (format === 'MSQ') {
    const tokens = Array.isArray(rawAnswer)
      ? rawAnswer.map((x) => String(x).trim().toUpperCase())
      : String(rawAnswer)
          .toUpperCase()
          .split(/[\s,;/|]+/)
          .map((x) => x.replace(/[^A-E]/g, ''));
    const clean = Array.from(new Set(tokens.filter((x) => /^[A-E]$/.test(x)))).sort();
    if (clean.length > 0) {
      return { hasKey: true, correctOptions: clean };
    }
    return { hasKey: false };
  }

  // NAT
  if (typeof rawAnswer === 'number' && Number.isFinite(rawAnswer)) {
    return {
      hasKey: true,
      natAnswer: rawAnswer,
      natRangeMin: rawAnswer,
      natRangeMax: rawAnswer,
      natTolerance: 0.01,
    };
  }

  if (typeof rawAnswer === 'object' && rawAnswer !== null) {
    const obj = rawAnswer as { min?: unknown; max?: unknown; value?: unknown };
    const minN = typeof obj.min === 'number' ? obj.min : Number(obj.min);
    const maxN = typeof obj.max === 'number' ? obj.max : Number(obj.max);
    if (Number.isFinite(minN) && Number.isFinite(maxN)) {
      const low = Math.min(minN, maxN);
      const high = Math.max(minN, maxN);
      const mid = Number(((low + high) / 2).toFixed(4));
      const tol = Number(Math.max(0.01, (high - low) / 2).toFixed(4));
      return {
        hasKey: true,
        natAnswer: mid,
        natRangeMin: low,
        natRangeMax: high,
        natTolerance: tol,
      };
    }
    const valN = Number(obj.value);
    if (Number.isFinite(valN)) {
      return { hasKey: true, natAnswer: valN, natRangeMin: valN, natRangeMax: valN, natTolerance: 0.01 };
    }
    return { hasKey: false };
  }

  const str = String(rawAnswer).trim();
  // Pattern: "509 to 509", "10.2 to 10.6", "10.2 - 10.6"
  const rangeMatch = str.match(/(-?\d+(?:\.\d+)?)\s*(?:to|–|—|-)\s*(-?\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const mid = Number(((low + high) / 2).toFixed(4));
      const tol = Number(Math.max(0.01, (high - low) / 2).toFixed(4));
      return {
        hasKey: true,
        natAnswer: mid,
        natRangeMin: low,
        natRangeMax: high,
        natTolerance: tol,
      };
    }
  }

  // Pattern: "to 5" (OCR quirk in GATE PDFs where "5 to 5" dropped first token)
  const trailingNum = str.match(/^(?:to\s+)?(-?\d+(?:\.\d+)?)$/i);
  if (trailingNum) {
    const n = Number(trailingNum[1]);
    if (Number.isFinite(n)) {
      return { hasKey: true, natAnswer: n, natRangeMin: n, natRangeMax: n, natTolerance: 0.01 };
    }
  }

  return { hasKey: false };
}

function slugifyTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Normalizes a structured question JSON payload from `arshanalikhan/gate-cse`
 * (e.g. `data/predicted-2027.json` or any extra practice JSON with `questions: [...]`).
 */
export function normalizeArshanStructuredQuestions(
  rawPayload: unknown,
  sourcePath: string,
  branch = 'main'
): Question[] {
  const lowerPath = sourcePath.toLowerCase();
  const isPredicted2027 = lowerPath.includes('predicted-2027') || lowerPath.includes('predicted_2027');
  const defaultCategory: QuestionSourceCategory = isPredicted2027
    ? 'PREDICTED_2027'
    : lowerPath.includes('pyq')
    ? 'PYQ'
    : 'EXTRA_PRACTICE';

  let list: unknown[] = [];
  if (Array.isArray(rawPayload)) {
    list = rawPayload;
  } else if (rawPayload && typeof rawPayload === 'object') {
    const obj = rawPayload as Record<string, unknown>;
    if (Array.isArray(obj.questions)) {
      list = obj.questions;
    } else if (Array.isArray(obj.items)) {
      list = obj.items;
    }
  }

  const results: Question[] = [];
  const seenIds = new Set<string>();
  const safeBranch = /^[a-zA-Z0-9._-]+$/.test(branch) ? branch : 'main';
  const defaultRepoUrl = isPredicted2027
    ? `https://github.com/arshanalikhan/gate-cse/blob/${safeBranch}/content/predicted-2027.md`
    : `https://github.com/arshanalikhan/gate-cse/blob/${safeBranch}/${sourcePath.replace(/^\/+/, '')}`;

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;

    const rawText = String(item.text ?? item.prompt ?? item.question ?? '').trim();
    const rawOptions = Array.isArray(item.options) ? item.options : null;

    // Require genuine playable question content (avoid short topic-index metadata rows)
    const hasOptions = Boolean(rawOptions && rawOptions.length >= 2);
    if (rawText.length < 15) continue;
    if (!hasOptions && String(item.type ?? '').toUpperCase() !== 'NAT' && rawText.length < 70) {
      continue;
    }

    const rawType = String(item.type ?? item.format ?? 'MCQ').trim().toUpperCase();
    const format: QuestionFormat =
      rawType === 'MSQ' ? 'MSQ' : rawType === 'NAT' ? 'NAT' : 'MCQ';

    const marks: 1 | 2 = item.marks === 1 || String(item.marks) === '1' ? 1 : 2;
    const rawTopicName = String(item.topic_name ?? item.subtopic ?? item.topic ?? '').trim();
    const subjNorm = normalizeCanonicalSubjectId(
      String(item.subject ?? item.subjectId ?? item.section ?? ''),
      rawTopicName,
      rawText
    );

    const subtopic = subjNorm.subtopicOverride
      ? rawTopicName && rawTopicName.toLowerCase() !== 'discrete mathematics'
        ? `Discrete Mathematics · ${rawTopicName}`
        : subjNorm.subtopicOverride
      : rawTopicName || 'Core Concepts';

    const rawNo = item.no ?? item.qno ?? i + 1;
    const qNoStr = String(rawNo).replace(/[^a-zA-Z0-9_-]/g, '');
    const idPrefix = isPredicted2027 ? 'arshan_pred2027' : `arshan_${slugifyTag(sourcePath)}`;
    const id = `${idPrefix}_q${qNoStr || i + 1}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const parsedKey = parseArshanAnswerKey(item.answer ?? item.correctAnswer ?? item.key, format);
    const options: QuestionOption[] | undefined =
      format === 'NAT'
        ? undefined
        : rawOptions && rawOptions.length >= 2
        ? rawOptions.slice(0, 6).map((opt, idx) => {
            if (opt && typeof opt === 'object') {
              const o = opt as { id?: unknown; text?: unknown };
              return {
                id: typeof o.id === 'string' && o.id ? o.id : String.fromCharCode(65 + idx),
                text: renderArshanMarkdownToSafeHtml(String(o.text ?? '')).replace(
                  /^<p>([\s\S]*)<\/p>$/,
                  '$1'
                ),
              };
            }
            return {
              id: String.fromCharCode(65 + idx),
              text: renderArshanMarkdownToSafeHtml(String(opt)).replace(
                /^<p>([\s\S]*)<\/p>$/,
                '$1'
              ),
            };
          })
        : undefined;

    const yearNum =
      typeof item.year === 'number' && Number.isFinite(item.year)
        ? item.year
        : isPredicted2027
        ? 2027
        : undefined;

    const tags = Array.from(
      new Set([
        ...subjNorm.extraTags,
        ...(rawTopicName ? [slugifyTag(rawTopicName)] : []),
        ...(isPredicted2027 ? ['predicted-2027', 'arshan-mock'] : ['arshan-bank']),
        `${marks}-mark`,
      ])
    ).filter(Boolean);

    const isOutOf2027Syllabus = isPredicted2027
      ? false // Predicted GATE 2027 paper is explicitly aligned to the revised 2027 syllabus
      : detectArshanRemoved2027(rawTopicName, rawText);

    const difficulty: DifficultyLevel =
      marks === 1 ? 'Easy' : format === 'MSQ' || format === 'NAT' ? 'Hard' : 'Medium';

    const title = isPredicted2027
      ? `Predicted GATE 2027 · Q.${qNoStr || i + 1}`
      : typeof item.title === 'string' && item.title.trim()
      ? item.title.trim()
      : `Arshan Practice · Q.${qNoStr || i + 1}`;

    const explanation = String(item.solution ?? item.explanation ?? '').trim();
    const whyNote = String(item.why ?? item.wrongOptionAnalysis ?? '').trim();

    results.push({
      id,
      title,
      subjectId: subjNorm.subjectId,
      subtopic,
      format,
      marks,
      difficulty,
      sourceTag: isPredicted2027 ? `Predicted GATE 2027 · Q.${qNoStr || i + 1}` : title,
      sourceUrl: defaultRepoUrl,
      sourceCategory: defaultCategory,
      sourceRepo: 'arshan',
      isArshan: true,
      year: yearNum,
      paperTag: isPredicted2027 ? 'predicted-2027' : yearNum ? `arshan-${yearNum}` : 'arshan-extra',
      tags,
      prompt: stripMarkdownToPlainText(rawText),
      bodyHtml: renderArshanMarkdownToSafeHtml(rawText),
      options,
      optionsExtracted: Boolean(options && options.length >= 2),
      hasAnswerKey: parsedKey.hasKey,
      isOutOf2027Syllabus,
      correctOption: parsedKey.correctOption,
      correctOptions: parsedKey.correctOptions,
      natAnswer: parsedKey.natAnswer,
      natRangeMin: parsedKey.natRangeMin,
      natRangeMax: parsedKey.natRangeMax,
      natTolerance: parsedKey.natTolerance,
      explanation,
      wrongOptionAnalysis: whyNote,
    });
  }

  return results;
}

/**
 * Extracts official GATE CSE 2022–2026 PYQ answer key index records from `data/pyq.json`
 * (and any playable full-text PYQs if present).
 */
export function extractArshanPyqData(
  rawPayload: unknown,
  branch = 'main'
): { pyqAnswerKeys: ArshanPyqKeyRecord[]; playablePyqs: Question[] } {
  const list = Array.isArray(rawPayload) ? rawPayload : [];
  const safeBranch = /^[a-zA-Z0-9._-]+$/.test(branch) ? branch : 'main';
  const pyqAnswerKeys: ArshanPyqKeyRecord[] = [];
  const playablePyqs: Question[] = [];

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;

    const year = typeof item.year === 'number' ? item.year : Number(item.year);
    const qno = typeof item.qno === 'number' ? item.qno : Number(item.qno);
    if (!Number.isFinite(year) || !Number.isFinite(qno)) continue;

    const rawType = String(item.type ?? 'MCQ').trim().toUpperCase();
    const format: QuestionFormat =
      rawType === 'MSQ' ? 'MSQ' : rawType === 'NAT' ? 'NAT' : 'MCQ';

    const marks: 1 | 2 = item.marks === 1 || String(item.marks) === '1' ? 1 : 2;
    const topicName = String(item.topic_name ?? item.topic ?? '').trim();
    const summaryText = String(item.text ?? '').trim();

    const subjNorm = normalizeCanonicalSubjectId(
      String(item.subject ?? ''),
      topicName,
      summaryText
    );

    const parsedKey = parseArshanAnswerKey(item.key ?? item.answer, format);
    const pdfPath =
      typeof item.pdf === 'string' && item.pdf.trim() && !item.pdf.includes('..')
        ? item.pdf.trim().replace(/^\/+/, '')
        : '';
    const pdfUrl = pdfPath
      ? `https://github.com/arshanalikhan/gate-cse/blob/${safeBranch}/${pdfPath}`
      : undefined;

    const setNum =
      item.set === 1 || String(item.set) === '1'
        ? 1
        : item.set === 2 || String(item.set) === '2'
        ? 2
        : null;

    const isOutOf2027Syllabus = detectArshanRemoved2027(topicName, summaryText);

    if (parsedKey.hasKey) {
      // GATE CS papers number GA as Q.1..Q.10 and CS core as Q.11..Q.65
      const csQno = qno > 10 ? qno - 10 : qno;
      pyqAnswerKeys.push({
        paper: String(item.paper ?? year),
        year,
        set: setNum,
        qno,
        csQno,
        subjectId: subjNorm.subjectId,
        subtopic: subjNorm.subtopicOverride
          ? topicName
            ? `Discrete Mathematics · ${topicName}`
            : subjNorm.subtopicOverride
          : topicName || 'Core Concepts',
        extraTags: subjNorm.extraTags,
        format,
        marks,
        correctOption: parsedKey.correctOption,
        correctOptions: parsedKey.correctOptions,
        natAnswer: parsedKey.natAnswer,
        natRangeMin: parsedKey.natRangeMin,
        natRangeMax: parsedKey.natRangeMax,
        natTolerance: parsedKey.natTolerance,
        summaryText,
        pdfUrl,
        isOutOf2027Syllabus,
      });
    }

    // If a future update to data/pyq.json includes full options/stems, also ingest as playable PYQs
    if (Array.isArray(item.options) && item.options.length >= 2 && summaryText.length >= 25) {
      const normalized = normalizeArshanStructuredQuestions([item], 'data/pyq.json', safeBranch);
      if (normalized.length > 0) {
        playablePyqs.push({
          ...normalized[0],
          id: `arshan_pyq_${year}_${setNum ?? 0}_q${qno}`,
          sourceCategory: 'PYQ',
          sourceUrl: pdfUrl ?? normalized[0].sourceUrl,
        });
      }
    }
  }

  return { pyqAnswerKeys, playablePyqs };
}

/**
 * Safely extracts structured question blocks from Markdown files (e.g. `content/predicted-2027.md`
 * or future practice `.md` files). Zero eval; purely declarative regex parsing.
 */
export function extractQuestionsFromArshanMarkdown(
  markdown: string,
  sourcePath: string,
  branch = 'main'
): Question[] {
  const src = String(markdown ?? '');
  if (src.length < 100) return [];

  const lowerPath = sourcePath.toLowerCase();
  const isPredicted2027 = lowerPath.includes('predicted-2027') || lowerPath.includes('predicted_2027');
  const category: QuestionSourceCategory = isPredicted2027
    ? 'PREDICTED_2027'
    : lowerPath.includes('pyq')
    ? 'PYQ'
    : 'EXTRA_PRACTICE';

  // Split by ### Q.1 / ### Q1 / ## Q.1 headings
  const parts = src.split(/(?=^#{2,3}\s+Q\.?\s*\d+\b)/gm);
  const questions: Question[] = [];
  const safeBranch = /^[a-zA-Z0-9._-]+$/.test(branch) ? branch : 'main';

  for (const part of parts) {
    const headerMatch = part.match(/^#{2,3}\s+Q\.?\s*(\d+)[^\n]*/);
    if (!headerMatch) continue;
    const qNum = Number(headerMatch[1]);
    const headerLine = headerMatch[0];
    const body = part.slice(headerLine.length).trim();
    if (body.length < 30) continue;

    // Detect format & marks from header line (e.g., "### Q.14 · 1 mark · MSQ · Digital Logic")
    const format: QuestionFormat = /\bMSQ\b/i.test(headerLine)
      ? 'MSQ'
      : /\bNAT\b/i.test(headerLine)
      ? 'NAT'
      : 'MCQ';
    const marks: 1 | 2 = /\b1\s*-?\s*mark\b/i.test(headerLine) ? 1 : 2;

    // Handle collapsible <details><summary>Answer...</summary>...</details> blocks cleanly
    const detailsMatch = body.match(/<details[\s\S]*?<\/details>/i);
    const detailsInner = detailsMatch
      ? detailsMatch[0]
          .replace(/<details[^>]*>/i, '')
          .replace(/<\/details>/i, '')
          .replace(/<summary[\s\S]*?<\/summary>/i, '')
          .trim()
      : '';
    const bodyWithoutDetails = detailsMatch
      ? (body.slice(0, detailsMatch.index) + '\n' + body.slice((detailsMatch.index ?? 0) + detailsMatch[0].length)).trim()
      : body;

    const searchAnswerIn = detailsInner || bodyWithoutDetails;
    const ansMatch = searchAnswerIn.match(/(?:\*\*)?(?:Answer|Key)\s*:?(?:\*\*)?\s*([^\n]+)/i);
    const solMatch = searchAnswerIn.match(/(?:\*\*)?(?:Solution|Explanation)\s*:?(?:\*\*)?\s*([\s\S]+?)(?=\n(?:\*\*)?(?:Why|Note)\s*:?(?:\*\*)?|\n---|\n#{2,3}\s|$)/i);
    const whyMatch = searchAnswerIn.match(/(?:\*\*)?(?:Why[^:*\n]*|Note)\s*:?(?:\*\*)?\s*([\s\S]+?)(?=\n---|\n#{2,3}\s|$)/i);

    const inlineAnsIdx = !detailsMatch && ansMatch?.index !== undefined ? ansMatch.index : bodyWithoutDetails.length;
    const inlineSolIdx = !detailsMatch && solMatch?.index !== undefined ? solMatch.index : bodyWithoutDetails.length;
    const stemEndIdx = Math.min(inlineAnsIdx, inlineSolIdx, bodyWithoutDetails.length);
    const stemAndOpts = bodyWithoutDetails.slice(0, stemEndIdx).trim();

    // Extract trailing options like "- **(A)** ...", "- (A) ...", "(A) ...", or "A. ..."
    const optRegex = /^(?:[-*]\s*)?(?:\*\*)?\(?([A-D])\)?(?:\*\*)?[.)]?\s+(.+)$/gm;
    const options: QuestionOption[] = [];
    let firstOptIdx = stemAndOpts.length;
    let m: RegExpExecArray | null;
    while ((m = optRegex.exec(stemAndOpts)) !== null) {
      if (options.length === 0) firstOptIdx = m.index;
      options.push({
        id: m[1].toUpperCase(),
        text: renderArshanMarkdownToSafeHtml(m[2].trim()).replace(/^<p>([\s\S]*)<\/p>$/, '$1'),
      });
    }

    const stemRaw = stemAndOpts
      .slice(0, firstOptIdx)
      .replace(/^\*Topic:[^*\n]*\*\s*\n?/i, '')
      .trim();
    if (stemRaw.length < 15) continue;

    const parsedKey = parseArshanAnswerKey(ansMatch?.[1]?.trim(), format);
    const subjNorm = normalizeCanonicalSubjectId(headerLine, headerLine, stemRaw);
    const id = `arshan_md_${slugifyTag(sourcePath)}_q${qNum}`;

    questions.push({
      id,
      title: isPredicted2027 ? `Predicted GATE 2027 · Q.${qNum}` : `Arshan Practice · Q.${qNum}`,
      subjectId: subjNorm.subjectId,
      subtopic: subjNorm.subtopicOverride ?? 'Core Concepts',
      format,
      marks,
      difficulty: marks === 1 ? 'Easy' : 'Medium',
      sourceTag: isPredicted2027 ? `Predicted GATE 2027 · Q.${qNum}` : `Arshan · Q.${qNum}`,
      sourceUrl: `https://github.com/arshanalikhan/gate-cse/blob/${safeBranch}/${sourcePath.replace(/^\/+/, '')}`,
      sourceCategory: category,
      sourceRepo: 'arshan',
      isArshan: true,
      year: isPredicted2027 ? 2027 : undefined,
      paperTag: isPredicted2027 ? 'predicted-2027' : 'arshan-md',
      tags: Array.from(new Set([...subjNorm.extraTags, isPredicted2027 ? 'predicted-2027' : 'arshan-bank'])),
      prompt: stripMarkdownToPlainText(stemRaw),
      bodyHtml: renderArshanMarkdownToSafeHtml(stemRaw),
      options: format === 'NAT' ? undefined : options.length >= 2 ? options : undefined,
      optionsExtracted: options.length >= 2,
      hasAnswerKey: parsedKey.hasKey,
      isOutOf2027Syllabus: isPredicted2027 ? false : detectArshanRemoved2027(headerLine, stemRaw),
      correctOption: parsedKey.correctOption,
      correctOptions: parsedKey.correctOptions,
      natAnswer: parsedKey.natAnswer,
      natRangeMin: parsedKey.natRangeMin,
      natRangeMax: parsedKey.natRangeMax,
      natTolerance: parsedKey.natTolerance,
      explanation: solMatch?.[1]?.trim() ?? '',
      wrongOptionAnalysis: whyMatch?.[1]?.trim() ?? '',
    });
  }

  return questions;
}

/**
 * Safely scans a `.js` file for static embedded JSON question arrays without ever using eval().
 * Returns [] for controller scripts like `mock/mock.js` that load data from `../data/predicted-2027.json`.
 */
export function extractEmbeddedQuestionsFromJsSafe(
  jsSource: string,
  sourcePath: string,
  branch = 'main'
): Question[] {
  // Only look for explicit JSON-like array declarations named QUESTIONS / BANK / MOCK_DATA
  const match = jsSource.match(
    /(?:const|let|var)\s+(?:QUESTIONS|QUESTION_BANK|MOCK_QUESTIONS|PYQ_DATA)\s*=\s*(\[[\s\S]*?\])\s*;/
  );
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    return normalizeArshanStructuredQuestions(parsed, sourcePath, branch);
  } catch {
    return [];
  }
}

export function normalizeTextForFingerprint(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Canonical cross-repo fingerprint:
 * `normalizeText(first120Chars of prompt) + year + subjectId`
 */
export function computeCrossRepoFingerprint(q: Pick<Question, 'title' | 'prompt' | 'year' | 'subjectId'>): string {
  const promptNorm = normalizeTextForFingerprint(q.prompt).slice(0, 120);
  const titleNorm = normalizeTextForFingerprint(q.title ?? '').slice(0, 60);
  const basis = promptNorm.length >= 20 ? promptNorm : `${titleNorm} ${promptNorm}`.trim().slice(0, 120);
  return `${q.subjectId}::${q.year ?? 'any'}::${basis}`;
}

/**
 * Prompt + options normalized hash for strict deduplication regardless of repo/title differences,
 * while preventing false collisions on generic GATE stems ("Which one of the following is TRUE?").
 */
export function computePromptContentHash(
  q: Pick<Question, 'prompt' | 'subjectId' | 'format' | 'options' | 'bodyHtml'>
): string {
  const promptNorm = normalizeTextForFingerprint(q.prompt).slice(0, 180);
  const optionsNorm =
    Array.isArray(q.options) && q.options.length > 0
      ? normalizeTextForFingerprint(q.options.map((o) => o.text).join(' ')).slice(0, 160)
      : promptNorm.length < 90 && q.bodyHtml
      ? normalizeTextForFingerprint(q.bodyHtml).slice(0, 220)
      : '';
  return `${q.subjectId}::${q.format}::${promptNorm}${optionsNorm ? `::${optionsNorm}` : ''}`;
}

/**
 * Extracts `{ year, set, csQno }` from a GateR question title/paperTag
 * (e.g. "GATE CSE 2022 | Question: 14" -> { year: 2022, set: null, csQno: 14 }).
 * Skips GA questions ("GA Question: ...") so GA Q.1 never collides with CS Q.1.
 */
export function extractGateRCsPaperCoords(
  q: Pick<Question, 'title' | 'year' | 'paperTag' | 'subjectId' | 'tags'>
): { year: number; set: number | null; csQno: number } | null {
  if (q.subjectId === 'ga') return null;
  const title = q.title ?? '';
  if (/\bGA\s+Question\b/i.test(title)) return null;

  const qMatch = title.match(/\bQuestion\s*:\s*(\d+)\b/i);
  if (!qMatch) return null;
  const csQno = Number(qMatch[1]);
  if (!Number.isFinite(csQno) || csQno < 1 || csQno > 65) return null;

  const year = q.year ?? (() => {
    const ym = `${title} ${q.paperTag ?? ''}`.match(/\b(20\d{2})\b/);
    return ym ? Number(ym[1]) : undefined;
  })();
  if (!year) return null;

  const setMatch = `${title} ${q.paperTag ?? ''}`.match(/\bset\s*[-_]?\s*([12])\b/i);
  const set = setMatch ? Number(setMatch[1]) : null;

  return { year, set, csQno };
}

export interface MergedBankStats {
  totalCount: number;
  gaterCount: number;
  arshanCount: number;
  enrichedCount: number;
  verifiedCount: number;
  predicted2027Count: number;
  extraPracticeCount: number;
}

export function questionHasAnswerKey(q: Question): boolean {
  if (q.hasAnswerKey === true) return true;
  if (q.format === 'MCQ') return Boolean(q.correctOption && q.correctOption.trim().length > 0);
  if (q.format === 'MSQ') return Boolean(q.correctOptions && q.correctOptions.length > 0);
  return (
    (typeof q.natAnswer === 'number' && Number.isFinite(q.natAnswer)) ||
    (typeof q.natRangeMin === 'number' && Number.isFinite(q.natRangeMin))
  );
}

/**
 * Smart Cross-Repo Merge & Answer Enrichment:
 * 1. Enriches existing GateR PYQs that lack answer keys using Arshan's official 2022–2026 PYQ
 *    answer key index (matched by exact `(year, set, csQno)` + format/marks verification) OR
 *    by normalized text fingerprint — ZERO duplication!
 * 2. Appends all unique playable Arshan questions (Predicted GATE 2027 paper, Extra Practice,
 *    and non-overlapping PYQs), deduplicating strictly by `id` and normalized content hash.
 */
export function mergeQuestionBanks(
  gaterQuestions: Question[],
  arshanQuestions: Question[],
  arshanPyqKeys: ArshanPyqKeyRecord[] = []
): { questions: Question[]; stats: MergedBankStats } {
  // Index Arshan official PYQ answer keys by (year, set, csQno)
  const keyByCoords = new Map<string, ArshanPyqKeyRecord>();
  for (const k of arshanPyqKeys) {
    const coordKey = `${k.year}_${k.set ?? 0}_${k.csQno}`;
    keyByCoords.set(coordKey, k);
  }

  // Index full-text Arshan PYQs by normalized cross-repo fingerprint for enrichment matching
  const arshanPyqByFp = new Map<string, Question>();
  const matchedArshanIds = new Set<string>();
  for (const aq of arshanQuestions) {
    if ((aq.sourceCategory ?? 'PYQ') === 'PYQ') {
      arshanPyqByFp.set(computeCrossRepoFingerprint(aq), aq);
    }
  }

  let enrichedCount = 0;
  const merged: Question[] = [];
  const seenIds = new Set<string>();
  const seenPromptHashes = new Set<string>();

  // Step 1: Process GateR questions and enrich in-place where Arshan has verified keys
  for (const rawG of gaterQuestions) {
    if (seenIds.has(rawG.id)) continue;
    const baseG: Question = {
      ...rawG,
      sourceCategory: rawG.sourceCategory ?? 'PYQ',
      sourceRepo: rawG.sourceRepo ?? 'gater',
      isGateR: true,
    };

    let enriched = baseG;
    const alreadyHasKey = questionHasAnswerKey(baseG);

    if (!alreadyHasKey) {
      // Match 1: Exact text fingerprint against full-text Arshan PYQ
      const fp = computeCrossRepoFingerprint(baseG);
      const arshanMatch = arshanPyqByFp.get(fp);
      if (arshanMatch && questionHasAnswerKey(arshanMatch)) {
        matchedArshanIds.add(arshanMatch.id);
        enriched = {
          ...baseG,
          format: arshanMatch.format || baseG.format,
          hasAnswerKey: true,
          correctOption: arshanMatch.correctOption,
          correctOptions: arshanMatch.correctOptions,
          natAnswer: arshanMatch.natAnswer,
          natRangeMin: arshanMatch.natRangeMin,
          natRangeMax: arshanMatch.natRangeMax,
          natTolerance: arshanMatch.natTolerance ?? baseG.natTolerance,
          explanation: baseG.explanation || arshanMatch.explanation,
          wrongOptionAnalysis: baseG.wrongOptionAnalysis || arshanMatch.wrongOptionAnalysis,
          sourceRepo: 'merged',
          isArshan: true,
        };
        enrichedCount += 1;
      } else {
        // Match 2: Official GATE paper coordinate match (year, set, csQno) against Arshan data/pyq.json
        const coords = extractGateRCsPaperCoords(baseG);
        if (coords) {
          const rec = keyByCoords.get(`${coords.year}_${coords.set ?? 0}_${coords.csQno}`);
          if (rec && rec.marks === baseG.marks) {
            const officialNote = rec.summaryText
              ? `Official GATE ${rec.year} Answer Key synced from arshanalikhan/gate-cse (${rec.subtopic}: ${rec.summaryText}).`
              : `Official GATE ${rec.year} Answer Key synced from arshanalikhan/gate-cse.`;
            enriched = {
              ...baseG,
              format: rec.format,
              hasAnswerKey: true,
              correctOption: rec.correctOption,
              correctOptions: rec.correctOptions,
              natAnswer: rec.natAnswer,
              natRangeMin: rec.natRangeMin,
              natRangeMax: rec.natRangeMax,
              natTolerance: rec.natTolerance ?? (rec.format === 'NAT' ? 0.01 : undefined),
              explanation: baseG.explanation || officialNote,
              sourceRepo: 'merged',
              isArshan: true,
              tags: Array.from(new Set([...(baseG.tags ?? []), ...rec.extraTags])),
            };
            enrichedCount += 1;
          }
        }
      }
    }

    seenIds.add(enriched.id);
    seenPromptHashes.add(computePromptContentHash(enriched));
    merged.push(enriched);
  }

  // Step 2: Append all unique playable Arshan questions (Predicted 2027, Extra Practice, unique PYQs)
  let addedArshanUnique = 0;
  let predicted2027Count = 0;
  let extraPracticeCount = 0;

  for (const aq of arshanQuestions) {
    if (matchedArshanIds.has(aq.id)) continue;
    if (seenIds.has(aq.id)) continue;
    const pHash = computePromptContentHash(aq);
    if (seenPromptHashes.has(pHash)) continue;

    const cleanQ: Question = {
      ...aq,
      sourceCategory: aq.sourceCategory ?? 'EXTRA_PRACTICE',
      sourceRepo: 'arshan',
      isArshan: true,
    };

    seenIds.add(cleanQ.id);
    seenPromptHashes.add(pHash);
    merged.push(cleanQ);
    addedArshanUnique += 1;
    if (cleanQ.sourceCategory === 'PREDICTED_2027') predicted2027Count += 1;
    else if (cleanQ.sourceCategory === 'EXTRA_PRACTICE') extraPracticeCount += 1;
  }

  // Sort Predicted 2027 & newest papers cleanly at the top while keeping deterministic order
  merged.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  const verifiedCount = merged.filter((q) => questionHasAnswerKey(q)).length;

  return {
    questions: merged,
    stats: {
      totalCount: merged.length,
      gaterCount: gaterQuestions.length,
      arshanCount: addedArshanUnique + enrichedCount,
      enrichedCount,
      verifiedCount,
      predicted2027Count,
      extraPracticeCount,
    },
  };
}
