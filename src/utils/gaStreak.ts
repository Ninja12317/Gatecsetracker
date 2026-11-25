import type { GaStreakEntry, Question, QuestionAttemptRecord } from '../types';
import { toLocalIsoDate } from './gateMath';

export type GaCategoryBucket = 'Verbal' | 'Quantitative' | 'Analytical' | 'Spatial';

export function classifyGaQuestion(q: Question): GaCategoryBucket {
  const text = `${q.subtopic} ${(q.tags ?? []).join(' ')} ${q.prompt}`.toLowerCase();
  if (
    /\b(mirror|fold|cube|dice|rotate|rotation|paper|shadow|polygon|triangle|circle|area|perimeter|volume|geometry|spatial|figure|3d|2d|shape)\b/.test(
      text
    )
  ) {
    return 'Spatial';
  }
  if (
    /\b(grammar|synonym|antonym|sentence|verb|noun|idiom|passage|vocabulary|english|word|phrase|preposition|tense|comprehension|blank|verbal|analog)\b/.test(
      text
    )
  ) {
    return 'Verbal';
  }
  if (
    /\b(syllogism|blood relation|seating|direction|coding|decoding|deduction|inference|conclusion|statement|assumption|puzzle|truth|liar|analytical|logic|ranking)\b/.test(
      text
    )
  ) {
    return 'Analytical';
  }
  return 'Quantitative';
}

/**
 * Selects 5 unseen General Aptitude PYQs balanced across Verbal, Quantitative, Analytical & Spatial.
 * Falls back to remaining unseen GA PYQs, then oldest-attempted GA PYQs if all GA PYQs are solved.
 */
export function selectDailyGaSprintQuestions(
  allQuestions: Question[],
  attempts: Record<string, QuestionAttemptRecord>,
  count = 5
): Question[] {
  const gaPool = allQuestions.filter(
    (q) => q.subjectId === 'ga' && !q.isOutOf2027Syllabus
  );
  if (gaPool.length === 0) return [];

  const unseen = gaPool
    .filter((q) => !attempts[q.id])
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  const seenOldest = gaPool
    .filter((q) => Boolean(attempts[q.id]))
    .sort((a, b) =>
      (attempts[a.id]?.attemptedAt ?? '').localeCompare(attempts[b.id]?.attemptedAt ?? '')
    );

  const buckets: Record<GaCategoryBucket, Question[]> = {
    Quantitative: [],
    Verbal: [],
    Analytical: [],
    Spatial: [],
  };

  for (const q of unseen) {
    buckets[classifyGaQuestion(q)].push(q);
  }

  const picked: Question[] = [];
  const pickedIds = new Set<string>();
  const bucketOrder: GaCategoryBucket[] = ['Quantitative', 'Verbal', 'Analytical', 'Spatial'];

  // Round-robin pick from balanced unseen buckets first
  let progressed = true;
  while (picked.length < count && progressed) {
    progressed = false;
    for (const bucketName of bucketOrder) {
      if (picked.length >= count) break;
      const nextQ = buckets[bucketName].shift();
      if (nextQ && !pickedIds.has(nextQ.id)) {
        picked.push(nextQ);
        pickedIds.add(nextQ.id);
        progressed = true;
      }
    }
  }

  // Fallback to oldest-attempted GA questions if unseen pool had fewer than `count`
  for (const q of seenOldest) {
    if (picked.length >= count) break;
    if (!pickedIds.has(q.id)) {
      picked.push(q);
      pickedIds.add(q.id);
    }
  }

  return picked;
}

function addDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + deltaDays);
  return toLocalIsoDate(dt);
}

export interface GaStreakMetrics {
  streakDays: number;
  completedToday: boolean;
  todayEntry: GaStreakEntry | null;
  totalSprintsCompleted: number;
  rollingAccuracyPct: number;
  projectedGaScore: number; // Out of 15.0
  totalGaAttempted: number;
  last7Days: Array<{ date: string; label: string; completed: boolean }>;
}

export function computeGaStreakMetrics(
  gaStreakLogs: Record<string, GaStreakEntry>,
  attempts: Record<string, QuestionAttemptRecord>,
  allQuestions: Question[],
  todayIso: string = toLocalIsoDate()
): GaStreakMetrics {
  const todayEntry = gaStreakLogs[todayIso] ?? null;
  const completedToday = Boolean(todayEntry);

  // Consecutive GA streak ending today (or yesterday if today is still pending)
  let streakDays = 0;
  let cursor = completedToday ? todayIso : addDaysIso(todayIso, -1);
  while (gaStreakLogs[cursor]) {
    streakDays += 1;
    cursor = addDaysIso(cursor, -1);
  }

  // Last 7 days calendar dots
  const last7Days: Array<{ date: string; label: string; completed: boolean }> = [];
  for (let offset = -6; offset <= 0; offset++) {
    const dtIso = addDaysIso(todayIso, offset);
    const [y, m, d] = dtIso.split('-').map(Number);
    const dayName = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
      weekday: 'short',
    });
    last7Days.push({
      date: dtIso,
      label: dayName.slice(0, 2),
      completed: Boolean(gaStreakLogs[dtIso]),
    });
  }

  // Compute rolling GA accuracy from individual GA attempts & completed GA sprints
  const gaQuestionIds = new Set(
    allQuestions.filter((q) => q.subjectId === 'ga').map((q) => q.id)
  );
  const gaAttempts = Object.values(attempts)
    .filter((a) => gaQuestionIds.has(a.questionId))
    .sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt));

  const recentGaAttempts = gaAttempts.slice(0, 30);
  const sprintList = Object.values(gaStreakLogs).sort((a, b) => b.date.localeCompare(a.date));

  let rollingAccuracyPct = 0;
  if (recentGaAttempts.length > 0) {
    const correct = recentGaAttempts.filter((a) => a.isCorrect).length;
    rollingAccuracyPct = Math.round((correct / recentGaAttempts.length) * 100);
  } else if (sprintList.length > 0) {
    const recentSprints = sprintList.slice(0, 10);
    const sumAcc = recentSprints.reduce((acc, s) => acc + s.accuracyPct, 0);
    rollingAccuracyPct = Math.round(sumAcc / recentSprints.length);
  }

  // Projected GA Score out of 15 marks (GATE CSE has 10 GA Qs = 15 marks)
  const projectedGaScore =
    recentGaAttempts.length === 0 && sprintList.length === 0
      ? 0
      : Math.round(((rollingAccuracyPct / 100) * 15) * 10) / 10;

  return {
    streakDays,
    completedToday,
    todayEntry,
    totalSprintsCompleted: sprintList.length,
    rollingAccuracyPct,
    projectedGaScore,
    totalGaAttempted: gaAttempts.length,
    last7Days,
  };
}
