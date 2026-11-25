import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCountdown,
  computeSprintPhase,
  evaluateQuestionResponse,
  needsSpacedRevision,
  computeSubjectMastery,
  computeStudyStreak,
  applyUnaryCalcOp,
  applyBinaryCalcOp,
  formatCalcResult,
  validateImportedQuestionsJson,
  validateBackupJson,
} from './gateMath';
import type { Question, SubjectDefinition, SubtopicProgress, StudyLogEntry } from '../types';

test('countdown computes exact days, hours, minutes, seconds', () => {
  const target = '2027-02-06T09:30:00+05:30';
  const targetMs = new Date(target).getTime();
  const nowMs = targetMs - (70 * 86400 + 4 * 3600 + 15 * 60 + 30) * 1000;
  const cd = computeCountdown(target, nowMs);
  assert.equal(cd.days, 70);
  assert.equal(cd.hours, 4);
  assert.equal(cd.minutes, 15);
  assert.equal(cd.seconds, 30);
  assert.equal(cd.isExpired, false);
});

test('sprint phase classifies Days 70-41, 40-16, and 15-1 accurately', () => {
  assert.equal(computeSprintPhase(70).phaseNumber, 1);
  assert.equal(computeSprintPhase(41).phaseNumber, 1);
  assert.equal(computeSprintPhase(40).phaseNumber, 2);
  assert.equal(computeSprintPhase(16).phaseNumber, 2);
  assert.equal(computeSprintPhase(15).phaseNumber, 3);
  assert.equal(computeSprintPhase(1).phaseNumber, 3);
});

test('GATE scoring evaluates MCQ negative marks, MSQ exact match, and NAT tolerance', () => {
  const mcq1: Question = {
    id: 'q1',
    subjectId: 'os',
    subtopic: 'Scheduling',
    format: 'MCQ',
    marks: 1,
    difficulty: 'Easy',
    sourceTag: 'PYQ',
    prompt: 'Test',
    options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
    correctOption: 'A',
    explanation: '',
    wrongOptionAnalysis: '',
  };
  assert.deepEqual(evaluateQuestionResponse(mcq1, { selectedOption: 'A' }), {
    attempted: true,
    isCorrect: true,
    marksAwarded: 1,
    maxMarks: 1,
  });
  assert.deepEqual(evaluateQuestionResponse(mcq1, { selectedOption: 'B' }), {
    attempted: true,
    isCorrect: false,
    marksAwarded: -0.33,
    maxMarks: 1,
  });

  const mcq2: Question = { ...mcq1, id: 'q2', marks: 2 };
  assert.equal(evaluateQuestionResponse(mcq2, { selectedOption: 'B' }).marksAwarded, -0.67);

  const msq: Question = {
    ...mcq1,
    id: 'q3',
    format: 'MSQ',
    marks: 2,
    correctOptions: ['A', 'C'],
  };
  assert.equal(evaluateQuestionResponse(msq, { selectedOptions: ['C', 'A'] }).marksAwarded, 2);
  // Partial selection gets 0, no negative marking
  assert.equal(evaluateQuestionResponse(msq, { selectedOptions: ['A'] }).marksAwarded, 0);
  assert.equal(evaluateQuestionResponse(msq, { selectedOptions: ['A'] }).isCorrect, false);

  const nat: Question = {
    ...mcq1,
    id: 'q4',
    format: 'NAT',
    marks: 2,
    natAnswer: 12.5,
    natTolerance: 0.05,
  };
  assert.equal(evaluateQuestionResponse(nat, { natValue: '12.53' }).isCorrect, true);
  assert.equal(evaluateQuestionResponse(nat, { natValue: '12.53' }).marksAwarded, 2);
  assert.equal(evaluateQuestionResponse(nat, { natValue: '13.0' }).isCorrect, false);
  assert.equal(evaluateQuestionResponse(nat, { natValue: '13.0' }).marksAwarded, 0);
});

test('spaced revision flags topics unrevised for 7+ days', () => {
  const now = Date.UTC(2026, 10, 24);
  const sixDaysAgo = new Date(now - 6 * 86400000).toISOString();
  const eightDaysAgo = new Date(now - 8 * 86400000).toISOString();

  const recent: SubtopicProgress = {
    status: 'concept_done',
    confidence: 3,
    lastRevisedAt: sixDaysAgo,
    notes: '',
  };
  const stale: SubtopicProgress = {
    status: 'pyqs_done',
    confidence: 4,
    lastRevisedAt: eightDaysAgo,
    notes: '',
  };
  const notStarted: SubtopicProgress = {
    status: 'not_started',
    confidence: 1,
    lastRevisedAt: null,
    notes: '',
  };

  assert.equal(needsSpacedRevision(recent, now), false);
  assert.equal(needsSpacedRevision(stale, now), true);
  assert.equal(needsSpacedRevision(notStarted, now), false);
});

test('subject mastery and study streak calculate accurately', () => {
  const subject: SubjectDefinition = {
    id: 'dl',
    code: 'DL',
    name: 'Digital Logic',
    shortName: 'Digital Logic',
    weightage: 6,
    subtopics: [
      { id: 'dl-1', subjectId: 'dl', title: 'Boolean' },
      { id: 'dl-2', subjectId: 'dl', title: 'Sequential' },
    ],
  };
  const progress: Record<string, SubtopicProgress> = {
    'dl-1': { status: 'mastered', confidence: 5, lastRevisedAt: null, notes: '' },
    'dl-2': { status: 'concept_done', confidence: 3, lastRevisedAt: null, notes: '' },
  };
  // (1.0 + 0.4) / 2 = 70%
  assert.equal(computeSubjectMastery(subject, progress), 70);

  const logs: StudyLogEntry[] = [
    { id: '1', date: '2026-11-24', subjectId: 'dl', minutes: 50, mode: 'pomodoro', completedAt: '' },
    { id: '2', date: '2026-11-23', subjectId: 'os', minutes: 25, mode: 'pomodoro', completedAt: '' },
    { id: '3', date: '2026-11-22', subjectId: 'os', minutes: 90, mode: 'pomodoro', completedAt: '' },
    { id: '4', date: '2026-11-20', subjectId: 'os', minutes: 45, mode: 'pomodoro', completedAt: '' },
  ];
  assert.equal(computeStudyStreak(logs, '2026-11-24'), 3);
});

test('scientific calculator operations handle GATE virtual calculator math', () => {
  assert.equal(formatCalcResult(applyUnaryCalcOp('pow2', 10, 'DEG')), '1024');
  assert.equal(formatCalcResult(applyUnaryCalcOp('fact', 5, 'DEG')), '120');
  assert.equal(formatCalcResult(applyUnaryCalcOp('log', 1000, 'DEG')), '3');
  assert.equal(formatCalcResult(applyUnaryCalcOp('sin', 30, 'DEG')), '0.5');
  assert.equal(formatCalcResult(applyBinaryCalcOp('mod', 17, 5)), '2');
  assert.equal(formatCalcResult(applyBinaryCalcOp('pow', 3, 4)), '81');
  assert.equal(formatCalcResult(applyBinaryCalcOp('/', 5, 0)), 'Error');
});

test('bulk JSON question importer and backup validator enforce schema', () => {
  const validJson = JSON.stringify([
    {
      subjectId: 'algo',
      subtopic: 'MST',
      format: 'NAT',
      marks: 2,
      prompt: 'How many spanning trees does K4 have?',
      natAnswer: 16,
      natTolerance: 0,
      explanation: 'By Cayley formula n^(n-2) = 4^2 = 16.',
    },
  ]);
  const res = validateImportedQuestionsJson(validJson);
  assert.equal(res.valid, true);
  assert.equal(res.questions.length, 1);
  assert.equal(res.questions[0].natAnswer, 16);

  const badJson = JSON.stringify([{ subjectId: 'invalid', prompt: 'hi', format: 'MCQ' }]);
  const badRes = validateImportedQuestionsJson(badJson);
  assert.equal(badRes.valid, false);
  assert.ok(badRes.errors.length > 0);

  assert.equal(validateBackupJson('{"version":1,"progress":{}}').valid, true);
  assert.equal(validateBackupJson('[]').valid, false);
});
