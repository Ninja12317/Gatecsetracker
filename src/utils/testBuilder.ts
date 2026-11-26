import type {
  MistakeEntry,
  PyqSourceFilter,
  Question,
  QuestionAttemptRecord,
  QuestionFormat,
  SubjectId,
} from '../types/index.ts';
import type { StatusFilterMode, YearRangePreset } from './gaterNormalizer.ts';
import { computePromptContentHash, questionHasAnswerKey } from './arshanNormalizer.ts';

export const SERVED_HISTORY_STORAGE_KEY = 'gate27_served_question_history_v1';

export interface TestBuilderFilterCriteria {
  subjects: SubjectId[];
  tags: string[];
  sourceFilter: PyqSourceFilter;
  yearRange: YearRangePreset;
  specificYear: number | null;
  marks: 'all' | 1 | 2;
  format: 'all' | QuestionFormat;
  status: StatusFilterMode;
  hideRemoved2027: boolean;
  searchQuery: string;
}

export interface ExactTestSelectionResult {
  questions: Question[];
  availableCount: number;
  requestedCount: number;
  shortfall: number;
  freshCount: number;
  recycledCount: number;
}

export function readServedQuestionHistory(): Record<string, number> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SERVED_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        clean[k] = v;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function writeServedQuestionHistory(history: Record<string, number>): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SERVED_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function recordServedQuestions(
  questionIds: string[],
  nowMs: number = Date.now(),
  existing?: Record<string, number>
): Record<string, number> {
  const base = existing ? { ...existing } : readServedQuestionHistory();
  for (const id of questionIds) {
    if (id) base[id] = nowMs;
  }
  writeServedQuestionHistory(base);
  return base;
}

export function resetServedQuestionHistory(): Record<string, number> {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(SERVED_HISTORY_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  return {};
}

/**
 * True unbiased Fisher-Yates (Knuth) shuffle on a shallow copy.
 */
export function fisherYatesShuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deduplicates a question array strictly by BOTH `question.id` AND normalized content hash.
 * When two items share the same content hash, retains the richer entry (preferring verified key + explanation).
 */
export function deduplicateQuestionPool(questions: readonly Question[]): Question[] {
  const byId = new Map<string, Question>();
  const byHash = new Map<string, string>(); // contentHash -> chosen id

  const richnessScore = (q: Question): number =>
    (questionHasAnswerKey(q) ? 10 : 0) +
    (q.explanation && q.explanation.trim().length > 20 ? 4 : 0) +
    (q.optionsExtracted ? 2 : 0) +
    (q.sourceRepo === 'merged' ? 3 : q.sourceRepo === 'arshan' ? 2 : 1);

  for (const q of questions) {
    if (!q || !q.id) continue;
    const hash = computePromptContentHash(q);
    const existingById = byId.get(q.id);
    if (existingById) {
      if (richnessScore(q) > richnessScore(existingById)) {
        byId.set(q.id, q);
      }
      continue;
    }

    const existingIdForHash = byHash.get(hash);
    if (existingIdForHash) {
      const prev = byId.get(existingIdForHash);
      if (prev && richnessScore(q) > richnessScore(prev)) {
        byId.delete(existingIdForHash);
        byId.set(q.id, q);
        byHash.set(hash, q.id);
      }
      continue;
    }

    byId.set(q.id, q);
    byHash.set(hash, q.id);
  }

  return Array.from(byId.values());
}

export function matchesSourceFilter(q: Question, sourceFilter: PyqSourceFilter): boolean {
  switch (sourceFilter) {
    case 'all':
      return true;
    case 'pyq_only':
      return (q.sourceCategory ?? 'PYQ') === 'PYQ';
    case 'extra_predicted':
      return q.sourceCategory === 'PREDICTED_2027' || q.sourceCategory === 'EXTRA_PRACTICE';
    case 'verified_only':
      return questionHasAnswerKey(q);
    case 'arshan_bank':
      return q.sourceRepo === 'arshan' || q.sourceRepo === 'merged' || Boolean(q.isArshan);
    case 'gater_bank':
      return q.sourceRepo === 'gater' || q.sourceRepo === 'merged' || Boolean(q.isGateR);
  }
}

/**
 * Filter-first, deduplicated pool computation.
 * NEVER silently drops questions without answer keys unless `sourceFilter === 'verified_only'`.
 */
export function computeUniqueFilteredPool(
  allQuestions: readonly Question[],
  criteria: TestBuilderFilterCriteria,
  attempts: Record<string, QuestionAttemptRecord>,
  mistakes: Record<string, MistakeEntry>,
  bookmarkedIds: readonly string[]
): Question[] {
  const uniqueAll = deduplicateQuestionPool(allQuestions);
  const subjectSet = criteria.subjects.length > 0 ? new Set(criteria.subjects) : null;
  const tagSet =
    criteria.tags.length > 0 ? new Set(criteria.tags.map((t) => t.toLowerCase())) : null;
  const bookmarkSet = criteria.status === 'bookmarked' ? new Set(bookmarkedIds) : null;
  const queryText = criteria.searchQuery.trim().toLowerCase();

  return uniqueAll.filter((q) => {
    if (criteria.hideRemoved2027 && q.isOutOf2027Syllabus) return false;
    if (!matchesSourceFilter(q, criteria.sourceFilter)) return false;
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
      if (
        criteria.yearRange === 'specific' &&
        criteria.specificYear &&
        y !== criteria.specificYear
      ) {
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
      const inSource = q.sourceTag.toLowerCase().includes(queryText);
      const inTags = (q.tags ?? []).some((t) => t.toLowerCase().includes(queryText));
      if (!inTitle && !inPrompt && !inSubtopic && !inSource && !inTags) return false;
    }

    return true;
  });
}

/**
 * Computes live per-subject unique matching counts under the current non-subject filters
 * so every subject chip count aligns 100% with the Test Builder filter state.
 */
export function computeSubjectMatchCounts(
  allQuestions: readonly Question[],
  criteria: TestBuilderFilterCriteria,
  attempts: Record<string, QuestionAttemptRecord>,
  mistakes: Record<string, MistakeEntry>,
  bookmarkedIds: readonly string[]
): Record<string, number> {
  const poolWithoutSubjectFilter = computeUniqueFilteredPool(
    allQuestions,
    { ...criteria, subjects: [] },
    attempts,
    mistakes,
    bookmarkedIds
  );
  const counts: Record<string, number> = {};
  for (const q of poolWithoutSubjectFilter) {
    counts[q.subjectId] = (counts[q.subjectId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Computes live counts for each Source Filter pill under current non-source filters.
 */
export function computeSourceFilterCounts(
  allQuestions: readonly Question[],
  hideRemoved2027: boolean
): Record<PyqSourceFilter, number> {
  const unique = deduplicateQuestionPool(allQuestions).filter(
    (q) => !(hideRemoved2027 && q.isOutOf2027Syllabus)
  );
  const counts: Record<PyqSourceFilter, number> = {
    all: unique.length,
    pyq_only: 0,
    extra_predicted: 0,
    verified_only: 0,
    arshan_bank: 0,
    gater_bank: 0,
  };
  for (const q of unique) {
    if (matchesSourceFilter(q, 'pyq_only')) counts.pyq_only += 1;
    if (matchesSourceFilter(q, 'extra_predicted')) counts.extra_predicted += 1;
    if (matchesSourceFilter(q, 'verified_only')) counts.verified_only += 1;
    if (matchesSourceFilter(q, 'arshan_bank')) counts.arshan_bank += 1;
    if (matchesSourceFilter(q, 'gater_bank')) counts.gater_bank += 1;
  }
  return counts;
}

/**
 * Exact-count, zero-duplicate, anti-repeat Test Builder selector:
 * - Bucket A (Fresh / Never Seen): not in `attemptedIds` and not in `servedHistory`.
 * - Bucket B (Previously Seen): ordered oldest `lastServedTimestamp` first, with Fisher-Yates
 *   shuffling within timestamp tiers so recycled questions still rotate cleanly.
 * - Guarantees `selected.length === Math.min(requestedCount, uniquePool.length)` and `0` duplicates.
 */
export function buildExactCountTest(params: {
  pool: readonly Question[];
  requestedCount: number; // Pass 9999 (or >= pool.length) for "All Matched"
  attemptedIds: ReadonlySet<string> | Record<string, unknown>;
  servedHistory: Record<string, number>;
  shuffleOrder?: boolean;
  rng?: () => number;
}): ExactTestSelectionResult {
  const {
    pool,
    requestedCount,
    attemptedIds,
    servedHistory,
    shuffleOrder = true,
    rng = Math.random,
  } = params;

  const uniquePool = deduplicateQuestionPool(pool);
  const availableCount = uniquePool.length;
  const effectiveRequested =
    requestedCount === 9999 ? availableCount : Math.max(1, Math.floor(requestedCount));
  const targetCount = Math.min(effectiveRequested, availableCount);
  const shortfall = Math.max(0, effectiveRequested - availableCount);

  if (targetCount === 0) {
    return {
      questions: [],
      availableCount: 0,
      requestedCount: effectiveRequested,
      shortfall,
      freshCount: 0,
      recycledCount: 0,
    };
  }

  const isAttempted = (id: string): boolean =>
    attemptedIds instanceof Set
      ? attemptedIds.has(id)
      : Boolean((attemptedIds as Record<string, unknown>)[id]);

  const bucketA: Question[] = [];
  const bucketB: Question[] = [];

  for (const q of uniquePool) {
    const seenTs = servedHistory[q.id];
    if (!isAttempted(q.id) && !(typeof seenTs === 'number' && seenTs > 0)) {
      bucketA.push(q);
    } else {
      bucketB.push(q);
    }
  }

  const orderedA = shuffleOrder
    ? fisherYatesShuffle(bucketA, rng)
    : [...bucketA].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  // Take strictly without replacement from Bucket A first
  const selected: Question[] = orderedA.slice(0, targetCount);
  const freshCount = selected.length;
  let recycledCount = 0;

  if (selected.length < targetCount && bucketB.length > 0) {
    const needed = targetCount - selected.length;

    // Group Bucket B by lastServedTimestamp (oldest first; attempted-but-not-in-servedHistory = ts 1)
    const tiers = new Map<number, Question[]>();
    for (const q of bucketB) {
      const ts = servedHistory[q.id] ?? 1;
      const group = tiers.get(ts) ?? [];
      group.push(q);
      tiers.set(ts, group);
    }

    const sortedTimestamps = Array.from(tiers.keys()).sort((a, b) => a - b);
    const orderedB: Question[] = [];
    for (const ts of sortedTimestamps) {
      const tierItems = tiers.get(ts) ?? [];
      const tierOrdered = shuffleOrder
        ? fisherYatesShuffle(tierItems, rng)
        : [...tierItems].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      orderedB.push(...tierOrdered);
    }

    const chosenIds = new Set(selected.map((q) => q.id));
    for (const q of orderedB) {
      if (selected.length >= targetCount) break;
      if (chosenIds.has(q.id)) continue;
      chosenIds.add(q.id);
      selected.push(q);
      recycledCount += 1;
      if (recycledCount >= needed) break;
    }
  }

  return {
    questions: selected,
    availableCount,
    requestedCount: effectiveRequested,
    shortfall,
    freshCount,
    recycledCount,
  };
}
