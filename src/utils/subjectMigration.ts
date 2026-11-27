import type {
  MockSubjectId,
  Question,
  SubjectId,
  SubtopicProgress,
  TipItem,
  VaultCard,
  VaultPack,
  WarRoomState,
} from '../types';

export const CANONICAL_SUBJECT_IDS: readonly SubjectId[] = [
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
] as const;

export const CANONICAL_SUBJECT_SET = new Set<string>(CANONICAL_SUBJECT_IDS);

const C_PROG_KEYWORDS = [
  'c-programming',
  'c programming',
  'programming-in-c',
  'programming in c',
  'pointer',
  'pointers',
  'double pointer',
  'recursion',
  'recursive',
  'static',
  'storage class',
  'storage-class',
  'storage-classes',
  'sizeof',
  'printf',
  'scanf',
  'macro',
  'macros',
  'preprocessor',
  'struct',
  'structs',
  'union',
  'typedef',
  'parameter passing',
  'parameter-passing',
  'call by value',
  'call by reference',
  'scoping',
  'lexical scope',
  'dynamic scope',
  'sequence point',
  'undefined behavior',
  'operator precedence',
  'bitwise',
  'string literal',
  'strings',
  'char *',
  'malloc',
  'calloc',
  'free(',
  'main(',
  'int main',
  '#include',
  'switch',
  'for loop',
  'while loop',
  'do while',
  'function pointer',
  'activation record',
  'dangling pointer',
];

const DS_KEYWORDS = [
  'data-structure',
  'data structure',
  'data-structures',
  'data structures',
  'linked list',
  'linked-list',
  'singly linked',
  'doubly linked',
  'circular linked',
  'stack',
  'stacks',
  'queue',
  'queues',
  'circular queue',
  'priority queue',
  'postfix',
  'prefix',
  'infix',
  'binary tree',
  'binary-tree',
  'binary search tree',
  'bst',
  'avl',
  'red-black',
  'b-tree',
  'tree traversal',
  'inorder',
  'preorder',
  'postorder',
  'level order',
  'catalan',
  'heap',
  'heaps',
  'max-heap',
  'min-heap',
  'binary heap',
  'hashing',
  'hash table',
  'open addressing',
  'linear probing',
  'quadratic probing',
  'double hashing',
  'chaining',
  'graph representation',
  'adjacency list',
  'adjacency matrix',
  'disjoint set',
  'trie',
  'deque',
];

/**
 * Smart classifier that routes legacy "Programming & Data Structures" (pds) content
 * cleanly into either 'cprog' (05. C Programming) or 'ds' (06. Data Structures).
 */
export function classifyPdsToCprogOrDs(context?: {
  tags?: string[];
  subtopic?: string;
  title?: string;
  text?: string;
}): 'cprog' | 'ds' {
  if (!context) return 'ds';

  const primaryHaystack = [
    ...(context.tags ?? []),
    context.subtopic ?? '',
    context.title ?? '',
  ]
    .join(' ')
    .toLowerCase();

  const bodyHaystack = (context.text ?? '').toLowerCase();

  let cScore = 0;
  let dsScore = 0;

  for (const kw of C_PROG_KEYWORDS) {
    if (primaryHaystack.includes(kw)) cScore += 4;
    else if (bodyHaystack.includes(kw)) cScore += 1;
  }

  for (const kw of DS_KEYWORDS) {
    if (primaryHaystack.includes(kw)) dsScore += 4;
    else if (bodyHaystack.includes(kw)) dsScore += 1;
  }

  // Explicit C code markers inside question body strongly indicate C Programming
  // unless DS structures dominate the title/tags.
  if (
    /#include\s*<stdio\.h>|printf\s*\(|int\s+main\s*\(|static\s+int\b|sizeof\s*\(/.test(
      bodyHaystack
    )
  ) {
    cScore += 3;
  }

  // Exact tag shortcuts
  const loweredTags = (context.tags ?? []).map((t) => t.trim().toLowerCase());
  if (
    loweredTags.some(
      (t) =>
        t === 'c-programming' ||
        t === 'programming-in-c' ||
        t === 'c programming' ||
        t === 'cprog' ||
        t === 'programming'
    )
  ) {
    cScore += 6;
  }
  if (
    loweredTags.some(
      (t) =>
        t === 'data-structures' ||
        t === 'data structures' ||
        t === 'binary-search-trees' ||
        t === 'binary-trees' ||
        t === 'binary-heaps' ||
        t === 'linked-lists' ||
        t === 'stacks' ||
        t === 'queues' ||
        t === 'avl-trees' ||
        t === 'hashing' ||
        t === 'ds'
    )
  ) {
    dsScore += 6;
  }

  if (cScore > dsScore) return 'cprog';
  if (dsScore > cScore) return 'ds';

  // Tie-breaker: if title/subtopic mentions 'c ' or 'pointer' or 'recursion', prefer cprog
  if (/\bc\b|pointer|recurs|output of|static|scope|struct/.test(primaryHaystack)) {
    return 'cprog';
  }
  return 'ds';
}

/**
 * Normalizes any raw subject string (including legacy 'pds' or full subject titles)
 * into one of the 12 canonical GATE CSE 2027 SubjectIds.
 */
export function normalizeSubject12(
  raw: string | undefined | null,
  context?: {
    tags?: string[];
    subtopic?: string;
    title?: string;
    text?: string;
  },
  fallback: SubjectId = 'algo'
): SubjectId {
  const cleaned = String(raw ?? '').trim().toLowerCase();
  if (CANONICAL_SUBJECT_SET.has(cleaned)) {
    return cleaned as SubjectId;
  }
  if (
    cleaned === 'pds' ||
    cleaned === 'programming & data structures' ||
    cleaned === 'programming and data structures' ||
    cleaned === 'prog & ds'
  ) {
    return classifyPdsToCprogOrDs(context);
  }
  if (
    cleaned === 'c' ||
    cleaned === 'c-programming' ||
    cleaned === 'c programming' ||
    cleaned === 'programming in c' ||
    cleaned === 'programming'
  ) {
    return 'cprog';
  }
  if (
    cleaned === 'data structures' ||
    cleaned === 'data-structures' ||
    cleaned === 'data structure'
  ) {
    return 'ds';
  }
  if (cleaned.includes('aptitude') || cleaned === 'verbal' || cleaned === 'quantitative') {
    return 'ga';
  }
  if (cleaned.includes('math') || cleaned.includes('discrete') || cleaned === 'dm') {
    return 'em';
  }
  if (cleaned.includes('digital')) return 'dl';
  if (cleaned.includes('organization') || cleaned.includes('architecture') || cleaned === 'co') {
    return 'coa';
  }
  if (cleaned.includes('algorithm')) return 'algo';
  if (cleaned.includes('computation') || cleaned.includes('automata')) return 'toc';
  if (cleaned.includes('compiler')) return 'cd';
  if (cleaned.includes('operating')) return 'os';
  if (cleaned.includes('database') || cleaned === 'db') return 'dbms';
  if (cleaned.includes('network')) return 'cn';

  return fallback;
}

/**
 * Strictly validates that a question's sourceUrl actually points to gateoverflow.in.
 * Prevents Arshan GitHub URLs or arbitrary links from rendering "Open GateOverflow Solution".
 */
export function hasGateOverflowUrl(
  q: Pick<Question, 'sourceUrl'> | { sourceUrl?: string | null } | null | undefined
): boolean {
  if (!q || typeof q.sourceUrl !== 'string') return false;
  const trimmed = q.sourceUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      (host === 'gateoverflow.in' || host === 'www.gateoverflow.in' || host.endsWith('.gateoverflow.in'))
    );
  } catch {
    return false;
  }
}

/**
 * Migrates a cached Question (from IndexedDB, localStorage, or Firestore) from legacy 'pds'
 * to 'cprog' or 'ds' cleanly without mutating the input object.
 */
export function migrateLegacyQuestion(q: Question): Question {
  const rawSubject = q.subjectId as string;
  if (CANONICAL_SUBJECT_SET.has(rawSubject)) {
    return q;
  }
  const nextSubject = normalizeSubject12(rawSubject, {
    tags: q.tags,
    subtopic: q.subtopic,
    title: q.title,
    text: `${q.prompt ?? ''} ${q.codeSnippet ?? ''}`,
  });
  return {
    ...q,
    subjectId: nextSubject,
  };
}

export function migrateLegacyQuestionList(questions: Question[]): Question[] {
  let changed = false;
  const next = questions.map((q) => {
    const migrated = migrateLegacyQuestion(q);
    if (migrated !== q) changed = true;
    return migrated;
  });
  return changed ? next : questions;
}

export function migrateLegacyVaultCard(card: VaultCard): VaultCard {
  const rawSubject = card.subject as string;
  if (CANONICAL_SUBJECT_SET.has(rawSubject)) return card;
  const nextSubject = normalizeSubject12(rawSubject, {
    tags: card.tagMatchKeywords,
    subtopic: card.subtopic,
    title: card.title,
    text: `${card.gateTruth ?? ''} ${card.commonTrap ?? ''} ${card.codeSnippet ?? ''}`,
  });
  return {
    ...card,
    subject: nextSubject,
  };
}

export function migrateLegacyTip(tip: TipItem): TipItem {
  const rawSubject = tip.subjectId as string;
  if (CANONICAL_SUBJECT_SET.has(rawSubject)) return tip;
  const nextSubject = normalizeSubject12(rawSubject, {
    title: tip.title,
    text: `${tip.summary ?? ''} ${tip.detail ?? ''}`,
  });
  return {
    ...tip,
    subjectId: nextSubject,
  };
}

const LEGACY_SUBTOPIC_MAP: Record<string, string[]> = {
  'pds-c': ['cprog-basics', 'cprog-pointers'],
  'pds-rec': ['cprog-rec'],
  'pds-linear': ['ds-linear'],
  'pds-trees': ['ds-trees'],
  'pds-heaps': ['ds-heaps'],
};

export function migrateLegacyProgressMap(
  rawProgress: Record<string, SubtopicProgress> | undefined | null
): Record<string, SubtopicProgress> {
  if (!rawProgress || typeof rawProgress !== 'object') return {};
  const next: Record<string, SubtopicProgress> = {};

  for (const [key, val] of Object.entries(rawProgress)) {
    if (!val || typeof val !== 'object') continue;
    const mappedTargets = LEGACY_SUBTOPIC_MAP[key];
    if (mappedTargets) {
      for (const targetId of mappedTargets) {
        if (!next[targetId]) {
          next[targetId] = { ...val };
        }
      }
    } else {
      next[key] = { ...val };
    }
  }
  return next;
}

export function migrateLegacyMockSubject(
  raw: string | undefined,
  name?: string,
  notes?: string
): MockSubjectId | undefined {
  if (!raw) return undefined;
  if (raw === 'all') return 'all';
  if (CANONICAL_SUBJECT_SET.has(raw)) return raw as SubjectId;
  if (raw === 'pds') {
    return classifyPdsToCprogOrDs({ title: name, text: notes });
  }
  return normalizeSubject12(raw, { title: name, text: notes });
}

/**
 * Safely migrates a full WarRoomState loaded from localStorage, backup JSON, or Firestore
 * so legacy 'pds' progress, logs, mocks, custom questions, tips, and vault packs map cleanly
 * to the 12-subject schema without losing any user data.
 */
export function migrateLegacyWarRoomState(state: WarRoomState): WarRoomState {
  const progress = migrateLegacyProgressMap(state.progress);

  const studyLogs = (state.studyLogs ?? []).map((log) => {
    const rawSub = log.subjectId as string;
    if (CANONICAL_SUBJECT_SET.has(rawSub)) return log;
    return {
      ...log,
      subjectId: normalizeSubject12(rawSub, {
        title: log.goal,
        text: log.resumeNote,
      }),
    };
  });

  const mocks = (state.mocks ?? []).map((m) => {
    const nextSubject = migrateLegacyMockSubject(m.subjectId as string | undefined, m.name, m.notes);
    return nextSubject === m.subjectId ? m : { ...m, subjectId: nextSubject };
  });

  const customQuestions = migrateLegacyQuestionList(state.customQuestions ?? []);
  const customTips = (state.customTips ?? []).map(migrateLegacyTip);
  const trapsVault = (state.trapsVault ?? []).map(migrateLegacyTip);
  const vaultPacks: VaultPack[] = (state.vaultPacks ?? []).map((pack) => ({
    ...pack,
    cards: (pack.cards ?? []).map(migrateLegacyVaultCard),
  }));

  const testHistory = Array.isArray(state.testHistory) ? state.testHistory : [];

  return {
    ...state,
    progress,
    studyLogs,
    mocks,
    customQuestions,
    customTips,
    trapsVault,
    vaultPacks,
    testHistory,
  };
}
