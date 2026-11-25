import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToIsoDate,
  computeNextSrsSchedule,
  isSrsCardDueToday,
  computeSprintPaceAnalytics,
  isSlowPaceQuestion,
  buildLocalTagTrapsFallback,
  formatPaceDuration,
} from './examPolish.ts';
import type { Question } from '../types/index.ts';

test('SRS scheduler implements 1d / 3d / 7d / 14d spaced-repetition ladder accurately', () => {
  const today = '2026-11-25';

  // First review rated Good -> 3d
  const r1 = computeNextSrsSchedule(undefined, 'mistake', 'q-101', 'good', today);
  assert.equal(r1.intervalDays, 3);
  assert.equal(r1.nextReviewDate, '2026-11-28');
  assert.equal(r1.reviewCount, 1);

  // Second review rated Good -> 7d
  const r2 = computeNextSrsSchedule(r1, 'mistake', 'q-101', 'good', '2026-11-28');
  assert.equal(r2.intervalDays, 7);
  assert.equal(r2.nextReviewDate, '2026-12-05');
  assert.equal(r2.reviewCount, 2);

  // Third review rated Good -> 14d cap
  const r3 = computeNextSrsSchedule(r2, 'mistake', 'q-101', 'good', '2026-12-05');
  assert.equal(r3.intervalDays, 14);
  assert.equal(r3.nextReviewDate, '2026-12-19');

  // Rated Hard -> resets back to 1d
  const rHard = computeNextSrsSchedule(r3, 'mistake', 'q-101', 'hard', '2026-12-19');
  assert.equal(rHard.intervalDays, 1);
  assert.equal(rHard.nextReviewDate, '2026-12-20');

  // Rated Mastered from scratch -> jumps to 14d
  const rMastered = computeNextSrsSchedule(undefined, 'trap', 't-42', 'mastered', today);
  assert.equal(rMastered.intervalDays, 14);
  assert.equal(rMastered.nextReviewDate, addDaysToIsoDate(today, 14));
});

test('isSrsCardDueToday marks unreviewed and due/overdue cards as due', () => {
  assert.equal(isSrsCardDueToday(undefined, '2026-11-25'), true);
  const due = computeNextSrsSchedule(undefined, 'trap', 't-1', 'hard', '2026-11-24');
  assert.equal(isSrsCardDueToday(due, '2026-11-25'), true);
  const future = computeNextSrsSchedule(undefined, 'trap', 't-2', 'good', '2026-11-25');
  assert.equal(isSrsCardDueToday(future, '2026-11-25'), false);
});

test('Per-question pace analytics computes 1M/2M averages and detects slow-pace thresholds (>150s 1M, >270s 2M)', () => {
  assert.equal(isSlowPaceQuestion(1, 150), false);
  assert.equal(isSlowPaceQuestion(1, 151), true);
  assert.equal(isSlowPaceQuestion(2, 270), false);
  assert.equal(isSlowPaceQuestion(2, 271), true);

  const questions = [
    { id: 'q1', marks: 1 as const },
    { id: 'q2', marks: 1 as const },
    { id: 'q3', marks: 2 as const },
    { id: 'q4', marks: 2 as const },
  ];
  const pace = computeSprintPaceAnalytics(questions, {
    q1: 90,
    q2: 170, // slow 1M
    q3: 200,
    q4: 300, // slow 2M
  });

  assert.equal(pace.totalSeconds, 760);
  assert.equal(pace.avg1MSeconds, 130);
  assert.equal(pace.avg2MSeconds, 250);
  assert.deepEqual(pace.slowQuestionIds, ['q2', 'q4']);
  assert.equal(formatPaceDuration(151), '2m 31s');
  assert.equal(formatPaceDuration(45), '45s');
});

test('buildLocalTagTrapsFallback extracts deduplicated high-frequency subject insights', () => {
  const sampleQs: Question[] = [
    {
      id: 'g1',
      subjectId: 'os',
      subtopic: 'Page Replacement',
      format: 'NAT',
      marks: 2,
      difficulty: 'Medium',
      sourceTag: 'GATE 2023',
      year: 2023,
      prompt: 'LRU page faults',
      explanation: 'exp',
      wrongOptionAnalysis: '',
    },
    {
      id: 'g2',
      subjectId: 'os',
      subtopic: 'Page Replacement',
      format: 'MSQ',
      marks: 2,
      difficulty: 'Hard',
      sourceTag: 'GATE 2024',
      year: 2024,
      prompt: 'Belady anomaly',
      explanation: 'exp',
      wrongOptionAnalysis: '',
    },
    {
      id: 'g3',
      subjectId: 'dbms',
      subtopic: 'B+ Trees',
      format: 'NAT',
      marks: 2,
      difficulty: 'Medium',
      sourceTag: 'GATE 2022',
      year: 2022,
      prompt: 'B+ tree order',
      explanation: 'exp',
      wrongOptionAnalysis: '',
    },
  ];

  const traps = buildLocalTagTrapsFallback(sampleQs, ['OS High-Yield Focus: Page Replacement'], 'all', '2026-11-25');
  assert.equal(traps.length, 1);
  assert.equal(traps[0].subjectId, 'dbms');
  assert.equal(traps[0].trapSource, 'local_mined');
});
