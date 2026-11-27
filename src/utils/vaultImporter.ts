import type {
  GateSubject,
  MistakeEntry,
  Question,
  SubjectId,
  TipItem,
  VaultCard,
  VaultKind,
  VaultPack,
  VaultSource,
} from '../types/index.ts';
import { SUBJECT_MAP } from '../data/syllabus.ts';
import { classifyPdsToCprogOrDs } from './subjectMigration.ts';
import { findMatchingPyqsForVaultCard } from './vaultMatcher.ts';

export const VALID_VAULT_SUBJECTS: GateSubject[] = [
  'ga',
  'em',
  'dl',
  'coa',
  'cprog',
  'ds',
  'algo',
  'toc',
  'cd',
  'os',
  'dbms',
  'cn',
];

export const VALID_VAULT_KINDS: VaultKind[] = [
  'FORMULA',
  'TRAP',
  'SHORTCUT',
  'TIP',
  'COUNTER_EXAMPLE',
  'EDGE_CASE',
];

export const VAULT_KIND_LABELS: Record<VaultKind, string> = {
  FORMULA: 'Formula',
  TRAP: 'Exam Trap',
  SHORTCUT: 'Shortcut',
  TIP: 'Strategy Tip',
  COUNTER_EXAMPLE: 'Counter-Example',
  EDGE_CASE: 'Edge Case',
};

const SUBJECT_ALIASES: Record<string, GateSubject> = {
  ga: 'ga',
  'general aptitude': 'ga',
  aptitude: 'ga',
  quant: 'ga',
  verbal: 'ga',
  em: 'em',
  dm: 'em',
  math: 'em',
  maths: 'em',
  'engineering mathematics': 'em',
  'engineering math': 'em',
  'discrete mathematics': 'em',
  'discrete math': 'em',
  'discrete & engineering math': 'em',
  dl: 'dl',
  dld: 'dl',
  digital: 'dl',
  'digital logic': 'dl',
  'digital logic design': 'dl',
  coa: 'coa',
  co: 'coa',
  ca: 'coa',
  'computer organization': 'coa',
  'computer architecture': 'coa',
  'computer organization and architecture': 'coa',
  'computer organization & architecture': 'coa',
  cprog: 'cprog',
  c: 'cprog',
  'c programming': 'cprog',
  'c-programming': 'cprog',
  'programming in c': 'cprog',
  programming: 'cprog',
  ds: 'ds',
  dsa: 'ds',
  'data structure': 'ds',
  'data structures': 'ds',
  'data-structures': 'ds',
  algo: 'algo',
  alg: 'algo',
  algorithms: 'algo',
  algorithm: 'algo',
  toc: 'toc',
  automata: 'toc',
  'theory of computation': 'toc',
  cd: 'cd',
  compiler: 'cd',
  compilers: 'cd',
  'compiler design': 'cd',
  os: 'os',
  'operating system': 'os',
  'operating systems': 'os',
  dbms: 'dbms',
  db: 'dbms',
  sql: 'dbms',
  database: 'dbms',
  databases: 'dbms',
  'database management systems': 'dbms',
  cn: 'cn',
  networks: 'cn',
  networking: 'cn',
  'computer network': 'cn',
  'computer networks': 'cn',
};

const SUBJECT_KEYWORDS: Record<GateSubject, string[]> = {
  ga: [
    'percentage', 'ratio', 'profit', 'discount', 'syllogism', 'clock', 'calendar',
    'paper folding', 'mirror', 'spatial', 'grammar', 'preposition', 'speed', 'cistern',
    'derangement', 'unit digit', 'aptitude', 'data interpretation',
  ],
  em: [
    'eigenvalue', 'eigenvector', 'determinant', 'rank', 'nullity', 'bayes', 'poisson',
    'binomial', 'expectation', 'variance', 'lhopital', 'quantifier', 'poset', 'lattice',
    'hasse', 'planar', 'chromatic', 'eulerian', 'hamiltonian', 'lagrange', 'subgroup',
    'catalan', 'pigeonhole', 'generating function', 'matrix', 'probability',
  ],
  dl: [
    'k-map', 'kmap', 'implicant', 'epi', 'nand', 'nor', 'xor', 'xnor', 'mux', 'multiplexer',
    'decoder', 'twos complement', "2's complement", 'ieee-754', 'ieee 754', 'subnormal',
    'carry look', 'flip-flop', 'flip flop', 'jk', 'sr', 'ripple counter', 'johnson counter',
    'ring counter', 'mealy', 'moore', 'self-dual', 'boolean', 'minterm', 'maxterm',
  ],
  coa: [
    'cache', 'set-associative', 'direct-mapped', 'write-back', 'write-through', 'amat',
    'pipeline', 'forwarding', 'load-use', 'stall', 'cpi', 'opcode', 'addressing mode',
    'pc-relative', 'dma', 'cycle stealing', 'microprogram', 'interleaving', 'vipt', 'amdahl',
    'magnetic disk', 'seek time', 'rotational latency', 'cylinder', 'secondary storage',
  ],
  cprog: [
    'pointer', 'sizeof', 'struct', 'union', 'static', 'recursion', 'printf', 'malloc',
    'calloc', 'array decay', 'sequence point', 'short circuit', 'macro', 'storage class',
    'parameter passing', 'scoping', 'bitwise', 'string literal', 'dangling pointer',
  ],
  ds: [
    'linked list', 'circular queue', 'queue', 'stack', 'postfix', 'prefix', 'infix',
    'binary tree', 'inorder', 'preorder', 'postorder', 'bst', 'avl', 'heap', 'build-heap',
    'hashing', 'linear probing', 'chaining', 'adjacency list', 'adjacency matrix', 'catalan',
  ],
  algo: [
    'asymptotic', 'big o', 'theta', 'omega', 'master theorem', 'recurrence', 'quicksort',
    'mergesort', 'heapsort', 'topological', 'kosaraju', 'scc', 'dijkstra', 'bellman-ford',
    'bellman ford', 'kruskal', 'prim', 'mst', 'floyd-warshall', 'huffman', 'knapsack', 'lcs',
    'matrix chain', 'amortized', 'np-complete', 'np-hard', '3-sat', 'reduction', 'quickselect',
  ],
  toc: [
    'dfa', 'nfa', 'myhill-nerode', 'pumping lemma', 'regular', 'parikh', 'cfg', 'cnf',
    'chomsky', 'cyk', 'pda', 'dpda', 'npda', 'dcfl', 'cfl', 'csl', 'turing', 'rice',
    'decidable', 'undecidable', 'recursive', 'co-re', 'halting', 'pcp', 'post correspondence',
  ],
  cd: [
    'lexical', 'maximal munch', 'token', 'left recursion', 'left factoring', 'first(', 'follow(',
    'll(1)', 'lr(0)', 'slr(1)', 'lalr(1)', 'clr(1)', 'shift-reduce', 'reduce-reduce',
    's-attributed', 'l-attributed', 'sdd', 'basic block', 'leader', 'three-address', 'ssa',
    'dag', 'sethi-ullman', 'register allocation', 'dataflow', 'reaching definitions',
    'live variables', 'activation record', 'static link', 'dynamic link', 'call-by-name',
  ],
  os: [
    'fork(', 'process', 'srtf', 'sjf', 'round robin', 'convoy', 'semaphore', 'mutex',
    'peterson', 'deadlock', 'banker', 'coffman', 'paging', 'tlb', 'emat', 'page table',
    'inverted page', 'belady', 'page fault', 'inode', 'fragmentation', 'thread', 'thrashing',
    'working set', 'test-and-set', 'spinlock',
  ],
  dbms: [
    'er diagram', 'weak entity', 'sql', 'not in', 'group by', 'having', 'relational algebra',
    'natural join', 'functional dependency', 'candidate key', 'superkey', 'bcnf', '3nf', '2nf',
    'lossless', 'dependency preserving', 'serializable', 'serializability', 'blind write',
    'precedence graph', 'cascadeless', 'recoverable', '2pl', 'strict 2pl', 'timestamp',
    'thomas write', 'b+ tree', 'b-tree', 'primary index', 'secondary index', 'clustering index',
  ],
  cn: [
    'transmission delay', 'propagation delay', 'bdp', 'sliding window', 'stop-and-wait',
    'go-back-n', 'selective repeat', 'crc', 'hamming', 'csma/cd', 'ethernet', 'aloha',
    'collision domain', 'cidr', 'subnet', 'supernet', 'longest prefix', 'ipv4',
    'fragmentation', 'mtu', 'nat', 'ttl', 'distance vector', 'link state', 'ospf',
    'count-to-infinity', 'tcp', 'cwnd', 'ssthresh', 'slow start', 'reno', 'tahoe',
    'http', 'dns', 'arp', 'icmp', 'dhcp', 'smtp', 'ftp', 'udp',
  ],
};

// Official IIT Madras GATE CSE 2027 removed topics detector
const REMOVED_2027_PATTERNS: RegExp[] = [
  /\b(magnetic\s+disk|disk\s+scheduling|seek\s+time|rotational\s+latency|cylinder\s+head\s+sector|secondary\s+storage|sstf|c-scan|c-look)\b/i,
  /\b(arp|rarp|icmp|dhcp|smtp|ftp|tftp|udp)\b/i,
  /\b(user\s+datagram\s+protocol|address\s+resolution\s+protocol|internet\s+control\s+message|dynamic\s+host\s+configuration|simple\s+mail\s+transfer|file\s+transfer\s+protocol)\b/i,
];

export function isRemovedInGate2027(text: string): boolean {
  if (!text) return false;
  return REMOVED_2027_PATTERNS.some((re) => re.test(text));
}

export function inferSubjectFromInput(
  rawSubject: unknown,
  fallbackText: string
): { subject: GateSubject; autoCategorized: boolean } {
  if (typeof rawSubject === 'string') {
    const norm = rawSubject.trim().toLowerCase().replace(/\s+/g, ' ');
    if (
      norm === 'pds' ||
      norm === 'programming & data structures' ||
      norm === 'programming and data structures' ||
      norm === 'prog & ds'
    ) {
      return {
        subject: classifyPdsToCprogOrDs({ text: fallbackText }),
        autoCategorized: false,
      };
    }
    if (SUBJECT_ALIASES[norm]) {
      return { subject: SUBJECT_ALIASES[norm], autoCategorized: false };
    }
    // Check partial code/alias match
    for (const [alias, subj] of Object.entries(SUBJECT_ALIASES)) {
      if (alias.length >= 3 && norm.includes(alias)) {
        return { subject: subj, autoCategorized: false };
      }
    }
  }

  // Weighted keyword classifier over title + subtopic + truth + formula + code
  const hay = fallbackText.toLowerCase();
  let bestSubject: GateSubject = 'algo';
  let bestScore = 0;

  for (const subj of VALID_VAULT_SUBJECTS) {
    let score = 0;
    for (const kw of SUBJECT_KEYWORDS[subj]) {
      if (hay.includes(kw)) {
        score += kw.length >= 6 ? 3 : 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSubject = subj;
    }
  }

  return { subject: bestSubject, autoCategorized: true };
}

export function inferVaultKind(
  rawKind: unknown,
  fields: { formulaLatex?: string; commonTrap?: string; title?: string; gateTruth?: string }
): { kind: VaultKind; autoCategorized: boolean } {
  if (typeof rawKind === 'string') {
    const u = rawKind.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if ((VALID_VAULT_KINDS as string[]).includes(u)) {
      return { kind: u as VaultKind, autoCategorized: false };
    }
    if (u.includes('FORMULA') || u.includes('EQUATION') || u.includes('THEOREM')) {
      return { kind: 'FORMULA', autoCategorized: false };
    }
    if (u.includes('COUNTER')) {
      return { kind: 'COUNTER_EXAMPLE', autoCategorized: false };
    }
    if (u.includes('EDGE') || u.includes('CORNER') || u.includes('BOUNDARY')) {
      return { kind: 'EDGE_CASE', autoCategorized: false };
    }
    if (u.includes('SHORTCUT') || u.includes('TRICK') || u.includes('HACK')) {
      return { kind: 'SHORTCUT', autoCategorized: false };
    }
    if (u.includes('TRAP') || u.includes('MISTAKE') || u.includes('PITFALL')) {
      return { kind: 'TRAP', autoCategorized: false };
    }
    if (u.includes('TIP') || u.includes('NOTE') || u.includes('STRATEGY')) {
      return { kind: 'TIP', autoCategorized: false };
    }
  }

  const hay = `${fields.title || ''} ${fields.gateTruth || ''}`.toLowerCase();
  if (hay.includes('counter-example') || hay.includes('counterexample') || hay.includes('converse fails')) {
    return { kind: 'COUNTER_EXAMPLE', autoCategorized: true };
  }
  if (hay.includes('edge case') || hay.includes('corner case') || hay.includes('boundary')) {
    return { kind: 'EDGE_CASE', autoCategorized: true };
  }
  if (hay.includes('shortcut') || hay.includes('trick') || hay.includes('in 5 seconds')) {
    return { kind: 'SHORTCUT', autoCategorized: true };
  }
  if (fields.commonTrap && fields.commonTrap.trim().length > 0 && !fields.formulaLatex) {
    return { kind: 'TRAP', autoCategorized: true };
  }
  if (fields.formulaLatex && fields.formulaLatex.trim().length > 0) {
    return { kind: 'FORMULA', autoCategorized: true };
  }
  return { kind: 'TIP', autoCategorized: true };
}

export function cardFingerprint(subject: GateSubject, title: string): string {
  const normTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 96);
  return `${subject}::${normTitle}`;
}

export function sanitizeVaultId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 110);
  return cleaned.length > 0 ? cleaned : `vc_${Date.now()}`;
}

function cleanRawJsonText(rawText: string): string {
  let cleaned = rawText.trim();
  // Strip outer markdown ```json ... ``` fences
  const fenceMatch = cleaned.match(/```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }
  // Normalize smart curly quotes outside/inside JSON
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  return cleaned;
}

function extractCandidateArray(rawText: string): { items: unknown[]; error?: string } {
  const cleaned = cleanRawJsonText(rawText);
  if (!cleaned) {
    return { items: [], error: 'Paste JSON content or upload a .json file first.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: try extracting the outermost [ ... ] or { ... } slice
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
      } catch (innerErr) {
        return {
          items: [],
          error: `Invalid JSON syntax: ${innerErr instanceof Error ? innerErr.message : 'Unable to parse array.'}`,
        };
      }
    } else {
      // Try NDJSON (one JSON object per line)
      const lines = cleaned
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{') && l.endsWith('}'));
      if (lines.length > 0) {
        const objs: unknown[] = [];
        for (const line of lines) {
          try {
            objs.push(JSON.parse(line));
          } catch {
            // skip malformed line
          }
        }
        if (objs.length > 0) {
          return { items: objs };
        }
      }
      return {
        items: [],
        error: 'Could not parse JSON. Expected a JSON array `[...]` or `{ "cards": [...] }`.',
      };
    }
  }

  if (Array.isArray(parsed)) {
    return { items: parsed };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['cards', 'vault', 'tips', 'traps', 'formulas', 'items', 'data']) {
      if (Array.isArray(obj[key])) {
        return { items: obj[key] as unknown[] };
      }
    }
    // Single card object
    if (obj.title || obj.gateTruth || obj.truth || obj.detail) {
      return { items: [obj] };
    }
  }

  return {
    items: [],
    error: 'JSON parsed, but no array of cards was found (expected `[...]` or `{ "cards": [...] }`).',
  };
}

function pickStr(obj: Record<string, unknown>, keys: string[], maxLen = 1500): string {
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim().slice(0, maxLen);
    }
  }
  return '';
}

function extractKeywords(raw: unknown, title: string, subtopic: string): string[] {
  const set = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && item.trim().length >= 2) {
        set.add(item.trim().toLowerCase().slice(0, 40));
      }
    }
  } else if (typeof raw === 'string' && raw.trim()) {
    for (const part of raw.split(/[,;|]/)) {
      const cleaned = part.trim().toLowerCase().slice(0, 40);
      if (cleaned.length >= 2) set.add(cleaned);
    }
  }

  if (set.size === 0) {
    const tokens = `${subtopic} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9+\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'not', 'are', 'only'].includes(w));
    for (const t of tokens.slice(0, 5)) {
      set.add(t);
    }
  }
  return Array.from(set).slice(0, 8);
}

export interface BulkImportStats {
  totalParsed: number;
  added: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  outOf2027Flagged: number;
  autoCategorizedCount: number;
  subjectBreakdown: Partial<Record<GateSubject, number>>;
}

export interface BulkImportResult {
  ok: boolean;
  cards: VaultCard[];
  pack: VaultPack | null;
  stats: BulkImportStats;
  error?: string;
}

export function parseAndCategorizeBulkJson(
  rawText: string,
  options?: {
    packName?: string;
    source?: 'JSON Import' | 'GitHub Sync' | 'Custom';
    sourceUrl?: string;
    existingCards?: VaultCard[];
    maxCards?: number;
  }
): BulkImportResult {
  const emptyStats: BulkImportStats = {
    totalParsed: 0,
    added: 0,
    duplicatesSkipped: 0,
    invalidSkipped: 0,
    outOf2027Flagged: 0,
    autoCategorizedCount: 0,
    subjectBreakdown: {},
  };

  const { items, error } = extractCandidateArray(rawText);
  if (error || items.length === 0) {
    return {
      ok: false,
      cards: [],
      pack: null,
      stats: emptyStats,
      error: error || 'No valid cards found in the JSON payload.',
    };
  }

  const maxCards = Math.min(600, Math.max(1, options?.maxCards ?? 550));
  const now = Date.now();
  const packSource = options?.source ?? 'JSON Import';
  const packName = (options?.packName || `${packSource} (${new Date(now).toISOString().slice(0, 10)})`)
    .trim()
    .slice(0, 100);
  const packId = sanitizeVaultId(`pack_${now}_${Math.random().toString(36).slice(2, 6)}`);

  const seenFingerprints = new Set<string>(
    (options?.existingCards ?? []).map((c) => cardFingerprint(c.subject, c.title))
  );

  const accepted: VaultCard[] = [];
  const stats: BulkImportStats = {
    totalParsed: items.length,
    added: 0,
    duplicatesSkipped: 0,
    invalidSkipped: 0,
    outOf2027Flagged: 0,
    autoCategorizedCount: 0,
    subjectBreakdown: {},
  };

  for (let i = 0; i < items.length && accepted.length < maxCards; i++) {
    const raw = items[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      stats.invalidSkipped += 1;
      continue;
    }
    const obj = raw as Record<string, unknown>;

    const title = pickStr(obj, ['title', 'name', 'heading', 'topic', 'concept'], 180);
    const gateTruth = pickStr(
      obj,
      ['gateTruth', 'gate_truth', 'truth', 'detail', 'explanation', 'rule', 'summary', 'description', 'content', 'answer'],
      2400
    );

    if (!title || !gateTruth) {
      stats.invalidSkipped += 1;
      continue;
    }

    const formulaLatex = pickStr(obj, ['formulaLatex', 'formula_latex', 'formula', 'latex', 'equation'], 500) || undefined;
    const codeSnippet = pickStr(obj, ['codeSnippet', 'code_snippet', 'code', 'snippet'], 2000) || undefined;
    const commonTrap = pickStr(obj, ['commonTrap', 'common_trap', 'trap', 'mistake', 'misconception', 'pitfall'], 800) || undefined;
    const quickExample = pickStr(obj, ['quickExample', 'quick_example', 'example', 'illustration'], 600) || undefined;
    const subtopic = pickStr(obj, ['subtopic', 'chapter', 'module', 'section', 'sub_topic'], 120) || 'Core Concepts';

    const combinedText = `${title} ${subtopic} ${gateTruth} ${commonTrap ?? ''} ${formulaLatex ?? ''} ${codeSnippet ?? ''}`;
    const subjRes = inferSubjectFromInput(obj.subject ?? obj.subjectId ?? obj.subject_id, combinedText);
    const kindRes = inferVaultKind(obj.kind ?? obj.category ?? obj.type, {
      formulaLatex,
      commonTrap,
      title,
      gateTruth,
    });

    if (subjRes.autoCategorized || kindRes.autoCategorized) {
      stats.autoCategorizedCount += 1;
    }

    const fp = cardFingerprint(subjRes.subject, title);
    if (seenFingerprints.has(fp)) {
      stats.duplicatesSkipped += 1;
      continue;
    }
    seenFingerprints.add(fp);

    const outOf2027 =
      typeof obj.outOf2027Syllabus === 'boolean'
        ? obj.outOf2027Syllabus
        : isRemovedInGate2027(combinedText);
    if (outOf2027) {
      stats.outOf2027Flagged += 1;
    }

    const highYield =
      typeof obj.highYield === 'boolean'
        ? obj.highYield
        : typeof obj.high_yield === 'boolean'
        ? obj.high_yield
        : typeof obj.important === 'boolean'
        ? obj.important
        : kindRes.kind === 'FORMULA' || kindRes.kind === 'TRAP';

    const tagMatchKeywords = extractKeywords(
      obj.tagMatchKeywords ?? obj.tag_match_keywords ?? obj.tags ?? obj.keywords,
      title,
      subtopic
    );

    const card: VaultCard = {
      id: sanitizeVaultId(`${packId}_c${i + 1}`),
      subject: subjRes.subject,
      subtopic,
      tagMatchKeywords,
      kind: kindRes.kind,
      highYield,
      title,
      ...(formulaLatex ? { formulaLatex } : {}),
      ...(codeSnippet ? { codeSnippet } : {}),
      ...(commonTrap ? { commonTrap } : {}),
      gateTruth,
      ...(quickExample ? { quickExample } : {}),
      source: packSource as VaultSource,
      packId,
      packName,
      ...(outOf2027 ? { outOf2027Syllabus: true } : {}),
      createdAt: now,
    };

    accepted.push(card);
    stats.added += 1;
    stats.subjectBreakdown[card.subject] = (stats.subjectBreakdown[card.subject] ?? 0) + 1;
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      cards: [],
      pack: null,
      stats,
      error:
        stats.duplicatesSkipped > 0
          ? `All ${stats.duplicatesSkipped} parsed cards already exist in your Vault.`
          : 'No valid cards found — each card needs at least a `title` and `gateTruth` (or `detail`).',
    };
  }

  const pack: VaultPack = {
    packId,
    name: packName,
    source: packSource,
    ...(options?.sourceUrl ? { sourceUrl: options.sourceUrl.slice(0, 400) } : {}),
    cardCount: accepted.length,
    cards: accepted,
    createdAt: now,
    updatedAt: now,
  };

  return { ok: true, cards: accepted, pack, stats };
}

/**
 * Splits a large VaultPack (>150 cards) into Firestore-safe pack chunks
 * so every Firestore doc uses native Lists of Maps well under the 1MB doc limit
 * and passes strict Eight Pillars rules (`cards.size() <= 150`).
 */
export function splitPackForFirestore(pack: VaultPack, chunkSize = 150): VaultPack[] {
  if (pack.cards.length <= chunkSize) return [pack];
  const chunks: VaultPack[] = [];
  const totalParts = Math.ceil(pack.cards.length / chunkSize);
  for (let p = 0; p < totalParts; p++) {
    const slice = pack.cards.slice(p * chunkSize, (p + 1) * chunkSize);
    const partPackId = sanitizeVaultId(`${pack.packId}_p${p + 1}`);
    const partName = `${pack.name} (${p + 1}/${totalParts})`.slice(0, 110);
    chunks.push({
      packId: partPackId,
      name: partName,
      source: pack.source,
      ...(pack.sourceUrl ? { sourceUrl: pack.sourceUrl } : {}),
      cardCount: slice.length,
      cards: slice.map((c) => ({ ...c, packId: partPackId, packName: partName })),
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
    });
  }
  return chunks;
}

/**
 * SSRF-safe GitHub URL normalizer for zero-cost Vault Sync.
 * Allows ONLY github.com and raw.githubusercontent.com HTTPS URLs.
 */
export function resolveGithubVaultCandidateUrls(rawInput: string): {
  ok: boolean;
  urls: string[];
  displayLabel: string;
  error?: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, urls: [], displayLabel: '', error: 'Enter a public GitHub repo or raw JSON URL.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, urls: [], displayLabel: '', error: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, urls: [], displayLabel: '', error: 'Only HTTPS GitHub URLs are permitted.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'raw.githubusercontent.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 4) {
      return { ok: false, urls: [], displayLabel: '', error: 'Raw GitHub URL must point to a file path.' };
    }
    return {
      ok: true,
      urls: [parsed.toString()],
      displayLabel: `${parts[0]}/${parts[1]} (${parts[parts.length - 1]})`,
    };
  }

  if (host === 'github.com' || host === 'www.github.com') {
    const parts = parsed.pathname.replace(/\.git$/i, '').split('/').filter(Boolean);
    if (parts.length < 2) {
      return {
        ok: false,
        urls: [],
        displayLabel: '',
        error: 'Provide a GitHub repo (`github.com/owner/repo`) or file URL.',
      };
    }
    const [owner, repo, maybeBlob, branch, ...rest] = parts;
    if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
      return { ok: false, urls: [], displayLabel: '', error: 'Invalid GitHub owner or repository name.' };
    }

    if ((maybeBlob === 'blob' || maybeBlob === 'raw') && branch && rest.length > 0) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join('/')}`;
      return {
        ok: true,
        urls: [rawUrl],
        displayLabel: `${owner}/${repo} (${rest[rest.length - 1]})`,
      };
    }

    // Repo root: probe standard GATE vault bundle paths on main & master
    const paths = [
      'gate27-vault.json',
      'vault.json',
      'formulas.json',
      'traps.json',
      'data/gate27-vault.json',
      'data/vault.json',
      'public/gate27-vault.json',
      'public/vault.json',
    ];
    const candidates: string[] = [];
    for (const br of ['main', 'master']) {
      for (const p of paths) {
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${br}/${p}`);
      }
    }
    return {
      ok: true,
      urls: candidates,
      displayLabel: `${owner}/${repo}`,
    };
  }

  return {
    ok: false,
    urls: [],
    displayLabel: '',
    error: 'Only public `github.com` or `raw.githubusercontent.com` URLs are allowed.',
  };
}

/**
 * 100% Local ₹0 Mistake-to-Card Miner:
 * Converts unresolved items from the user's Mistake Bucket into structured VaultCards.
 */
export function mineMistakesToVaultCards(
  mistakes: Record<string, MistakeEntry>,
  allQuestions: Question[]
): VaultCard[] {
  const qMap = new Map(allQuestions.map((q) => [q.id, q]));
  const cards: VaultCard[] = [];

  for (const entry of Object.values(mistakes)) {
    if (entry.resolved) continue;
    const q = qMap.get(entry.questionId);
    if (!q) continue;

    const cleanPrompt = (q.prompt || '').replace(/\s+/g, ' ').trim();
    const cleanExplanation = (q.explanation || '').replace(/\s+/g, ' ').trim();
    const cleanTrap = (q.wrongOptionAnalysis || entry.userNote || '').replace(/\s+/g, ' ').trim();

    cards.push({
      id: `mistake_card_${sanitizeVaultId(q.id)}`,
      subject: q.subjectId,
      subtopic: q.subtopic || 'Mistake Review',
      tagMatchKeywords: extractKeywords(q.tags ?? [], q.subtopic || '', cleanPrompt.slice(0, 80)),
      kind: entry.errorTag === 'MSQ Trap' ? 'TRAP' : entry.errorTag === 'Silly Math' ? 'EDGE_CASE' : 'TRAP',
      highYield: true,
      title: `${q.subtopic || SUBJECT_MAP[q.subjectId]?.shortName || 'PYQ'} · ${entry.errorTag} (${entry.wrongCount}× missed)`,
      ...(q.codeSnippet ? { codeSnippet: q.codeSnippet.slice(0, 1200) } : {}),
      commonTrap:
        cleanTrap ||
        `Missed ${entry.wrongCount}× under "${entry.errorTag}" on ${q.sourceTag || 'GATE PYQ'}.`,
      gateTruth:
        cleanExplanation.slice(0, 1200) ||
        cleanPrompt.slice(0, 500) ||
        'Re-verify official solution in PYQ Studio.',
      quickExample: cleanPrompt ? `PYQ (${q.sourceTag}): ${cleanPrompt.slice(0, 180)}${cleanPrompt.length > 180 ? '…' : ''}` : undefined,
      source: 'My Mistakes',
      outOf2027Syllabus: q.isOutOf2027Syllabus,
    });
  }

  return cards;
}

/**
 * Adapter: converts any VaultCard into legacy TipItem shape for DashboardView & RapidRevisionView.
 */
export function vaultCardToTipItem(card: VaultCard): TipItem {
  const categoryMap: Record<VaultKind, TipItem['category']> = {
    FORMULA: 'Formula',
    TRAP: 'Exam Trap',
    SHORTCUT: 'Shortcut',
    TIP: 'Shortcut',
    COUNTER_EXAMPLE: 'Exam Trap',
    EDGE_CASE: 'Edge Case',
  };
  const summaryParts = [
    card.commonTrap ? `Trap: ${card.commonTrap}` : '',
    card.quickExample ? `Ex: ${card.quickExample}` : '',
  ].filter(Boolean);

  return {
    id: card.id,
    subjectId: card.subject,
    title: card.title,
    category: categoryMap[card.kind] ?? 'Exam Trap',
    summary: (summaryParts.join(' · ') || card.gateTruth).slice(0, 320),
    detail: card.gateTruth,
    formula: card.formulaLatex,
    isCustom: card.source !== 'Master Bundle',
    trapSource: card.source === 'My Mistakes' ? 'mistake_mined' : 'manual',
  };
}

/**
 * Adapter: converts legacy CustomTip / TrapVaultEntry into unified VaultCard.
 */
export function tipItemToVaultCard(tip: TipItem, defaultSource: VaultSource = 'Custom'): VaultCard {
  const kindMap: Record<TipItem['category'], VaultKind> = {
    Formula: 'FORMULA',
    'Exam Trap': 'TRAP',
    Shortcut: 'SHORTCUT',
    'Edge Case': 'EDGE_CASE',
  };
  const text = `${tip.title} ${tip.summary} ${tip.detail}`;
  return {
    id: tip.id,
    subject: tip.subjectId,
    subtopic: SUBJECT_MAP[tip.subjectId]?.shortName ?? 'Core Concepts',
    tagMatchKeywords: extractKeywords([], tip.title, tip.summary),
    kind: kindMap[tip.category] ?? 'TRAP',
    highYield: true,
    title: tip.title,
    ...(tip.formula ? { formulaLatex: tip.formula } : {}),
    ...(tip.summary && tip.summary !== tip.detail ? { commonTrap: tip.summary } : {}),
    gateTruth: tip.detail || tip.summary,
    source: tip.trapSource === 'mistake_mined' ? 'My Mistakes' : defaultSource,
    outOf2027Syllabus: isRemovedInGate2027(text),
  };
}

/**
 * Matches PYQ bank questions to a VaultCard via weighted tag + subtopic + title + body scoring.
 */
export function matchPyqsForVaultCard(
  card: VaultCard,
  allQuestions: Question[],
  maxCount = 12
): Question[] {
  return findMatchingPyqsForVaultCard(card, allQuestions, undefined, maxCount).questions;
}

export const AI_BULK_VAULT_PROMPT = `Generate 50 exam-grade GATE CSE 2027 Formula, Exam Trap, Counter-Example & Shortcut cards in STRICT valid JSON array format (no prose outside JSON).
Strictly EXCLUDE removed 2027 syllabus topics (COA Secondary Storage/Magnetic Disk; CN ARP, ICMP, DHCP, SMTP, FTP, UDP).
Use ONLY these exact subject codes: "ga", "em", "dl", "coa", "cprog", "ds", "algo", "toc", "cd", "os", "dbms", "cn".
Use ONLY these exact kind values: "FORMULA", "TRAP", "SHORTCUT", "TIP", "COUNTER_EXAMPLE", "EDGE_CASE".

JSON Schema:
[
  {
    "subject": "os",
    "subtopic": "Virtual Memory & TLB",
    "tagMatchKeywords": ["tlb", "paging", "emat"],
    "kind": "FORMULA",
    "highYield": true,
    "title": "TLB + Multi-Level Page Table EMAT",
    "formulaLatex": "\\\\text{EMAT} = h(t_{\\\\text{TLB}} + t_m) + (1-h)(t_{\\\\text{TLB}} + (L+1)t_m)",
    "commonTrap": "Forgetting the +1 final data access on a TLB miss.",
    "gateTruth": "With an L-level page table, a TLB miss takes L table walks plus 1 data access = (L+1) memory accesses.",
    "quickExample": "2-level PT, t_TLB=10ns, t_m=100ns, h=0.9 => 130ns."
  }
]`;
