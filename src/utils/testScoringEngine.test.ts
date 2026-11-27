import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateQuestionStrict,
  formatGradedScoreSummary,
  gradeTestSessionStrict,
  hasVerifiedAnswerKey,
  recalculateTestHistoryEntry,
} from './testScoringEngine.ts';
import type { Question, TestHistoryEntry } from '../types/index.ts';

function makeQ(overrides: Partial<Question>): Question {
  return {
    id: 'q1',
    subjectId: 'os',
    subtopic: 'Paging',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GATE 2023',
    prompt: 'Sample question prompt',
    options: [
      { id: 'A', text: 'Opt A' },
      { id: 'B', text: 'Opt B' },
      { id: 'C', text: 'Opt C' },
      { id: 'D', text: 'Opt D' },
    ],
    explanation: 'Proof',
    wrongOptionAnalysis: 'Traps',
    ...overrides,
  };
}

test('No-Key No-Marks rule: unkeyed attempted MCQ gets pending_key with 0 marks and 0 penalty', () => {
  const unkeyed = makeQ({ id: 'q-nokey', hasAnswerKey: false, correctOption: undefined });
  assert.equal(hasVerifiedAnswerKey(unkeyed), false);

  const ev = evaluateQuestionStrict(unkeyed, { selectedOption: 'A' });
  assert.equal(ev.status, 'pending_key');
  assert.equal(ev.marksAwarded, 0);
  assert.equal(ev.penaltyMarks, 0);
  assert.equal(ev.hasKey, false);
});

test('gradeTestSessionStrict partitions graded vs pending key questions accurately', () => {
  const q1 = makeQ({ id: 'q1', marks: 2, correctOption: 'B', hasAnswerKey: true });
  const q2 = makeQ({ id: 'q2', marks: 1, correctOption: 'C', hasAnswerKey: true });
  const q3 = makeQ({ id: 'q3', marks: 2, hasAnswerKey: false, correctOption: undefined });
  const q4 = makeQ({ id: 'q4', format: 'NAT', marks: 2, hasAnswerKey: false });

  const summary = gradeTestSessionStrict([q1, q2, q3, q4], {
    q1: { selectedOption: 'B' }, // +2
    q2: { selectedOption: 'A' }, // -0.33
    q3: { selectedOption: 'D' }, // pending key -> excluded from score & accuracy
    q4: { natValue: '42' }, // pending key -> excluded from score & accuracy
  });

  assert.equal(summary.gradedMarks, 1.67);
  assert.equal(summary.gradedMaxMarks, 3);
  assert.equal(summary.totalMaxMarks, 7);
  assert.equal(summary.gradedCount, 2);
  assert.equal(summary.pendingKeyCount, 2);
  assert.equal(summary.correctCount, 1);
  assert.equal(summary.wrongCount, 1);
  assert.equal(summary.penaltyMarks, 0.33);
  assert.equal(summary.accuracyPct, 50);
  assert.equal(
    formatGradedScoreSummary(summary),
    '1.67 / 3 Graded · (2 Pending Key)'
  );
});

test('recalculateTestHistoryEntry immediately updates historical test when an answer key is added', () => {
  const entry: TestHistoryEntry = {
    id: 'test-1',
    title: 'Mixed Drill',
    mode: 'timed',
    date: '2026-11-26',
    completedAt: '2026-11-26T10:00:00.000Z',
    durationSeconds: 300,
    questionIds: ['q1', 'q2'],
    responses: { q1: 'B', q2: '42' },
    gradedMarks: 2,
    gradedMaxMarks: 2,
    totalMaxMarks: 4,
    gradedCount: 1,
    gradedAttemptedCount: 1,
    pendingKeyCount: 1,
    correctCount: 1,
    wrongCount: 0,
    unattemptedCount: 0,
    penaltyMarks: 0,
    accuracyPct: 100,
  };

  // Now q2 gets a verified NAT key = 42
  const liveMap = new Map<string, Question>([
    ['q1', makeQ({ id: 'q1', marks: 2, correctOption: 'B', hasAnswerKey: true })],
    ['q2', makeQ({ id: 'q2', format: 'NAT', marks: 2, natAnswer: 42, natTolerance: 0, hasAnswerKey: true })],
  ]);

  const updated = recalculateTestHistoryEntry(entry, liveMap);
  assert.equal(updated.gradedMarks, 4);
  assert.equal(updated.gradedMaxMarks, 4);
  assert.equal(updated.pendingKeyCount, 0);
  assert.equal(updated.correctCount, 2);
  assert.equal(updated.accuracyPct, 100);
});
