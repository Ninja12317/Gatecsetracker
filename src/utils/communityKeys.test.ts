import test from 'node:test';
import assert from 'node:assert/strict';
import {
  communityKeyDocToVerifiedRecord,
  formatOfficialKeyBadge,
  formatQuestionKeySeed,
  mergeCommunityAndLocalVerifiedKeys,
  parseManualAnswerInput,
  parseNatAnswerOrRange,
  resolveContributorDisplayName,
  verifiedRecordToCommunityKeyDoc,
  type CommunityVerifiedKeyDoc,
} from './communityKeys.ts';
import type { Question, VerifiedAnswerRecord } from '../types/index.ts';

test('parseManualAnswerInput parses MCQ, MSQ, NAT scalar, and NAT range cleanly', () => {
  const mcq = parseManualAnswerInput('MCQ', ' b ');
  assert.deepEqual(mcq, {
    format: 'MCQ',
    correctOption: 'B',
    correctAnswer: 'B',
    displayLabel: 'B',
  });
  assert.equal(parseManualAnswerInput('MCQ', 'AB'), null);

  const msq = parseManualAnswerInput('MSQ', 'c, a, C');
  assert.deepEqual(msq, {
    format: 'MSQ',
    correctOptions: ['A', 'C'],
    correctAnswer: ['A', 'C'],
    displayLabel: 'A, C',
  });

  const natScalar = parseManualAnswerInput('NAT', '42.5');
  assert.equal(natScalar?.format, 'NAT');
  assert.equal(natScalar?.natAnswer, 42.5);
  assert.equal(natScalar?.correctAnswer, '42.5');

  const natRange = parseManualAnswerInput('NAT', '42 to 43');
  assert.equal(natRange?.format, 'NAT');
  assert.equal(natRange?.natRangeMin, 42);
  assert.equal(natRange?.natRangeMax, 43);
  assert.equal(natRange?.natAnswer, 42.5);
  assert.equal(natRange?.correctAnswer, '42 to 43');

  const negRange = parseNatAnswerOrRange('-5.5 to -2.5');
  assert.equal(negRange?.natRangeMin, -5.5);
  assert.equal(negRange?.natRangeMax, -2.5);
  assert.equal(negRange?.canonical, '-5.5 to -2.5');
});

test('communityKeyDocToVerifiedRecord and verifiedRecordToCommunityKeyDoc round-trip cleanly', () => {
  const doc: CommunityVerifiedKeyDoc = {
    questionId: 'gater-2024-q12',
    correctAnswer: ['A', 'D'],
    explanation: 'Both statements follow from Pumping Lemma closure properties.',
    updatedByName: 'Nihal Pawar',
    updatedAt: 1760000000000,
  };

  const rec = communityKeyDocToVerifiedRecord(doc);
  assert.ok(rec);
  assert.equal(rec.format, 'MSQ');
  assert.deepEqual(rec.correctOptions, ['A', 'D']);
  assert.equal(rec.updatedByName, 'Nihal Pawar');
  assert.equal(rec.updatedAtMs, 1760000000000);

  const back = verifiedRecordToCommunityKeyDoc(rec);
  assert.deepEqual(back, doc);

  const natRangeDoc: CommunityVerifiedKeyDoc = {
    questionId: 'gater-2023-nat5',
    correctAnswer: '10.2 to 10.4',
    updatedByName: 'Community',
    updatedAt: 1760000005000,
  };
  const natRec = communityKeyDocToVerifiedRecord(natRangeDoc);
  assert.ok(natRec);
  assert.equal(natRec.format, 'NAT');
  assert.equal(natRec.natRangeMin, 10.2);
  assert.equal(natRec.natRangeMax, 10.4);

  const natBack = verifiedRecordToCommunityKeyDoc(natRec);
  assert.deepEqual(natBack, natRangeDoc);
});

test('mergeCommunityAndLocalVerifiedKeys picks newest timestamp and prefers community on tie', () => {
  const olderLocal: VerifiedAnswerRecord = {
    questionId: 'q1',
    format: 'MCQ',
    correctOption: 'A',
    explanation: 'Local detailed note',
    wrongOptionAnalysis: 'B is wrong',
    source: 'manual',
    updatedAt: new Date(1000).toISOString(),
    updatedAtMs: 1000,
  };
  const newerCommunity: VerifiedAnswerRecord = {
    questionId: 'q1',
    format: 'MCQ',
    correctOption: 'C',
    explanation: '',
    wrongOptionAnalysis: '',
    source: 'manual',
    updatedByName: 'Nihal Pawar',
    updatedAt: new Date(2000).toISOString(),
    updatedAtMs: 2000,
  };

  const merged = mergeCommunityAndLocalVerifiedKeys({ q1: newerCommunity }, { q1: olderLocal });
  assert.equal(merged.q1.correctOption, 'C');
  assert.equal(merged.q1.updatedByName, 'Nihal Pawar');
  // Preserves existing explanation when community update omitted it
  assert.equal(merged.q1.explanation, 'Local detailed note');

  // Newer local update wins until synced
  const newerLocal: VerifiedAnswerRecord = {
    ...olderLocal,
    correctOption: 'D',
    updatedAt: new Date(3000).toISOString(),
    updatedAtMs: 3000,
  };
  const merged2 = mergeCommunityAndLocalVerifiedKeys({ q1: newerCommunity }, { q1: newerLocal });
  assert.equal(merged2.q1.correctOption, 'D');
});

test('resolveContributorDisplayName falls back from profile to auth to Community', () => {
  assert.equal(
    resolveContributorDisplayName({ displayName: 'Nihal Pawar' }, { displayName: 'Auth User' }),
    'Nihal Pawar'
  );
  assert.equal(
    resolveContributorDisplayName({ displayName: '   ' }, { displayName: 'Aarav Sharma' }),
    'Aarav Sharma'
  );
  assert.equal(resolveContributorDisplayName(null, null), 'Community');
});

test('formatQuestionKeySeed and formatOfficialKeyBadge support NAT ranges', () => {
  const q: Question = {
    id: 'nat-1',
    subjectId: 'os',
    subtopic: 'Paging',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GATE 2024',
    prompt: 'Compute EMAT',
    natAnswer: 42.5,
    natRangeMin: 42,
    natRangeMax: 43,
    natUnit: 'ns',
    explanation: '',
    wrongOptionAnalysis: '',
  };
  assert.equal(formatQuestionKeySeed(q), '42 to 43');
  assert.equal(formatOfficialKeyBadge(q), '42 to 43 ns');
});
