import type {
  DailyProgressState,
  DailyTestRecord,
  Question,
  QuestionAttemptRecord,
  SubjectDefinition,
  SubjectId,
  SubtopicProgress,
} from '../types/index.ts';
import { deduplicateQuestionPool } from './testBuilder.ts';

export interface DailyPoolStats {
  totalEligible: number;
  usedCount: number;
  remainingUnseen: number;
  cycleCount: number;
}

export interface ThreePhaseRoadmapProgress {
  activePhase: 1 | 2 | 3;
  daysLeft: number;
  dayNumber: number; // 1..70
  overallPct: number;
  phases: Array<{
    phase: 1 | 2 | 3;
    title: string;
    subtitle: string;
    rangeLabel: string;
    progressPct: number;
    status: 'completed' | 'active' | 'upcoming';
  }>;
}

/**
 * Deterministic 32-bit FNV-1a hash used to shuffle candidate pools deterministically per IST date
 * so two reloads on the same day produce the exact same order without Math.random() flakiness.
 */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicScore(dateIso: string, salt: string, id: string): number {
  return hashSeed(`${dateIso}::${salt}::${id}`);
}

export function createEmptyDailyProgress(): DailyProgressState {
  return {
    usedDailyDppIds: [],
    dailyDppByDate: {},
    usedDailyGaIds: [],
    dailyGaByDate: {},
  };
}

/**
 * Computes each CSE subject's weakness priority (higher score = more urgent to drill in Daily DPP).
 * Prioritizes subjects with lower mastery and more unrevised/not-started subtopics.
 */
function computeSubjectPriorityOrder(
  syllabus: SubjectDefinition[],
  progress: Record<string, SubtopicProgress>,
  dateIso: string
): SubjectId[] {
  const coreSubjects = syllabus.filter((s) => s.id !== 'ga');
  const scored = coreSubjects.map((subj) => {
    const total = Math.max(1, subj.subtopics.length);
    let scoreSum = 0;
    for (const sub of subj.subtopics) {
      const st = progress[sub.id]?.status ?? 'not_started';
      if (st === 'mastered') scoreSum += 1;
      else if (st === 'pyqs_done') scoreSum += 0.72;
      else if (st === 'concept_done') scoreSum += 0.35;
    }
    const masteryRatio = scoreSum / total;
    // Lower mastery & higher weightage => higher urgency; tiny deterministic tie-breaker per day
    const tie = (hashSeed(`${dateIso}::subj::${subj.id}`) % 100) / 10000;
    const urgency = (1 - masteryRatio) * 1.4 + (subj.weightage / 20) * 0.3 + tie;
    return { id: subj.id, urgency };
  });

  scored.sort((a, b) => b.urgency - a.urgency);
  return scored.map((x) => x.id);
}

/**
 * Generates or retrieves today's locked 10-question Daily Mixed DPP from the full PYQ bank.
 *
 * Guarantees:
 * 1. Locks the exact 10 question IDs for `todayIst` in `dailyDppByDate[todayIst]`.
 * 2. Never repeats any ID in `usedDailyDppIds` until the entire eligible pool is exhausted
 *    (at which point it gracefully rolls over only the remaining needed count from the fresh cycle).
 * 3. Balanced across core CSE subjects (max 2 Qs/subject when possible), prioritizing weak/unrevised subjects.
 * 4. Respects `hideRemoved2027` flag automatically.
 */
export function selectOrGetDailyDpp(params: {
  todayIst: string;
  allQuestions: Question[];
  dailyProgress: DailyProgressState;
  syllabus: SubjectDefinition[];
  progress: Record<string, SubtopicProgress>;
  attempts: Record<string, QuestionAttemptRecord>;
  hideRemoved2027?: boolean;
  count?: number;
}): {
  record: DailyTestRecord;
  questions: Question[];
  rolledOverPool: boolean;
  updatedProgress: DailyProgressState;
} {
  const {
    todayIst,
    allQuestions,
    dailyProgress,
    syllabus,
    progress,
    attempts,
    hideRemoved2027 = true,
    count = 10,
  } = params;

  const qById = new Map(allQuestions.map((q) => [q.id, q]));

  // 1. If today already has a locked DPP record with resolvable questions, return it verbatim.
  const existing = dailyProgress.dailyDppByDate[todayIst];
  if (existing && existing.questionIds.length > 0) {
    const resolved = existing.questionIds
      .map((id) => qById.get(id))
      .filter((q): q is Question => Boolean(q));
    if (resolved.length > 0) {
      return {
        record: existing,
        questions: resolved,
        rolledOverPool: false,
        updatedProgress: dailyProgress,
      };
    }
  }

  // 2. Build deduplicated eligible core-CSE pool (exclude removed 2027 topics when enabled; prefer non-GA core CS first)
  const validAll = deduplicateQuestionPool(
    allQuestions.filter((q) => !(hideRemoved2027 && q.isOutOf2027Syllabus))
  );
  const corePool = validAll.filter((q) => q.subjectId !== 'ga');
  const primaryPool = corePool.length >= count ? corePool : validAll;

  const usedSet = new Set(dailyProgress.usedDailyDppIds);
  const unseenPool = primaryPool.filter((q) => !usedSet.has(q.id));

  let rolledOverPool = false;
  let workingPool = unseenPool;
  let nextUsedIds = [...dailyProgress.usedDailyDppIds];

  // If fewer than `count` unseen remain, take all remaining unseen first, then roll over cleanly
  const selected: Question[] = [];
  const pickedIds = new Set<string>();

  const subjectOrder = computeSubjectPriorityOrder(syllabus, progress, todayIst);

  const pickBalancedFrom = (pool: Question[], limit: number) => {
    // Group pool by subject and sort deterministically (unattempted first, then verified/newer, then daily hash)
    const buckets = new Map<SubjectId, Question[]>();
    for (const q of pool) {
      if (pickedIds.has(q.id)) continue;
      const arr = buckets.get(q.subjectId) ?? [];
      arr.push(q);
      buckets.set(q.subjectId, arr);
    }

    for (const [, list] of buckets) {
      list.sort((a, b) => {
        const aAtt = attempts[a.id] ? 1 : 0;
        const bAtt = attempts[b.id] ? 1 : 0;
        if (aAtt !== bAtt) return aAtt - bAtt;
        const ha = deterministicScore(todayIst, 'dpp', a.id);
        const hb = deterministicScore(todayIst, 'dpp', b.id);
        return ha - hb;
      });
    }

    const orderWithFallback: SubjectId[] = [
      ...subjectOrder,
      ...Array.from(buckets.keys()).filter((s) => !subjectOrder.includes(s)),
    ];

    // Round-robin across priority subjects for balanced coverage
    let madeProgress = true;
    while (selected.length < limit && madeProgress) {
      madeProgress = false;
      for (const subjId of orderWithFallback) {
        if (selected.length >= limit) break;
        const bucket = buckets.get(subjId);
        if (!bucket || bucket.length === 0) continue;
        const nextQ = bucket.shift()!;
        if (!pickedIds.has(nextQ.id)) {
          selected.push(nextQ);
          pickedIds.add(nextQ.id);
          madeProgress = true;
        }
      }
    }
  };

  pickBalancedFrom(workingPool, count);

  if (selected.length < count && primaryPool.length > selected.length) {
    // Entire pool exhausted -> reset cycle cleanly while keeping already-picked unseen questions first
    rolledOverPool = true;
    nextUsedIds = [];
    const rolloverCandidates = primaryPool.filter((q) => !pickedIds.has(q.id));
    pickBalancedFrom(rolloverCandidates, count);
  }

  const maxMarks = selected.reduce((acc, q) => acc + q.marks, 0);
  const record: DailyTestRecord = {
    date: todayIst,
    questionIds: selected.map((q) => q.id),
    completed: false,
    score: 0,
    maxMarks,
    accuracy: 0,
    attemptedCount: 0,
    correctCount: 0,
  };

  const updatedProgress: DailyProgressState = {
    ...dailyProgress,
    usedDailyDppIds: nextUsedIds,
    dailyDppByDate: {
      ...dailyProgress.dailyDppByDate,
      [todayIst]: record,
    },
  };

  return {
    record,
    questions: selected,
    rolledOverPool,
    updatedProgress,
  };
}

/**
 * Generates or retrieves today's locked 5-question Daily 10-Min GA Test from unseen GA PYQs.
 * Never repeats any prior day's GA question until the full GA pool is exhausted.
 */
export function selectOrGetDailyGa(params: {
  todayIst: string;
  allQuestions: Question[];
  dailyProgress: DailyProgressState;
  attempts: Record<string, QuestionAttemptRecord>;
  hideRemoved2027?: boolean;
  count?: number;
}): {
  record: DailyTestRecord;
  questions: Question[];
  rolledOverPool: boolean;
  updatedProgress: DailyProgressState;
} {
  const {
    todayIst,
    allQuestions,
    dailyProgress,
    attempts,
    hideRemoved2027 = true,
    count = 5,
  } = params;

  const qById = new Map(allQuestions.map((q) => [q.id, q]));

  // 1. Return today's locked GA test if already created
  const existing = dailyProgress.dailyGaByDate[todayIst];
  if (existing && existing.questionIds.length > 0) {
    const resolved = existing.questionIds
      .map((id) => qById.get(id))
      .filter((q): q is Question => Boolean(q));
    if (resolved.length > 0) {
      return {
        record: existing,
        questions: resolved,
        rolledOverPool: false,
        updatedProgress: dailyProgress,
      };
    }
  }

  const validAllGa = deduplicateQuestionPool(
    allQuestions.filter((q) => !(hideRemoved2027 && q.isOutOf2027Syllabus))
  );
  const gaPool = validAllGa.filter((q) => q.subjectId === 'ga');
  const fallbackPool = gaPool.length > 0 ? gaPool : validAllGa;

  const usedSet = new Set(dailyProgress.usedDailyGaIds);
  const unseenGa = fallbackPool.filter((q) => !usedSet.has(q.id));

  const sortCandidates = (list: Question[]): Question[] =>
    [...list].sort((a, b) => {
      const aAtt = attempts[a.id] ? 1 : 0;
      const bAtt = attempts[b.id] ? 1 : 0;
      if (aAtt !== bAtt) return aAtt - bAtt;
      return deterministicScore(todayIst, 'ga', a.id) - deterministicScore(todayIst, 'ga', b.id);
    });

  const selected: Question[] = [];
  const pickedIds = new Set<string>();
  let rolledOverPool = false;
  let nextUsedIds = [...dailyProgress.usedDailyGaIds];

  // Try to pick a realistic GATE GA mix (both 1-mark and 2-mark questions if available)
  const pickMix = (pool: Question[], limit: number) => {
    const sorted = sortCandidates(pool.filter((q) => !pickedIds.has(q.id)));
    const oneM = sorted.filter((q) => q.marks === 1);
    const twoM = sorted.filter((q) => q.marks === 2);
    // Target up to 2 one-mark and 3 two-mark (matches GATE GA 15M ratio)
    let i1 = 0;
    let i2 = 0;
    while (selected.length < limit && (i1 < oneM.length || i2 < twoM.length)) {
      if (i1 < oneM.length && selected.filter((q) => q.marks === 1).length < 2) {
        const q = oneM[i1++];
        if (!pickedIds.has(q.id)) {
          selected.push(q);
          pickedIds.add(q.id);
        }
      }
      if (selected.length < limit && i2 < twoM.length) {
        const q = twoM[i2++];
        if (!pickedIds.has(q.id)) {
          selected.push(q);
          pickedIds.add(q.id);
        }
      }
      if (
        selected.length < limit &&
        i2 >= twoM.length &&
        i1 < oneM.length
      ) {
        const q = oneM[i1++];
        if (!pickedIds.has(q.id)) {
          selected.push(q);
          pickedIds.add(q.id);
        }
      }
      if (i1 >= oneM.length && i2 >= twoM.length) break;
    }
  };

  pickMix(unseenGa, count);

  if (selected.length < count && fallbackPool.length > selected.length) {
    rolledOverPool = true;
    nextUsedIds = [];
    pickMix(fallbackPool, count);
  }

  const maxMarks = selected.reduce((acc, q) => acc + q.marks, 0);
  const record: DailyTestRecord = {
    date: todayIst,
    questionIds: selected.map((q) => q.id),
    completed: false,
    score: 0,
    maxMarks,
    accuracy: 0,
    attemptedCount: 0,
    correctCount: 0,
  };

  const updatedProgress: DailyProgressState = {
    ...dailyProgress,
    usedDailyGaIds: nextUsedIds,
    dailyGaByDate: {
      ...dailyProgress.dailyGaByDate,
      [todayIst]: record,
    },
  };

  return {
    record,
    questions: selected,
    rolledOverPool,
    updatedProgress,
  };
}

/**
 * Records completion of today's Daily DPP or Daily GA test, permanently adding its question IDs
 * into `usedDailyDppIds` / `usedDailyGaIds` so they will never repeat on future days.
 */
export function recordDailyTestCompletion(params: {
  kind: 'dpp' | 'ga';
  todayIst: string;
  dailyProgress: DailyProgressState;
  questionIds: string[];
  score: number;
  maxMarks: number;
  accuracy: number;
  attemptedCount: number;
  correctCount: number;
  durationSeconds?: number;
  responses?: Record<string, string>;
}): DailyProgressState {
  const {
    kind,
    todayIst,
    dailyProgress,
    questionIds,
    score,
    maxMarks,
    accuracy,
    attemptedCount,
    correctCount,
    durationSeconds,
    responses,
  } = params;

  const cleanScore = Math.round(score * 100) / 100;
  const cleanAccuracy = Math.max(0, Math.min(100, Math.round(accuracy)));

  const completedRecord: DailyTestRecord = {
    date: todayIst,
    questionIds,
    completed: true,
    score: cleanScore,
    maxMarks,
    accuracy: cleanAccuracy,
    attemptedCount,
    correctCount,
    durationSeconds,
    responses,
    completedAt: new Date().toISOString(),
  };

  if (kind === 'dpp') {
    const mergedUsed = Array.from(new Set([...dailyProgress.usedDailyDppIds, ...questionIds]));
    return {
      ...dailyProgress,
      usedDailyDppIds: mergedUsed,
      dailyDppByDate: {
        ...dailyProgress.dailyDppByDate,
        [todayIst]: completedRecord,
      },
    };
  }

  const mergedUsed = Array.from(new Set([...dailyProgress.usedDailyGaIds, ...questionIds]));
  return {
    ...dailyProgress,
    usedDailyGaIds: mergedUsed,
    dailyGaByDate: {
      ...dailyProgress.dailyGaByDate,
      [todayIst]: completedRecord,
    },
  };
}

export function computeDailyPoolStats(
  kind: 'dpp' | 'ga',
  allQuestions: Question[],
  dailyProgress: DailyProgressState,
  hideRemoved2027 = true
): DailyPoolStats {
  const validAll = deduplicateQuestionPool(
    allQuestions.filter((q) => !(hideRemoved2027 && q.isOutOf2027Syllabus))
  );
  const pool =
    kind === 'ga'
      ? validAll.filter((q) => q.subjectId === 'ga')
      : validAll.filter((q) => q.subjectId !== 'ga');

  const usedIds = new Set(
    kind === 'ga' ? dailyProgress.usedDailyGaIds : dailyProgress.usedDailyDppIds
  );
  const usedInPool = pool.filter((q) => usedIds.has(q.id)).length;
  const remainingUnseen = Math.max(0, pool.length - usedInPool);
  const completedDays = Object.values(
    kind === 'ga' ? dailyProgress.dailyGaByDate : dailyProgress.dailyDppByDate
  ).filter((r) => r.completed).length;

  return {
    totalEligible: pool.length,
    usedCount: usedInPool,
    remainingUnseen,
    cycleCount: Math.floor(completedDays / Math.max(1, Math.floor(pool.length / (kind === 'ga' ? 5 : 10)))) + 1,
  };
}

/**
 * Computes the 3-Phase 70-Day GATE CSE 2027 Preparation Progress Bar for the Overview tab.
 * Phase 1 (Days 1–30): Core Build & Concepts
 * Phase 2 (Days 31–55): PYQ Mastery & Weak Fixes
 * Phase 3 (Days 56–70): Full Mocks & Rapid Revision
 */
export function computeThreePhaseRoadmap(daysLeft: number): ThreePhaseRoadmapProgress {
  const safeDaysLeft = Math.max(0, Math.round(daysLeft));
  const elapsedDays = Math.max(0, Math.min(70, 70 - safeDaysLeft));
  const dayNumber = Math.max(1, Math.min(70, elapsedDays === 0 ? 1 : elapsedDays));
  const overallPct = Math.round((elapsedDays / 70) * 100);

  const p1Pct = Math.round((Math.min(30, elapsedDays) / 30) * 100);
  const p2Pct =
    elapsedDays <= 30 ? 0 : Math.round((Math.min(25, elapsedDays - 30) / 25) * 100);
  const p3Pct =
    elapsedDays <= 55 ? 0 : Math.round((Math.min(15, elapsedDays - 55) / 15) * 100);

  const activePhase: 1 | 2 | 3 = elapsedDays < 30 ? 1 : elapsedDays < 55 ? 2 : 3;

  return {
    activePhase,
    daysLeft: safeDaysLeft,
    dayNumber,
    overallPct,
    phases: [
      {
        phase: 1,
        title: 'Phase 1 · Core Build',
        subtitle: 'Syllabus & Concepts',
        rangeLabel: 'Days 1–30',
        progressPct: p1Pct,
        status: activePhase > 1 ? 'completed' : 'active',
      },
      {
        phase: 2,
        title: 'Phase 2 · PYQ Drill',
        subtitle: 'PYQs & Weak Fixes',
        rangeLabel: 'Days 31–55',
        progressPct: p2Pct,
        status: activePhase > 2 ? 'completed' : activePhase === 2 ? 'active' : 'upcoming',
      },
      {
        phase: 3,
        title: 'Phase 3 · Final Mocks',
        subtitle: 'Mocks & Rapid Revision',
        rangeLabel: 'Days 56–70',
        progressPct: p3Pct,
        status: activePhase === 3 ? 'active' : 'upcoming',
      },
    ],
  };
}
