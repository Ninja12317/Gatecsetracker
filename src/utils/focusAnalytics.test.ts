import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudyLogEntry } from '../types';
import {
  build70DayHeatmap,
  buildLast14DaysChartData,
  buildSubjectHoursVsWeightage,
  computeBestStudyStreak,
  computeBiologicalPeakSync,
  computeTimerClock,
  formatClock,
} from './focusAnalytics';

test('computeTimerClock uses exact Date.now() - startedAtMs timestamp math without drift', () => {
  const t0 = 1_700_000_000_000;
  // 50-minute block running for 12m 30s (750s)
  const snap = computeTimerClock(
    {
      isStopwatch: false,
      status: 'running',
      startedAtMs: t0,
      accumulatedSeconds: 0,
      targetSeconds: 3000,
    },
    t0 + 750_000
  );
  assert.equal(snap.elapsedSeconds, 750);
  assert.equal(snap.remainingSeconds, 2250);
  assert.equal(formatClock(snap.displaySeconds), '37:30');
  assert.equal(snap.progressRatio, 0.25);
  assert.equal(snap.isFinished, false);

  // Completed block past target duration clamps cleanly to 0 and flags finished
  const done = computeTimerClock(
    {
      isStopwatch: false,
      status: 'running',
      startedAtMs: t0,
      accumulatedSeconds: 600,
      targetSeconds: 1500,
    },
    t0 + 950_000
  );
  assert.equal(done.remainingSeconds, 0);
  assert.equal(done.isFinished, true);
  assert.equal(done.progressRatio, 1);

  // Stopwatch mode counts upward across hours
  const watch = computeTimerClock(
    {
      isStopwatch: true,
      status: 'running',
      startedAtMs: t0,
      accumulatedSeconds: 3661,
      targetSeconds: 0,
    },
    t0 + 5000
  );
  assert.equal(watch.displaySeconds, 3666);
  assert.equal(formatClock(watch.displaySeconds), '01:01:06');
  assert.equal(watch.isFinished, false);
});

test('computeBestStudyStreak finds longest consecutive study streak across gaps', () => {
  const logs: StudyLogEntry[] = [
    { id: '1', date: '2026-11-01', subjectId: 'os', minutes: 50, mode: 'pomodoro', completedAt: '2026-11-01T10:20:00' },
    { id: '2', date: '2026-11-02', subjectId: 'cn', minutes: 50, mode: 'pomodoro', completedAt: '2026-11-02T10:20:00' },
    { id: '3', date: '2026-11-03', subjectId: 'dbms', minutes: 90, mode: 'pomodoro', completedAt: '2026-11-03T11:30:00' },
    { id: '4', date: '2026-11-03', subjectId: 'algo', minutes: 50, mode: 'pomodoro', completedAt: '2026-11-03T15:30:00' },
    // gap on Nov 4
    { id: '5', date: '2026-11-05', subjectId: 'os', minutes: 50, mode: 'pomodoro', completedAt: '2026-11-05T10:20:00' },
    { id: '6', date: '2026-11-06', subjectId: 'os', minutes: 50, mode: 'pomodoro', completedAt: '2026-11-06T10:20:00' },
  ];
  assert.equal(computeBestStudyStreak(logs), 3);
  assert.equal(computeBestStudyStreak([]), 0);
});

test('computeBiologicalPeakSync calculates overlap with 9:30-12:30 and 14:30-17:30 GATE shift windows', () => {
  const logs: StudyLogEntry[] = [
    // Fully inside Forenoon shift (10:00 - 11:00 = 60m peak)
    {
      id: 'fn1',
      date: '2026-11-25',
      subjectId: 'os',
      minutes: 60,
      mode: 'pomodoro',
      startedAt: '2026-11-25T10:00:00',
      completedAt: '2026-11-25T11:00:00',
    },
    // Fully inside Afternoon shift (15:00 - 16:00 = 60m peak)
    {
      id: 'an1',
      date: '2026-11-25',
      subjectId: 'cn',
      minutes: 60,
      mode: 'pomodoro',
      startedAt: '2026-11-25T15:00:00',
      completedAt: '2026-11-25T16:00:00',
    },
    // Late night session (22:00 - 23:00 = 0m peak)
    {
      id: 'night1',
      date: '2026-11-25',
      subjectId: 'algo',
      minutes: 60,
      mode: 'pomodoro',
      startedAt: '2026-11-25T22:00:00',
      completedAt: '2026-11-25T23:00:00',
    },
  ];
  const stats = computeBiologicalPeakSync(logs);
  assert.equal(stats.totalMinutes, 180);
  assert.equal(stats.forenoonMinutes, 60);
  assert.equal(stats.afternoonMinutes, 60);
  assert.equal(stats.peakMinutes, 120);
  assert.equal(stats.peakPct, 67);
});

test('build70DayHeatmap aggregates session count and top subject accurately', () => {
  const today = new Date(2026, 10, 25); // Nov 25, 2026
  const logs: StudyLogEntry[] = [
    { id: 'a', date: '2026-11-25', subjectId: 'os', minutes: 90, mode: 'pomodoro', completedAt: '2026-11-25T11:00:00' },
    { id: 'b', date: '2026-11-25', subjectId: 'dbms', minutes: 50, mode: 'pomodoro', completedAt: '2026-11-25T15:00:00' },
    { id: 'c', date: '2026-11-25', subjectId: 'dbms', minutes: 60, mode: 'pomodoro', completedAt: '2026-11-25T17:00:00' },
  ];
  const cells = build70DayHeatmap(logs, today);
  assert.equal(cells.length, 70);
  const last = cells[69];
  assert.equal(last.date, '2026-11-25');
  assert.equal(last.isToday, true);
  assert.equal(last.minutes, 200);
  assert.equal(last.sessionCount, 3);
  assert.equal(last.topSubjectId, 'dbms');
  assert.equal(last.topSubjectMinutes, 110);
});

test('buildSubjectHoursVsWeightage and buildLast14DaysChartData compute ROI shares and goal hours', () => {
  const today = new Date(2026, 10, 25);
  const logs: StudyLogEntry[] = [
    { id: 'x1', date: '2026-11-25', subjectId: 'os', minutes: 120, mode: 'pomodoro', completedAt: '2026-11-25T11:30:00' },
    { id: 'x2', date: '2026-11-24', subjectId: 'em', minutes: 240, mode: 'pomodoro', completedAt: '2026-11-24T12:00:00' },
  ];
  const subjectRows = buildSubjectHoursVsWeightage(logs);
  assert.equal(subjectRows.length, 12);
  const osRow = subjectRows.find((r) => r.subjectId === 'os');
  assert.ok(osRow);
  assert.equal(osRow.loggedHours, 2);
  assert.equal(osRow.timeSharePct, 33.3);

  const dailyRows = buildLast14DaysChartData(logs, 240, today);
  assert.equal(dailyRows.length, 14);
  assert.equal(dailyRows[13].hours, 2);
  assert.equal(dailyRows[13].goalHours, 4);
  assert.equal(dailyRows[13].metTarget, false);
  assert.equal(dailyRows[12].hours, 4);
  assert.equal(dailyRows[12].metTarget, true);
});
