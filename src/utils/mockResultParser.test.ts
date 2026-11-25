import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMockResultLocally,
  computeMockDiagnostics,
  SAMPLE_GO_CLASSES_PASTE,
} from './mockResultParser';
import type { MockTestEntry } from '../types';

test('Layer 1 parser parses exact GO Classes Exam Summary with 1M/2M splits at 0ms', () => {
  const res = parseMockResultLocally(SAMPLE_GO_CLASSES_PASTE);

  assert.equal(res.confidence, 'high');
  assert.equal(res.matchedFormat, 'GO Classes Exam Summary');
  assert.equal(res.draft.source, 'GO Classes');
  assert.equal(res.draft.subjectId, 'em');
  assert.equal(res.draft.type, 'Topic-Wise Test');
  assert.equal(res.draft.name, 'Discrete Mathematics · Topic Wise Test 2');
  assert.equal(res.draft.score, 0.67);
  assert.equal(res.draft.maxScore, 25);
  assert.equal(res.draft.percentage, 2.7);
  assert.equal(res.draft.normalizedScore, 2.68);
  assert.equal(res.draft.accuracy, 25);
  assert.equal(res.draft.totalQuestions, 15);
  assert.equal(res.draft.q1Total, 5);
  assert.equal(res.draft.q2Total, 10);
  assert.equal(res.draft.attempted, 4);
  assert.equal(res.draft.q1Attempted, 1);
  assert.equal(res.draft.q2Attempted, 3);
  assert.equal(res.draft.correct, 1);
  assert.equal(res.draft.q1Correct, 0);
  assert.equal(res.draft.q2Correct, 1);
  assert.equal(res.draft.wrong, 3);
  assert.equal(res.draft.q1Wrong, 1);
  assert.equal(res.draft.q2Wrong, 2);
  assert.equal(res.draft.unattempted, 11);
  assert.equal(res.draft.positiveMarks, 2);
  assert.equal(res.draft.q1PositiveMarks, 0);
  assert.equal(res.draft.q2PositiveMarks, 2);
  assert.equal(res.draft.penaltyMarks, 1.33);
  assert.equal(res.draft.q1PenaltyMarks, 0);
  assert.equal(res.draft.q2PenaltyMarks, 1.33);
  assert.equal(res.draft.durationMinutes, 45);
  assert.equal(res.draft.timeTakenMinutes, 0);
  assert.equal(res.draft.parseSource, 'local_deterministic');
});

test('Layer 1 parser handles tab-separated GO Classes Full-Length AIMT summary', () => {
  const raw = `Exam Summary (GO Classes CS Test Series | All India Mock Test 3)
64.67%
64.67/100
42 Correct\t8 Wrong\t15 Skipped\t162m of 180m
Qs. Attempted\t50 (22 + 28)
Correct Attempts\t42 (19 + 23)
Incorrect Attempts\t8 (3 + 5)
Correct Marks\t69 (23 + 46)
Penalty Marks\t4.33 (1 + 3.33)
Resultant Marks\t64.67 (22 + 42.67)
Total Questions\t65 (30 + 35)
Total Marks\t100 (30 + 70)
Exam Duration\t180 Minutes
Time Taken\t162 Minutes
Rank: 38 / 4210
Percentile: 99.1%`;

  const res = parseMockResultLocally(raw);
  assert.equal(res.confidence, 'high');
  assert.equal(res.draft.source, 'GO Classes');
  assert.equal(res.draft.type, 'Full-Length Mock');
  assert.equal(res.draft.subjectId, 'all');
  assert.equal(res.draft.score, 64.67);
  assert.equal(res.draft.maxScore, 100);
  assert.equal(res.draft.accuracy, 84);
  assert.equal(res.draft.rank, 38);
  assert.equal(res.draft.totalCandidates, 4210);
  assert.equal(res.draft.percentile, 99.1);
  assert.equal(res.draft.timeTakenMinutes, 162);
  assert.equal(res.draft.durationMinutes, 180);
});

test('Layer 1 parser handles Made Easy / ACE subject test summaries with hours/minutes', () => {
  const raw = `Made Easy GATE CS Test Series - Operating Systems Subject Test 1
Marks Obtained: 34.33 out of 50
Correct: 22
Incorrect: 5
Unattempted: 6
Positive Marks: 37
Negative Marks: 2.67
Time Taken: 1h 18m
Total Duration: 90 Minutes
Rank: 112 / 1850`;

  const res = parseMockResultLocally(raw);
  assert.equal(res.confidence, 'high');
  assert.equal(res.draft.source, 'Made Easy');
  assert.equal(res.draft.subjectId, 'os');
  assert.equal(res.draft.type, 'Subject Test');
  assert.equal(res.draft.score, 34.33);
  assert.equal(res.draft.maxScore, 50);
  assert.equal(res.draft.normalizedScore, 68.66);
  assert.equal(res.draft.correct, 22);
  assert.equal(res.draft.wrong, 5);
  assert.equal(res.draft.unattempted, 6);
  assert.equal(res.draft.penaltyMarks, 2.67);
  assert.equal(res.draft.timeTakenMinutes, 78);
  assert.equal(res.draft.durationMinutes, 90);
});

test('Layer 1 parser flags messy prose as low confidence so Layer 2 AI can assist', () => {
  const res = parseMockResultLocally('I wrote a quick practice quiz today on paging and felt decent');
  assert.equal(res.confidence, 'low');
});

test('computeMockDiagnostics aggregates negative bleed, 1M/2M accuracy, and subject averages accurately', () => {
  const mocks: MockTestEntry[] = [
    {
      id: 'm1',
      name: 'Discrete Mathematics · TWT 2',
      source: 'GO Classes',
      subjectId: 'em',
      date: '2026-11-24',
      type: 'Topic-Wise Test',
      score: 0.67,
      maxScore: 25,
      normalizedScore: 2.68,
      accuracy: 25,
      totalQuestions: 15,
      attempted: 4,
      correct: 1,
      wrong: 3,
      unattempted: 11,
      q1Attempted: 1,
      q2Attempted: 3,
      q1Correct: 0,
      q2Correct: 1,
      q1Wrong: 1,
      q2Wrong: 2,
      positiveMarks: 2,
      penaltyMarks: 1.33,
      q1PenaltyMarks: 0,
      q2PenaltyMarks: 1.33,
      durationMinutes: 45,
      timeTakenMinutes: 20,
      notes: '',
    },
    {
      id: 'm2',
      name: 'Operating Systems Subject Test',
      source: 'GO Classes',
      subjectId: 'os',
      date: '2026-11-25',
      type: 'Subject Test',
      score: 36,
      maxScore: 50,
      normalizedScore: 72,
      accuracy: 80,
      totalQuestions: 33,
      attempted: 25,
      correct: 20,
      wrong: 5,
      unattempted: 8,
      q1Attempted: 10,
      q2Attempted: 15,
      q1Correct: 9,
      q2Correct: 11,
      q1Wrong: 1,
      q2Wrong: 4,
      positiveMarks: 39,
      penaltyMarks: 3,
      q1PenaltyMarks: 0.33,
      q2PenaltyMarks: 2.67,
      durationMinutes: 90,
      timeTakenMinutes: 75,
      notes: '',
    },
  ];

  const diag = computeMockDiagnostics(mocks, {});
  assert.equal(diag.totalTests, 2);
  assert.equal(diag.topicTestCount, 1);
  assert.equal(diag.subjectTestCount, 1);
  assert.equal(diag.totalPenaltyBleed, 4.33);
  assert.equal(diag.q1Stats.attempted, 11);
  assert.equal(diag.q1Stats.correct, 9);
  assert.equal(diag.q1Stats.accuracy, 82);
  assert.equal(diag.q2Stats.attempted, 18);
  assert.equal(diag.q2Stats.correct, 12);
  assert.equal(diag.q2Stats.accuracy, 67);
  assert.equal(diag.peakNormalizedPct, 72);
  const osRow = diag.subjectMatrix.find((s) => s.id === 'os');
  assert.equal(osRow?.mockAvgPct, 72);
  assert.equal(osRow?.mockCount, 1);
});
