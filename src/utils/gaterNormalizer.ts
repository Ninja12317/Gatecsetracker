import type {
  DifficultyLevel,
  MistakeEntry,
  Question,
  QuestionAttemptRecord,
  QuestionFormat,
  QuestionOption,
  SubjectId,
  VerifiedAnswerRecord,
} from '../types';

export interface RawGateRItem {
  id?: string | number;
  title?: string;
  year?: string | number;
  link?: string;
  url?: string;
  solution_link?: string;
  question?: string;
  body?: string;
  html?: string;
  prompt?: string;
  tags?: string[] | string;
  marks?: number | string;
  type?: string;
  answer?: string | string[] | number;
  correctAnswer?: string | string[] | number;
  explanation?: string;
}

export const REMOVED_2027_TAGS = new Set<string>([
  'secondary-storage',
  'magnetic-disk',
  'disk-scheduling',
  'disk-management',
  'arp',
  'icmp',
  'dhcp',
  'smtp',
  'ftp',
  'udp',
  'user-datagram-protocol',
  'pop',
  'imap',
]);

// Meta tags that should not be displayed as primary subtopic labels
const META_TAGS = new Set<string>([
  'normal',
  'easy',
  'hard',
  'difficult',
  'descriptive',
  'numerical-answers',
  'multiple-selects',
  'multiple-choice',
  '1-mark',
  '2-marks',
  'mark-1',
  'mark-2',
  'marks-to-all',
  'out-of-syllabus',
  'gate',
  'general-aptitude',
  'engineering-mathematics',
  'digital-logic',
  'co-and-architecture',
  'computer-organization',
  'programming-in-c',
  'programming',
  'data-structures',
  'algorithms',
  'theory-of-computation',
  'compiler-design',
  'operating-system',
  'databases',
  'computer-networks',
  'discrete-mathematics',
]);

// Comprehensive GateOverflow tag -> 11 IIT Madras GATE CSE 2027 Subjects mapping
const TAG_TO_SUBJECT: Array<{ subjectId: SubjectId; patterns: string[] }> = [
  {
    subjectId: 'ga',
    patterns: [
      'general-aptitude',
      'quantitative-aptitude',
      'verbal-aptitude',
      'analytical-aptitude',
      'spatial-aptitude',
      'aptitude',
      'english-grammar',
      'data-interpretation',
      'reading-comprehension',
      'work-time',
      'speed-time-distance',
      'percentages',
      'ratios',
      'syllogism',
      'seating-arrangement',
      'clock',
      'calendar',
    ],
  },
  {
    subjectId: 'cd',
    patterns: [
      'compiler-design',
      'compilation-phases',
      'lexical-analysis',
      'parsing',
      'll-parser',
      'lr-parser',
      'slr',
      'lalr',
      'clr',
      'syntax-directed-translation',
      's-attributed',
      'l-attributed',
      'intermediate-code',
      'three-address-code',
      'ssa',
      'code-optimization',
      'live-variable',
      'data-flow-analysis',
      'runtime-environment',
      'activation-record',
      'register-allocation',
      'first-and-follow',
      'operator-precedence',
    ],
  },
  {
    subjectId: 'toc',
    patterns: [
      'theory-of-computation',
      'finite-automata',
      'dfa',
      'nfa',
      'regular-expressions',
      'regular-languages',
      'regular-grammar',
      'pumping-lemma',
      'myhill-nerode',
      'context-free-grammar',
      'context-free-language',
      'pushdown-automata',
      'chomsky-hierarchy',
      'turing-machine',
      'decidability',
      'undecidability',
      'rice-theorem',
      'recursive-languages',
      'closure-properties',
      'minimal-state-automata',
      'countability',
    ],
  },
  {
    subjectId: 'os',
    patterns: [
      'operating-system',
      'process-and-threads',
      'processes',
      'threads',
      'cpu-scheduling',
      'scheduling',
      'synchronization',
      'semaphores',
      'mutex',
      'deadlock',
      'bankers-algorithm',
      'memory-management',
      'virtual-memory',
      'paging',
      'page-replacement',
      'segmentation',
      'thrashing',
      'file-system',
      'inode',
      'disk-scheduling',
      'secondary-storage',
      'magnetic-disk',
      'system-calls',
      'fork',
      'inter-process-communication',
    ],
  },
  {
    subjectId: 'dbms',
    patterns: [
      'databases',
      'dbms',
      'er-model',
      'er-diagram',
      'relational-model',
      'relational-algebra',
      'relational-calculus',
      'tuple-relational-calculus',
      'sql',
      'normalization',
      'functional-dependency',
      'normal-forms',
      'bcnf',
      '3nf',
      '2nf',
      'lossless-join',
      'dependency-preservation',
      'transactions',
      'concurrency-control',
      'serializability',
      'conflict-serializability',
      'two-phase-locking',
      'timestamp-ordering',
      'recovery',
      'indexing',
      'b-tree',
      'b-plus-tree',
      'file-organization',
    ],
  },
  {
    subjectId: 'cn',
    patterns: [
      'computer-networks',
      'osi-model',
      'data-link-layer',
      'framing',
      'error-detection',
      'crc',
      'sliding-window',
      'stop-and-wait',
      'go-back-n',
      'selective-repeat',
      'mac-protocol',
      'csma',
      'aloha',
      'ethernet',
      'bridges',
      'switching',
      'network-layer',
      'ip-addressing',
      'ipv4',
      'subnetting',
      'cidr',
      'routing',
      'distance-vector',
      'link-state',
      'ospf',
      'bgp',
      'transport-layer',
      'tcp',
      'udp',
      'congestion-control',
      'flow-control',
      'application-layer',
      'dns',
      'http',
      'smtp',
      'ftp',
      'dhcp',
      'arp',
      'icmp',
      'sockets',
      'network-security',
      'cryptography',
      'rsa',
    ],
  },
  {
    subjectId: 'coa',
    patterns: [
      'co-and-architecture',
      'computer-organization',
      'cache-memory',
      'memory-hierarchy',
      'pipelining',
      'instruction-pipelining',
      'pipeline-hazards',
      'addressing-modes',
      'machine-instructions',
      'alu',
      'data-path',
      'control-unit',
      'microprogramming',
      'io-interface',
      'interrupts',
      'dma',
      'memory-interleaving',
      'floating-point',
      'ieee-754',
      'secondary-memory',
    ],
  },
  {
    subjectId: 'dl',
    patterns: [
      'digital-logic',
      'boolean-algebra',
      'k-map',
      'minimization',
      'logic-gates',
      'combinational-circuits',
      'multiplexer',
      'decoder',
      'encoder',
      'adder',
      'sequential-circuits',
      'flip-flop',
      'counters',
      'shift-registers',
      'fsm',
      'number-representation',
      'twos-complement',
      'number-system',
      'fixed-point',
      'circuit-output',
      'canonical-normal-form',
    ],
  },
  {
    subjectId: 'algo',
    patterns: [
      'algorithms',
      'asymptotic-notation',
      'time-complexity',
      'space-complexity',
      'recurrence-relation',
      'master-theorem',
      'divide-and-conquer',
      'sorting',
      'quicksort',
      'mergesort',
      'heapsort',
      'searching',
      'binary-search',
      'greedy',
      'huffman',
      'minimum-spanning-tree',
      'mst',
      'kruskal',
      'prim',
      'shortest-path',
      'dijkstra',
      'bellman-ford',
      'floyd-warshall',
      'dynamic-programming',
      'knapsack',
      'lcs',
      'matrix-chain',
      'graph-algorithms',
      'bfs',
      'dfs',
      'topological-sort',
      'strongly-connected',
      'np-completeness',
      'hashing',
      'amortized-analysis',
    ],
  },
  {
    subjectId: 'cprog',
    patterns: [
      'programming-in-c',
      'c-programming',
      'programming',
      'pointers',
      'recursion',
      'arrays',
      'strings',
      'output',
      'parameter-passing',
      'scoping',
      'structures',
      'unions',
      'storage-classes',
      'macros',
      'operators',
      'functions',
      'bitwise',
    ],
  },
  {
    subjectId: 'ds',
    patterns: [
      'data-structures',
      'linked-list',
      'stack',
      'queue',
      'trees',
      'binary-tree',
      'binary-search-tree',
      'avl-tree',
      'binary-heap',
      'heap',
      'graphs',
      'hashing',
      'priority-queue',
    ],
  },
  {
    subjectId: 'em',
    patterns: [
      'engineering-mathematics',
      'discrete-mathematics',
      'set-theory&algebra',
      'set-theory',
      'relations',
      'functions',
      'partial-orders',
      'lattices',
      'groups',
      'group-theory',
      'mathematical-logic',
      'propositional-logic',
      'first-order-logic',
      'predicate-logic',
      'graph-theory',
      'combinatorics',
      'permutations',
      'generating-functions',
      'pigeonhole',
      'linear-algebra',
      'matrices',
      'determinant',
      'eigenvalues',
      'system-of-linear-equations',
      'lu-decomposition',
      'rank-of-matrix',
      'calculus',
      'limits',
      'continuity',
      'differentiability',
      'maxima-minima',
      'integration',
      'probability',
      'bayes-theorem',
      'random-variables',
      'distributions',
      'expectation',
      'conditional-probability',
      'statistics',
    ],
  },
];

export function stripHtmlToPlainText(html: string): string {
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
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveStableGateRId(item: RawGateRItem, index: number): string {
  const link = String(item.link ?? item.url ?? item.solution_link ?? '').trim();
  const goMatch = link.match(/gateoverflow\.in\/(\d+)/i);
  if (goMatch) {
    return `go_${goMatch[1]}`;
  }
  if (item.id !== undefined && item.id !== null && String(item.id).trim().length > 0) {
    const cleaned = String(item.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    if (cleaned.length > 0) return `gater_${cleaned}`;
  }
  const basis = `${item.year ?? ''}_${item.title ?? ''}_${String(item.question ?? item.prompt ?? '').slice(0, 120)}`;
  let hash = 2166136261;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `gater_${(hash >>> 0).toString(36)}_${index}`;
}

export function parsePaperYear(item: RawGateRItem, tags: string[]): number | undefined {
  const candidates = [
    item.year !== undefined ? String(item.year) : '',
    item.title ?? '',
    ...tags,
  ];
  for (const c of candidates) {
    const m = c.match(/(19[89]\d|20[0-2]\d)/);
    if (m) {
      const y = Number(m[1]);
      if (y >= 1987 && y <= 2027) return y;
    }
  }
  return undefined;
}

export function detectOutOf2027Syllabus(tags: string[]): boolean {
  for (const raw of tags) {
    const t = raw.toLowerCase().trim();
    if (REMOVED_2027_TAGS.has(t)) return true;
    if (
      t.includes('secondary-storage') ||
      t.includes('magnetic-disk') ||
      t === 'arp' ||
      t === 'icmp' ||
      t === 'dhcp' ||
      t === 'smtp' ||
      t === 'ftp' ||
      t === 'udp' ||
      t.startsWith('udp-') ||
      t.endsWith('-udp') ||
      t.startsWith('smtp-') ||
      t.startsWith('ftp-') ||
      t.startsWith('dhcp-') ||
      t.startsWith('arp-') ||
      t.startsWith('icmp-')
    ) {
      return true;
    }
  }
  return false;
}

export function mapTagsToSubjectId(tags: string[], title = '', plainText = ''): SubjectId {
  const lowerTags = tags.map((t) => t.toLowerCase().trim());

  // Pass 1: exact tag match
  for (const rule of TAG_TO_SUBJECT) {
    for (const t of lowerTags) {
      if (rule.patterns.includes(t)) {
        return rule.subjectId;
      }
    }
  }

  // Pass 2: substring tag match
  for (const rule of TAG_TO_SUBJECT) {
    for (const t of lowerTags) {
      if (rule.patterns.some((p) => p.length >= 4 && t.includes(p))) {
        return rule.subjectId;
      }
    }
  }

  // Pass 3: lightweight keyword fallback from title + question text
  const hay = `${title} ${plainText.slice(0, 400)}`.toLowerCase();
  if (/\b(compiler|parser|lalr|slr|ll\(1\)|lexical|three-address|syntax-directed)\b/.test(hay)) return 'cd';
  if (/\b(dfa|nfa|turing machine|context-free|pumping lemma|regular language|decidable|undecidable)\b/.test(hay)) return 'toc';
  if (/\b(page fault|paging|deadlock|semaphore|cpu scheduling|round robin|fork\(\)|virtual memory|inode)\b/.test(hay)) return 'os';
  if (/\b(bcnf|3nf|functional dependenc|relational algebra|sql|serializab|b\+\s*tree|2pl)\b/.test(hay)) return 'dbms';
  if (/\b(tcp|udp|subnet|ipv4|cidr|csma|sliding window|routing|crc|ethernet|dns|http)\b/.test(hay)) return 'cn';
  if (/\b(cache|pipeline|hit ratio|addressing mode|ieee 754|dma|interrupt|alu)\b/.test(hay)) return 'coa';
  if (/\b(flip-flop|k-map|multiplexer|boolean|2's complement|nand|nor|sequential circuit|counter)\b/.test(hay)) return 'dl';
  if (/\b(time complexity|asymptotic|dynamic programming|dijkstra|kruskal|quicksort|mergesort|np-complete|mst|recurrence)\b/.test(hay)) return 'algo';
  if (/\b(#include|printf|scanf|malloc|calloc|pointer|typedef|struct|union|static int|extern)\b/.test(hay)) return 'cprog';
  if (/\b(linked list|binary search tree|avl|max-heap|min-heap|b-tree|stack|queue|hash table|binary tree)\b/.test(hay)) return 'ds';
  if (/\b(eigenvalue|matrix|determinant|probability|bayes|propositional|predicate|poset|lattice|graph has|chromatic|integral|limit)\b/.test(hay)) return 'em';

  return 'ga';
}

export function extractSubtopicLabel(tags: string[], subjectId: SubjectId): string {
  const yearPattern = /^gate(cse|it|cs|da)?-?\d{4}/i;
  for (const raw of tags) {
    const t = raw.toLowerCase().trim();
    if (!t || META_TAGS.has(t) || yearPattern.test(t)) continue;
    return t
      .replace(/&/g, ' & ')
      .split(/[-_]+/)
      .filter(Boolean)
      .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(' ');
  }
  const fallbackNames: Record<SubjectId, string> = {
    ga: 'General Aptitude',
    em: 'Engineering Mathematics',
    dl: 'Digital Logic',
    coa: 'Computer Organization',
    cprog: 'C Programming',
    ds: 'Data Structures',
    algo: 'Algorithms',
    toc: 'Theory of Computation',
    cd: 'Compiler Design',
    os: 'Operating Systems',
    dbms: 'Databases',
    cn: 'Computer Networks',
  };
  return fallbackNames[subjectId];
}

export interface ExtractedOptionsResult {
  promptHtml: string;
  options: QuestionOption[];
  optionsExtracted: boolean;
}

const DEFAULT_DOCK_OPTIONS: QuestionOption[] = [
  { id: 'A', text: 'Option A' },
  { id: 'B', text: 'Option B' },
  { id: 'C', text: 'Option C' },
  { id: 'D', text: 'Option D' },
];

/**
 * Smart Interactive Option Extractor:
 * 1. Looks for a clean trailing <ol ...><li>...</li>...</ol> with 2–5 options (ignoring nested lists).
 * 2. Falls back to inline (A) / (B) / (C) / (D) pattern extraction if clean.
 * 3. If HTML structure is too complex (nested tables/lists/non-standard markup), preserves the full
 *    original HTML intact and sets optionsExtracted = false so the UI shows the floating A/B/C/D dock.
 */
export function extractOptionsFromHtml(
  rawHtml: string,
  format: QuestionFormat
): ExtractedOptionsResult {
  if (format === 'NAT') {
    return { promptHtml: rawHtml, options: [], optionsExtracted: false };
  }

  // Attempt 1: Match the last top-level <ol>...</ol> block without nested <ol> inside it
  const olRegex = /<ol\b[^>]*>([\s\S]*?)<\/ol>/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = olRegex.exec(rawHtml)) !== null) {
    lastMatch = m;
  }

  if (lastMatch) {
    const inner = lastMatch[1];
    const hasNestedList = /<(ol|ul)\b/i.test(inner);
    const afterOlText = stripHtmlToPlainText(rawHtml.slice(lastMatch.index + lastMatch[0].length));

    // Only extract if it's at the end of the question (no major prompt text after it) and has no nested lists
    if (!hasNestedList && afterOlText.length < 30) {
      const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      const items: string[] = [];
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRegex.exec(inner)) !== null) {
        const content = liMatch[1].trim();
        if (content.length > 0) items.push(content);
      }

      if (items.length >= 2 && items.length <= 5) {
        const options: QuestionOption[] = items.map((itemHtml, idx) => ({
          id: String.fromCharCode(65 + idx),
          text: itemHtml,
        }));
        const beforeOl = rawHtml.slice(0, lastMatch.index).trim();
        const afterOl = rawHtml.slice(lastMatch.index + lastMatch[0].length).trim();
        const promptHtml = `${beforeOl}${afterOl ? `\n${afterOl}` : ''}`.trim();
        if (stripHtmlToPlainText(promptHtml).length >= 5) {
          return { promptHtml, options, optionsExtracted: true };
        }
      }
    }
  }

  // Attempt 2: Clean (A) ... (B) ... (C) ... (D) ... pattern inside trailing paragraphs/lines (no tables/pre)
  if (!/<(table|pre)\b/i.test(rawHtml)) {
    const abcdRegex =
      /(?:<p[^>]*>|\n|<br\s*\/?>)\s*(?:<strong>|<b>)?\(?A\)?[\.\):]?(?:<\/strong>|<\/b>)?\s+([\s\S]+?)(?:<p[^>]*>|\n|<br\s*\/?>)\s*(?:<strong>|<b>)?\(?B\)?[\.\):]?(?:<\/strong>|<\/b>)?\s+([\s\S]+?)(?:<p[^>]*>|\n|<br\s*\/?>)\s*(?:<strong>|<b>)?\(?C\)?[\.\):]?(?:<\/strong>|<\/b>)?\s+([\s\S]+?)(?:<p[^>]*>|\n|<br\s*\/?>)\s*(?:<strong>|<b>)?\(?D\)?[\.\):]?(?:<\/strong>|<\/b>)?\s+([\s\S]+)$/i;
    const abcd = rawHtml.match(abcdRegex);
    if (abcd && abcd.index !== undefined) {
      const promptHtml = rawHtml.slice(0, abcd.index).trim();
      const opts = [abcd[1], abcd[2], abcd[3], abcd[4]].map((s, idx) => ({
        id: String.fromCharCode(65 + idx),
        text: s.replace(/<\/p>\s*$/i, '').trim(),
      }));
      if (stripHtmlToPlainText(promptHtml).length >= 10 && opts.every((o) => o.text.length > 0)) {
        return { promptHtml, options: opts, optionsExtracted: true };
      }
    }
  }

  // Fallback: keep complete HTML and expose floating A/B/C/D selector dock
  return {
    promptHtml: rawHtml,
    options: DEFAULT_DOCK_OPTIONS,
    optionsExtracted: false,
  };
}

export function detectQuestionFormat(
  item: RawGateRItem,
  tags: string[],
  rawHtml: string,
  plainText: string
): QuestionFormat {
  const lowerTags = tags.map((t) => t.toLowerCase());
  const rawType = String(item.type ?? '').toUpperCase();

  if (
    rawType === 'MSQ' ||
    lowerTags.includes('multiple-selects') ||
    lowerTags.includes('msq') ||
    /which one or more of the following/i.test(plainText)
  ) {
    return 'MSQ';
  }

  if (
    rawType === 'NAT' ||
    lowerTags.includes('numerical-answers') ||
    lowerTags.includes('nat') ||
    lowerTags.includes('numerical-answer-type') ||
    (!/<ol\b/i.test(rawHtml) && /_{4,}/.test(plainText) && !/\(A\)/.test(plainText))
  ) {
    return 'NAT';
  }

  return 'MCQ';
}

export function parseQuestionMarks(item: RawGateRItem, tags: string[]): 1 | 2 {
  if (item.marks === 1 || String(item.marks) === '1') return 1;
  if (item.marks === 2 || String(item.marks) === '2') return 2;
  const lowerTags = tags.map((t) => t.toLowerCase());
  if (lowerTags.some((t) => t === '1-mark' || t === 'mark-1' || t === 'one-mark')) return 1;
  if (lowerTags.some((t) => t === '2-marks' || t === 'mark-2' || t === 'two-marks')) return 2;
  return 2;
}

export function parseDifficulty(tags: string[]): DifficultyLevel {
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.includes('easy')) return 'Easy';
  if (lower.includes('hard') || lower.includes('difficult')) return 'Hard';
  return 'Medium';
}

function normalizeSafeHttpUrl(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

export function normalizeGateRDataset(rawPayload: unknown): Question[] {
  let rawList: unknown[] = [];

  if (Array.isArray(rawPayload)) {
    rawList = rawPayload;
  } else if (rawPayload && typeof rawPayload === 'object') {
    const obj = rawPayload as Record<string, unknown>;
    if (Array.isArray(obj.questions)) {
      rawList = obj.questions;
    } else if (Array.isArray(obj.data)) {
      rawList = obj.data;
    } else if (Array.isArray(obj.items)) {
      rawList = obj.items;
    } else {
      rawList = Object.values(obj).filter((v) => v && typeof v === 'object');
    }
  }

  const normalized: Question[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rawList.length; i++) {
    const entry = rawList[i];
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as RawGateRItem;

    const rawHtml = String(item.question ?? item.body ?? item.html ?? item.prompt ?? '').trim();
    if (rawHtml.length < 4) continue;

    const tags = Array.isArray(item.tags)
      ? item.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
      : typeof item.tags === 'string'
      ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const id = deriveStableGateRId(item, i);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const plainText = stripHtmlToPlainText(rawHtml);
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const year = parsePaperYear(item, tags);
    const paperTag = typeof item.year === 'string' ? item.year.trim() : year ? `gatecse-${year}` : undefined;
    const marks = parseQuestionMarks(item, tags);
    const difficulty = parseDifficulty(tags);
    const format = detectQuestionFormat(item, tags, rawHtml, plainText);
    const subjectId = mapTagsToSubjectId(tags, title, plainText);
    const subtopic = extractSubtopicLabel(tags, subjectId);
    const isOutOf2027Syllabus = detectOutOf2027Syllabus(tags);
    const sourceUrl = normalizeSafeHttpUrl(item.link ?? item.url ?? item.solution_link);

    const extracted = extractOptionsFromHtml(rawHtml, format);

    // Check if raw dataset included a pre-filled answer key
    const rawAns = item.correctAnswer ?? item.answer;
    let correctOption: string | undefined;
    let correctOptions: string[] | undefined;
    let natAnswer: number | undefined;
    let hasAnswerKey = false;

    if (rawAns !== undefined && rawAns !== null && String(rawAns).trim() !== '') {
      if (format === 'MCQ' && typeof rawAns === 'string') {
        const clean = rawAns.trim().toUpperCase().replace(/[^A-E]/g, '').slice(0, 1);
        if (clean) {
          correctOption = clean;
          hasAnswerKey = true;
        }
      } else if (format === 'MSQ') {
        const list = Array.isArray(rawAns)
          ? rawAns.map((x) => String(x).trim().toUpperCase())
          : String(rawAns)
              .split(/[,;\s]+/)
              .map((x) => x.trim().toUpperCase());
        const cleanList = Array.from(new Set(list.filter((x) => /^[A-E]$/.test(x)))).sort();
        if (cleanList.length > 0) {
          correctOptions = cleanList;
          hasAnswerKey = true;
        }
      } else if (format === 'NAT') {
        const num = Number(rawAns);
        if (Number.isFinite(num)) {
          natAnswer = num;
          hasAnswerKey = true;
        }
      }
    }

    const sourceTag = title
      ? title
      : year
      ? `GATE CSE ${year} · GateOverflow`
      : 'GATE PYQ · GateOverflow';

    normalized.push({
      id,
      title: title || sourceTag,
      subjectId,
      subtopic,
      format,
      marks,
      difficulty,
      sourceTag,
      sourceUrl,
      year,
      paperTag,
      tags,
      prompt: stripHtmlToPlainText(extracted.promptHtml) || plainText,
      bodyHtml: extracted.promptHtml,
      options: format === 'NAT' ? undefined : extracted.options,
      optionsExtracted: extracted.optionsExtracted,
      hasAnswerKey,
      isOutOf2027Syllabus,
      isGateR: true,
      correctOption,
      correctOptions,
      natAnswer,
      natTolerance: format === 'NAT' ? 0.01 : undefined,
      explanation:
        typeof item.explanation === 'string' && item.explanation.trim().length > 0
          ? item.explanation.trim()
          : '',
      wrongOptionAnalysis: '',
    });
  }

  // Sort newest papers first for high-ROI GATE 2027 prep
  normalized.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return normalized;
}

export function applyVerifiedAnswer(
  question: Question,
  verified?: VerifiedAnswerRecord
): Question {
  if (!verified) return question;
  const format = verified.format || question.format;
  const hasNatRange =
    typeof verified.natRangeMin === 'number' &&
    typeof verified.natRangeMax === 'number' &&
    Number.isFinite(verified.natRangeMin) &&
    Number.isFinite(verified.natRangeMax);
  const hasKey =
    (format === 'MCQ' && Boolean(verified.correctOption)) ||
    (format === 'MSQ' && Boolean(verified.correctOptions && verified.correctOptions.length > 0)) ||
    (format === 'NAT' &&
      (hasNatRange || (typeof verified.natAnswer === 'number' && Number.isFinite(verified.natAnswer))));

  return {
    ...question,
    format,
    hasAnswerKey: hasKey || question.hasAnswerKey,
    correctOption: format === 'MCQ' ? verified.correctOption : question.correctOption,
    correctOptions: format === 'MSQ' ? verified.correctOptions : question.correctOptions,
    natAnswer: format === 'NAT' ? verified.natAnswer : question.natAnswer,
    natRangeMin: format === 'NAT' ? (hasNatRange ? verified.natRangeMin : undefined) : question.natRangeMin,
    natRangeMax: format === 'NAT' ? (hasNatRange ? verified.natRangeMax : undefined) : question.natRangeMax,
    natTolerance: format === 'NAT' ? (verified.natTolerance ?? 0.01) : question.natTolerance,
    explanation: verified.explanation || question.explanation,
    wrongOptionAnalysis: verified.wrongOptionAnalysis || question.wrongOptionAnalysis,
    verifiedByName: verified.updatedByName || question.verifiedByName,
    verifiedAtMs: verified.updatedAtMs ?? question.verifiedAtMs,
  };
}

export type YearRangePreset = 'all' | '2021-2026' | '2014-2020' | '2008-2013' | 'pre-2008' | 'specific';
export type StatusFilterMode = 'all' | 'unattempted' | 'mistakes' | 'bookmarked';

export interface PyqFilterCriteria {
  subjects: SubjectId[];
  tags: string[];
  yearRange: YearRangePreset;
  specificYear: number | null;
  marks: 'all' | 1 | 2;
  format: 'all' | QuestionFormat;
  status: StatusFilterMode;
  hideRemoved2027: boolean;
  searchQuery: string;
}

export function filterPyqBank(
  questions: Question[],
  criteria: PyqFilterCriteria,
  attempts: Record<string, QuestionAttemptRecord>,
  mistakes: Record<string, MistakeEntry>,
  bookmarkedIds: string[]
): Question[] {
  const subjectSet = criteria.subjects.length > 0 ? new Set(criteria.subjects) : null;
  const tagSet = criteria.tags.length > 0 ? new Set(criteria.tags.map((t) => t.toLowerCase())) : null;
  const bookmarkSet = criteria.status === 'bookmarked' ? new Set(bookmarkedIds) : null;
  const queryText = criteria.searchQuery.trim().toLowerCase();

  return questions.filter((q) => {
    if (criteria.hideRemoved2027 && q.isOutOf2027Syllabus) return false;
    if (subjectSet && !subjectSet.has(q.subjectId)) return false;
    if (criteria.marks !== 'all' && q.marks !== criteria.marks) return false;
    if (criteria.format !== 'all' && q.format !== criteria.format) return false;

    if (criteria.yearRange !== 'all') {
      const y = q.year;
      if (!y) return false;
      if (criteria.yearRange === '2021-2026' && (y < 2021 || y > 2026)) return false;
      if (criteria.yearRange === '2014-2020' && (y < 2014 || y > 2020)) return false;
      if (criteria.yearRange === '2008-2013' && (y < 2008 || y > 2013)) return false;
      if (criteria.yearRange === 'pre-2008' && y >= 2008) return false;
      if (criteria.yearRange === 'specific' && criteria.specificYear && y !== criteria.specificYear) {
        return false;
      }
    }

    if (tagSet) {
      const qTags = (q.tags ?? []).map((t) => t.toLowerCase());
      const subLow = q.subtopic.toLowerCase();
      const matched = Array.from(tagSet).some((t) => qTags.includes(t) || subLow.includes(t));
      if (!matched) return false;
    }

    if (criteria.status === 'unattempted' && attempts[q.id]) return false;
    if (criteria.status === 'mistakes') {
      const m = mistakes[q.id];
      if (!m || m.resolved) return false;
    }
    if (criteria.status === 'bookmarked' && bookmarkSet && !bookmarkSet.has(q.id)) return false;

    if (queryText) {
      const inTitle = (q.title ?? '').toLowerCase().includes(queryText);
      const inPrompt = q.prompt.toLowerCase().includes(queryText);
      const inSubtopic = q.subtopic.toLowerCase().includes(queryText);
      const inTags = (q.tags ?? []).some((t) => t.toLowerCase().includes(queryText));
      if (!inTitle && !inPrompt && !inSubtopic && !inTags) return false;
    }

    return true;
  });
}

export function extractTopSubtopicTags(
  questions: Question[],
  selectedSubjects: SubjectId[],
  limit = 60
): Array<{ tag: string; count: number }> {
  const subjectSet = selectedSubjects.length > 0 ? new Set(selectedSubjects) : null;
  const yearPattern = /^gate(cse|it|cs|da)?-?\d{4}/i;
  const counts = new Map<string, number>();

  for (const q of questions) {
    if (subjectSet && !subjectSet.has(q.subjectId)) continue;
    for (const raw of q.tags ?? []) {
      const t = raw.toLowerCase().trim();
      if (!t || META_TAGS.has(t) || yearPattern.test(t)) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}
