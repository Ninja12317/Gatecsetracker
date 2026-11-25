import type {
  FocusPresetId,
  FocusSessionType,
  StudyLogEntry,
  SubjectId,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import { toLocalIsoDate } from './gateMath';

export interface FocusPresetOption {
  id: FocusPresetId;
  shortLabel: string;
  title: string;
  description: string;
  defaultMinutes: number;
  kind: 'work' | 'break' | 'stopwatch';
}

export const FOCUS_SESSION_TYPES: FocusSessionType[] = [
  'Concept',
  'PYQs',
  'Mock Analysis',
  'Revision',
];

export function buildFocusPresets(settings?: {
  pomodoroWorkMinutes?: number;
  pomodoroShortBreakMinutes?: number;
  pomodoroLongBreakMinutes?: number;
}): FocusPresetOption[] {
  const shortBreak = Math.max(1, Math.min(60, Math.round(settings?.pomodoroShortBreakMinutes ?? 10)));
  const longBreak = Math.max(5, Math.min(90, Math.round(settings?.pomodoroLongBreakMinutes ?? 25)));

  return [
    {
      id: 'sprint_25',
      shortLabel: '25m',
      title: '25-min Sprint Block',
      description: 'Quick conceptual drill or timed 5-PYQ warm-up',
      defaultMinutes: 25,
      kind: 'work',
    },
    {
      id: 'deep_50',
      shortLabel: '50m',
      title: '50-min Deep Focus Block',
      description: 'Standard deep-work proof & derivation block',
      defaultMinutes: 50,
      kind: 'work',
    },
    {
      id: 'ultradian_90',
      shortLabel: '90m',
      title: '90-min Ultradian Cycle',
      description: 'Peak cognitive stretch for heavy derivations',
      defaultMinutes: 90,
      kind: 'work',
    },
    {
      id: 'stamina_180',
      shortLabel: '180m',
      title: '180-min GATE 3-Hr Stamina',
      description: 'Full GATE CSE exam endurance simulation',
      defaultMinutes: 180,
      kind: 'work',
    },
    {
      id: 'short_break',
      shortLabel: `S: ${shortBreak}m`,
      title: `${shortBreak}-min Short Break`,
      description: 'Step away from screen & reset working memory',
      defaultMinutes: shortBreak,
      kind: 'break',
    },
    {
      id: 'long_break',
      shortLabel: `L: ${longBreak}m`,
      title: `${longBreak}-min Long Break`,
      description: 'Post-cycle neural consolidation break',
      defaultMinutes: longBreak,
      kind: 'break',
    },
    {
      id: 'stopwatch',
      shortLabel: 'Watch',
      title: 'Open Stopwatch Session',
      description: 'Unbounded study block with live elapsed tally',
      defaultMinutes: 0,
      kind: 'stopwatch',
    },
  ];
}

export interface TimerClockSnapshot {
  isStopwatch: boolean;
  status: 'idle' | 'running' | 'paused';
  startedAtMs: number | null;
  accumulatedSeconds: number;
  targetSeconds: number;
}

export interface ComputedTimerDisplay {
  elapsedSeconds: number;
  remainingSeconds: number;
  displaySeconds: number;
  progressRatio: number; // 0..1
  isFinished: boolean;
}

/**
 * Pure timestamp-derived timer math.
 * Immune to background-tab throttling or locked mobile screens because elapsed time
 * is computed directly from (nowMs - startedAtMs) + accumulatedSeconds.
 */
export function computeTimerClock(
  snapshot: TimerClockSnapshot,
  nowMs: number
): ComputedTimerDisplay {
  const liveDeltaSeconds =
    snapshot.status === 'running' && snapshot.startedAtMs !== null
      ? Math.max(0, (nowMs - snapshot.startedAtMs) / 1000)
      : 0;
  const elapsedExact = Math.max(0, snapshot.accumulatedSeconds + liveDeltaSeconds);

  if (snapshot.isStopwatch) {
    const elapsedFloored = Math.floor(elapsedExact);
    // Stopwatch ring completes a smooth visual lap every 60 minutes (3600s)
    const lapProgress = (elapsedExact % 3600) / 3600;
    return {
      elapsedSeconds: elapsedFloored,
      remainingSeconds: 0,
      displaySeconds: elapsedFloored,
      progressRatio: elapsedExact === 0 ? 0 : lapProgress,
      isFinished: false,
    };
  }

  const safeTarget = Math.max(1, snapshot.targetSeconds);
  const remainingExact = Math.max(0, safeTarget - elapsedExact);
  const remainingCeil = remainingExact <= 0.05 ? 0 : Math.ceil(remainingExact);
  const progressRatio = Math.min(1, Math.max(0, elapsedExact / safeTarget));

  return {
    elapsedSeconds: Math.min(safeTarget, Math.floor(elapsedExact)),
    remainingSeconds: remainingCeil,
    displaySeconds: remainingCeil,
    progressRatio,
    isFinished: snapshot.status === 'running' && remainingExact <= 0.05,
  };
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  return `${pad2(m)}:${pad2(s)}`;
}

export function formatMinutesCompact(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  if (safe < 60) return `${safe}m`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatTimeWindow(
  startedAtIso: string | undefined,
  completedAtIso: string,
  durationMinutes: number
): string {
  const endDate = new Date(completedAtIso);
  if (Number.isNaN(endDate.getTime())) {
    return `${durationMinutes}m`;
  }
  const startDate =
    startedAtIso && !Number.isNaN(new Date(startedAtIso).getTime())
      ? new Date(startedAtIso)
      : new Date(endDate.getTime() - Math.max(1, durationMinutes) * 60_000);

  const fmt = (d: Date) =>
    d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

/**
 * Longest consecutive-day study streak across all logged sessions.
 */
export function computeBestStudyStreak(studyLogs: StudyLogEntry[]): number {
  const uniqueDates = Array.from(
    new Set(studyLogs.filter((l) => l.minutes > 0 && /^\d{4}-\d{2}-\d{2}$/.test(l.date)).map((l) => l.date))
  ).sort();

  if (uniqueDates.length === 0) return 0;

  let best = 1;
  let current = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(`${uniqueDates[i - 1]}T00:00:00Z`).getTime();
    const curr = new Date(`${uniqueDates[i]}T00:00:00Z`).getTime();
    const diffDays = Math.round((curr - prev) / 86_400_000);
    if (diffDays === 1) {
      current += 1;
      if (current > best) best = current;
    } else if (diffDays > 1) {
      current = 1;
    }
  }

  return best;
}

export interface BiologicalPeakSyncStats {
  peakPct: number;
  peakMinutes: number;
  forenoonMinutes: number;
  afternoonMinutes: number;
  totalMinutes: number;
}

/**
 * Measures what percentage of focus hours overlap official GATE CSE exam shift windows:
 * - Forenoon Shift: 09:30 – 12:30 local time (570 – 750 min of day)
 * - Afternoon Shift: 14:30 – 17:30 local time (870 – 1050 min of day)
 * Uses exact midpoint/overlap calculation over [start, end] of each logged session.
 */
export function computeBiologicalPeakSync(studyLogs: StudyLogEntry[]): BiologicalPeakSyncStats {
  const FORENOON_START = 9 * 60 + 30; // 570
  const FORENOON_END = 12 * 60 + 30; // 750
  const AFTERNOON_START = 14 * 60 + 30; // 870
  const AFTERNOON_END = 17 * 60 + 30; // 1050

  let totalMinutes = 0;
  let forenoonMinutes = 0;
  let afternoonMinutes = 0;

  for (const log of studyLogs) {
    if (!log.minutes || log.minutes <= 0) continue;
    totalMinutes += log.minutes;

    const endDt = new Date(log.completedAt);
    if (Number.isNaN(endDt.getTime())) continue;

    const startDt =
      log.startedAt && !Number.isNaN(new Date(log.startedAt).getTime())
        ? new Date(log.startedAt)
        : new Date(endDt.getTime() - log.minutes * 60_000);

    const endMinOfDay = endDt.getHours() * 60 + endDt.getMinutes();
    const startMinOfDay = Math.max(0, endMinOfDay - log.minutes);
    const actualStart =
      startDt.getDate() === endDt.getDate()
        ? startDt.getHours() * 60 + startDt.getMinutes()
        : startMinOfDay;

    const rangeStart = Math.min(actualStart, endMinOfDay);
    const rangeEnd = Math.max(actualStart, endMinOfDay);

    if (rangeEnd === rangeStart) {
      // Single-point fallback
      if (rangeStart >= FORENOON_START && rangeStart <= FORENOON_END) {
        forenoonMinutes += log.minutes;
      } else if (rangeStart >= AFTERNOON_START && rangeStart <= AFTERNOON_END) {
        afternoonMinutes += log.minutes;
      }
      continue;
    }

    const fnOverlap = Math.max(0, Math.min(rangeEnd, FORENOON_END) - Math.max(rangeStart, FORENOON_START));
    const anOverlap = Math.max(0, Math.min(rangeEnd, AFTERNOON_END) - Math.max(rangeStart, AFTERNOON_START));

    // Scale overlap proportionally if logged minutes differ slightly from clock span
    const span = Math.max(1, rangeEnd - rangeStart);
    const ratio = log.minutes / span;
    forenoonMinutes += Math.min(log.minutes, fnOverlap * ratio);
    afternoonMinutes += Math.min(log.minutes, anOverlap * ratio);
  }

  const peakMinutes = Math.round(forenoonMinutes + afternoonMinutes);
  const peakPct = totalMinutes > 0 ? Math.min(100, Math.round((peakMinutes / totalMinutes) * 100)) : 0;

  return {
    peakPct,
    peakMinutes,
    forenoonMinutes: Math.round(forenoonMinutes),
    afternoonMinutes: Math.round(afternoonMinutes),
    totalMinutes: Math.round(totalMinutes),
  };
}

export interface HeatmapDayCell {
  date: string;
  minutes: number;
  sessionCount: number;
  topSubjectId: SubjectId | null;
  topSubjectMinutes: number;
  isToday: boolean;
}

export function build70DayHeatmap(
  studyLogs: StudyLogEntry[],
  todayDate: Date = new Date()
): HeatmapDayCell[] {
  const byDate = new Map<
    string,
    { minutes: number; sessionCount: number; subjectTotals: Partial<Record<SubjectId, number>> }
  >();

  for (const log of studyLogs) {
    if (!log.date || log.minutes <= 0) continue;
    const bucket = byDate.get(log.date) ?? {
      minutes: 0,
      sessionCount: 0,
      subjectTotals: {},
    };
    bucket.minutes += log.minutes;
    bucket.sessionCount += 1;
    bucket.subjectTotals[log.subjectId] = (bucket.subjectTotals[log.subjectId] ?? 0) + log.minutes;
    byDate.set(log.date, bucket);
  }

  const cells: HeatmapDayCell[] = [];
  for (let offset = 69; offset >= 0; offset--) {
    const dt = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - offset);
    const iso = toLocalIsoDate(dt);
    const bucket = byDate.get(iso);

    let topSubjectId: SubjectId | null = null;
    let topSubjectMinutes = 0;
    if (bucket) {
      for (const [subj, mins] of Object.entries(bucket.subjectTotals)) {
        if ((mins ?? 0) > topSubjectMinutes) {
          topSubjectMinutes = mins ?? 0;
          topSubjectId = subj as SubjectId;
        }
      }
    }

    cells.push({
      date: iso,
      minutes: bucket?.minutes ?? 0,
      sessionCount: bucket?.sessionCount ?? 0,
      topSubjectId,
      topSubjectMinutes,
      isToday: offset === 0,
    });
  }

  return cells;
}

export interface SubjectRoiTimeRow {
  subjectId: SubjectId;
  code: string;
  shortName: string;
  weightage: number;
  loggedMinutes: number;
  loggedHours: number;
  timeSharePct: number;
  roiDelta: number; // timeSharePct - weightage (negative means under-invested vs GATE marks)
}

export function buildSubjectHoursVsWeightage(studyLogs: StudyLogEntry[]): SubjectRoiTimeRow[] {
  const minsBySubject: Partial<Record<SubjectId, number>> = {};
  let totalMinutes = 0;

  for (const log of studyLogs) {
    if (log.minutes <= 0) continue;
    minsBySubject[log.subjectId] = (minsBySubject[log.subjectId] ?? 0) + log.minutes;
    totalMinutes += log.minutes;
  }

  return GATE_2027_SYLLABUS.map((subj) => {
    const loggedMinutes = minsBySubject[subj.id] ?? 0;
    const loggedHours = Number((loggedMinutes / 60).toFixed(2));
    const timeSharePct = totalMinutes > 0 ? Number(((loggedMinutes / totalMinutes) * 100).toFixed(1)) : 0;
    return {
      subjectId: subj.id,
      code: subj.code,
      shortName: subj.shortName,
      weightage: subj.weightage,
      loggedMinutes,
      loggedHours,
      timeSharePct,
      roiDelta: Number((timeSharePct - subj.weightage).toFixed(1)),
    };
  }).sort((a, b) => b.weightage - a.weightage);
}

export interface Daily14DayRow {
  date: string;
  shortLabel: string;
  minutes: number;
  hours: number;
  goalHours: number;
  metTarget: boolean;
}

export function buildLast14DaysChartData(
  studyLogs: StudyLogEntry[],
  dailyGoalMinutes: number,
  todayDate: Date = new Date()
): Daily14DayRow[] {
  const byDate = new Map<string, number>();
  for (const log of studyLogs) {
    if (!log.date || log.minutes <= 0) continue;
    byDate.set(log.date, (byDate.get(log.date) ?? 0) + log.minutes);
  }

  const goalHours = Number((Math.max(30, dailyGoalMinutes) / 60).toFixed(2));
  const rows: Daily14DayRow[] = [];

  for (let offset = 13; offset >= 0; offset--) {
    const dt = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - offset);
    const iso = toLocalIsoDate(dt);
    const minutes = byDate.get(iso) ?? 0;
    const hours = Number((minutes / 60).toFixed(2));
    const shortLabel = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    rows.push({
      date: iso,
      shortLabel,
      minutes,
      hours,
      goalHours,
      metTarget: minutes >= dailyGoalMinutes,
    });
  }

  return rows;
}

export function getTodayStudyLogs(
  studyLogs: StudyLogEntry[],
  todayIso: string = toLocalIsoDate()
): StudyLogEntry[] {
  return studyLogs
    .filter((l) => l.date === todayIso)
    .slice()
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export function getSubjectDisplayCode(subjectId: SubjectId | null): string {
  if (!subjectId) return '—';
  return SUBJECT_MAP[subjectId]?.code ?? subjectId.toUpperCase();
}
