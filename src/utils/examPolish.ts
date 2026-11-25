import type {
  Question,
  SrsCardRecord,
  SrsItemType,
  SrsRating,
  SubjectId,
  TipItem,
} from '../types';
import { SUBJECT_MAP } from '../data/syllabus';

export const GATE_2027_EXAM_DATES = [
  { date: '2027-02-06', label: 'Feb 6 (Sat)' },
  { date: '2027-02-07', label: 'Feb 7 (Sun)' },
  { date: '2027-02-13', label: 'Feb 13 (Sat)' },
  { date: '2027-02-14', label: 'Feb 14 (Sun)' },
  { date: '2027-02-20', label: 'Feb 20 (Sat)' },
  { date: '2027-02-21', label: 'Feb 21 (Sun)' },
] as const;

export const GATE_2027_MILESTONES = [
  { label: 'City Allotment', date: 'Jan 4, 2027' },
  { label: 'Exam Window', date: 'Feb 6–21, 2027' },
  { label: 'Results', date: 'Mar 19, 2027' },
] as const;

export function makeSrsCardId(itemType: SrsItemType, itemId: string): string {
  const clean = itemId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return `${itemType}_${clean}`;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((n) => Number(n));
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Pure Spaced-Repetition Scheduler (1d / 3d / 7d / 14d ladder).
 * - Hard: resets to 1d
 * - Good: advances 1d -> 3d -> 7d -> 14d (new card starts at 3d)
 * - Mastered: jumps straight to 14d
 */
export function computeNextSrsSchedule(
  prev: SrsCardRecord | undefined,
  itemType: SrsItemType,
  itemId: string,
  rating: SrsRating,
  todayIso: string
): SrsCardRecord {
  let nextInterval: 1 | 3 | 7 | 14;
  if (rating === 'hard') {
    nextInterval = 1;
  } else if (rating === 'mastered') {
    nextInterval = 14;
  } else {
    // 'good'
    if (!prev) {
      nextInterval = 3;
    } else if (prev.intervalDays <= 1) {
      nextInterval = 3;
    } else if (prev.intervalDays <= 3) {
      nextInterval = 7;
    } else {
      nextInterval = 14;
    }
  }

  return {
    cardId: makeSrsCardId(itemType, itemId),
    itemType,
    itemId,
    intervalDays: nextInterval,
    nextReviewDate: addDaysToIsoDate(todayIso, nextInterval),
    lastRating: rating,
    reviewCount: (prev?.reviewCount ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function isSrsCardDueToday(record: SrsCardRecord | undefined, todayIso: string): boolean {
  if (!record) return true;
  return record.nextReviewDate <= todayIso;
}

export const SLOW_PACE_THRESHOLD_1M = 150; // >150s for 1-Mark question
export const SLOW_PACE_THRESHOLD_2M = 270; // >270s for 2-Mark question

export function isSlowPaceQuestion(marks: 1 | 2, seconds: number): boolean {
  return marks === 1 ? seconds > SLOW_PACE_THRESHOLD_1M : seconds > SLOW_PACE_THRESHOLD_2M;
}

export interface SprintPaceAnalytics {
  totalSeconds: number;
  avg1MSeconds: number | null;
  avg2MSeconds: number | null;
  count1M: number;
  count2M: number;
  slowQuestionIds: string[];
}

export function computeSprintPaceAnalytics(
  questions: Pick<Question, 'id' | 'marks'>[],
  questionSeconds: Record<string, number>
): SprintPaceAnalytics {
  let totalSeconds = 0;
  let sum1M = 0;
  let count1M = 0;
  let sum2M = 0;
  let count2M = 0;
  const slowQuestionIds: string[] = [];

  for (const q of questions) {
    const secs = Math.max(0, Math.round(questionSeconds[q.id] ?? 0));
    totalSeconds += secs;
    if (secs > 0) {
      if (q.marks === 1) {
        sum1M += secs;
        count1M += 1;
      } else {
        sum2M += secs;
        count2M += 1;
      }
      if (isSlowPaceQuestion(q.marks, secs)) {
        slowQuestionIds.push(q.id);
      }
    }
  }

  return {
    totalSeconds,
    avg1MSeconds: count1M > 0 ? Math.round(sum1M / count1M) : null,
    avg2MSeconds: count2M > 0 ? Math.round(sum2M / count2M) : null,
    count1M,
    count2M,
    slowQuestionIds,
  };
}

export function formatPaceDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Pure local fallback that extracts high-frequency GATE CSE exam traps from
 * synced GateR PYQ tags whenever Free-Tier AI quota is exhausted (429).
 */
export function buildLocalTagTrapsFallback(
  questions: Question[],
  existingTitles: string[],
  subjectFilter?: SubjectId | 'all',
  todayIst = new Date().toISOString().slice(0, 10)
): TipItem[] {
  const seenTitles = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  const filtered =
    subjectFilter && subjectFilter !== 'all'
      ? questions.filter((q) => q.subjectId === subjectFilter)
      : questions;

  // Group by (subjectId, subtopic) and count frequency + MSQ/NAT density
  const buckets = new Map<
    string,
    { subjectId: SubjectId; subtopic: string; total: number; msqCount: number; natCount: number; twoMarkCount: number; years: number[] }
  >();

  for (const q of filtered) {
    const subtopic = (q.subtopic || 'Core Concept').trim();
    if (!subtopic || subtopic.toLowerCase() === 'general') continue;
    const key = `${q.subjectId}::${subtopic.toLowerCase()}`;
    const cur = buckets.get(key) ?? {
      subjectId: q.subjectId,
      subtopic,
      total: 0,
      msqCount: 0,
      natCount: 0,
      twoMarkCount: 0,
      years: [],
    };
    cur.total += 1;
    if (q.format === 'MSQ') cur.msqCount += 1;
    if (q.format === 'NAT') cur.natCount += 1;
    if (q.marks === 2) cur.twoMarkCount += 1;
    if (q.year) cur.years.push(q.year);
    buckets.set(key, cur);
  }

  const ranked = Array.from(buckets.values()).sort((a, b) => b.total - a.total);
  const results: TipItem[] = [];

  for (const item of ranked) {
    if (results.length >= 5) break;
    const subjName = SUBJECT_MAP[item.subjectId]?.shortName ?? item.subjectId.toUpperCase();
    const title = `${subjName} High-Yield Focus: ${item.subtopic}`;
    if (seenTitles.has(title.toLowerCase())) continue;
    seenTitles.add(title.toLowerCase());

    const recentYears = Array.from(new Set(item.years))
      .sort((a, b) => b - a)
      .slice(0, 4)
      .join(', ');
    const twoMarkShare = item.total > 0 ? Math.round((item.twoMarkCount / item.total) * 100) : 0;

    results.push({
      id: `local-trap-${item.subjectId}-${Date.now()}-${results.length}`,
      subjectId: item.subjectId,
      title,
      category: item.msqCount > 0 ? 'Edge Case' : 'Exam Trap',
      summary: `Appeared ${item.total} times in the synced GateR bank (${twoMarkShare}% are 2-Mark questions${recentYears ? `; recent years: ${recentYears}` : ''}).`,
      detail: `GateR Bank Pattern Analysis for ${item.subtopic} (${subjName}): ${item.total} official PYQs tracked — including ${item.twoMarkCount} two-mark questions, ${item.natCount} NATs, and ${item.msqCount} MSQs. Double-check boundary conditions, units, and partial-credit pitfalls before locking your final answer.`,
      formula: `${item.total} PYQs · ${item.twoMarkCount}×2M · ${item.natCount} NAT · ${item.msqCount} MSQ`,
      trapSource: 'local_mined',
      generatedDateIst: todayIst,
      isCustom: true,
    });
  }

  return results;
}

/**
 * Pure Web Audio API two-tone harmonic completion chime (zero external MP3 assets).
 */
export function playTimerCompletionChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [
      { freq: 523.25, start: 0, dur: 0.28 }, // C5
      { freq: 659.25, start: 0.16, dur: 0.34 }, // E5
      { freq: 783.99, start: 0.34, dur: 0.48 }, // G5
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.start);
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.14, now + n.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.04);
    }

    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1200);
  } catch {
    // Ignore autoplay / audio context restrictions gracefully
  }
}
