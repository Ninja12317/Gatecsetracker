import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGaQuestion,
  selectDailyGaSprintQuestions,
  computeGaStreakMetrics,
} from './gaStreak.ts';
import type { GaStreakEntry, Question, QuestionAttemptRecord } from '../types/index.ts';

function makeGaQ(id: string, subtopic: string, prompt: string, year = 2024): Question {
  return {
    id,
    subjectId: 'ga',
    subtopic,
    format: 'MCQ',
    marks: 1,
    difficulty: 'Medium',
    sourceTag: `GATE ${year}`,
    year,
    prompt,
    explanation: 'Proof',
    wrongOptionAnalysis: '',
  };
}

test('selectDailyGaSprintQuestions prioritizes unseen balanced GA questions', () => {
  const qs: Question[] = [
    makeGaQ('ga_v1', 'Verbal Aptitude', 'Choose the synonym for the verb in the sentence.', 2025),
    makeGaQ('ga_q1', 'Quantitative Aptitude', 'Find the probability and ratio of two numbers.', 2025),
    makeGaQ('ga_a1', 'Analytical Aptitude', 'In a seating puzzle with statements and syllogism...', 2024),
    makeGaQ('ga_s1', 'Spatial Aptitude', 'A cube is folded and mirrored along the triangle axis.', 2024),
    makeGaQ('ga_q2', 'Quantitative Aptitude', 'Find the compound interest percentage.', 2023),
    makeGaQ('ga_seen', 'Verbal Aptitude', 'Grammar blank fill question.', 2026),
  ];

  const attempts: Record<string, QuestionAttemptRecord> = {
    ga_seen: {
      questionId: 'ga_seen',
      isCorrect: true,
      marksAwarded: 1,
      maxMarks: 1,
      attemptedAt: '2026-01-01T10:00:00.000Z',
    },
  };

  assert.equal(classifyGaQuestion(qs[0]), 'Verbal');
  assert.equal(classifyGaQuestion(qs[3]), 'Spatial');

  const picked = selectDailyGaSprintQuestions(qs, attempts, 5);
  assert.equal(picked.length, 5);
  assert.ok(!picked.some((q) => q.id === 'ga_seen'), 'Should prioritize 5 unseen questions first');
  const buckets = new Set(picked.map(classifyGaQuestion));
  assert.equal(buckets.size, 4, 'Should cover all 4 GA categories');
});

test('computeGaStreakMetrics computes consecutive days, rolling accuracy, and /15 score', () => {
  const qs: Question[] = [
    makeGaQ('g1', 'Quant', 'Ratio'),
    makeGaQ('g2', 'Verbal', 'Synonym'),
    makeGaQ('g3', 'Spatial', 'Cube'),
    makeGaQ('g4', 'Analytical', 'Puzzle'),
  ];
  const logs: Record<string, GaStreakEntry> = {
    '2026-11-23': {
      date: '2026-11-23',
      completedAt: '2026-11-23T09:00:00Z',
      questionsCount: 5,
      correctCount: 4,
      marksAwarded: 6,
      maxMarks: 8,
      accuracyPct: 80,
      durationSeconds: 420,
    },
    '2026-11-24': {
      date: '2026-11-24',
      completedAt: '2026-11-24T09:00:00Z',
      questionsCount: 5,
      correctCount: 4,
      marksAwarded: 6,
      maxMarks: 8,
      accuracyPct: 80,
      durationSeconds: 410,
    },
    '2026-11-25': {
      date: '2026-11-25',
      completedAt: '2026-11-25T09:00:00Z',
      questionsCount: 5,
      correctCount: 5,
      marksAwarded: 8,
      maxMarks: 8,
      accuracyPct: 100,
      durationSeconds: 380,
    },
  };
  const attempts: Record<string, QuestionAttemptRecord> = {
    g1: { questionId: 'g1', isCorrect: true, marksAwarded: 1, maxMarks: 1, attemptedAt: '2026-11-25T09:00:00Z' },
    g2: { questionId: 'g2', isCorrect: true, marksAwarded: 1, maxMarks: 1, attemptedAt: '2026-11-25T09:01:00Z' },
    g3: { questionId: 'g3', isCorrect: true, marksAwarded: 2, maxMarks: 2, attemptedAt: '2026-11-25T09:02:00Z' },
    g4: { questionId: 'g4', isCorrect: false, marksAwarded: -0.33, maxMarks: 1, attemptedAt: '2026-11-25T09:03:00Z' },
  };

  const metrics = computeGaStreakMetrics(logs, attempts, qs, '2026-11-25');
  assert.equal(metrics.streakDays, 3);
  assert.equal(metrics.completedToday, true);
  assert.equal(metrics.rollingAccuracyPct, 75);
  assert.equal(metrics.projectedGaScore, 11.3);
  assert.equal(metrics.last7Days.length, 7);
});
