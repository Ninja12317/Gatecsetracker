import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatchingPyqsForVaultCard } from './vaultMatcher.ts';
import type { Question, VaultCard } from '../types/index.ts';

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q-default',
    subjectId: 'os',
    subtopic: 'General',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GATE 2023',
    year: 2023,
    prompt: 'Default question text',
    explanation: 'Exp',
    wrongOptionAnalysis: 'Trap',
    ...overrides,
  };
}

test('findMatchingPyqsForVaultCard prioritizes exact tags (+5), then subtopic/title (+3), then body (+1)', () => {
  const card: VaultCard = {
    id: 'card-tlb',
    subject: 'os',
    subtopic: 'TLB & Multi-Level Paging',
    tagMatchKeywords: ['tlb', 'paging', 'emat'],
    kind: 'FORMULA',
    highYield: true,
    title: 'Effective Memory Access Time with TLB',
    gateTruth: 'EMAT = h(t+m) + (1-h)(t+2m)',
    source: 'Master Bundle',
  };

  const qTagMatch = makeQuestion({
    id: 'q-tag',
    subjectId: 'os',
    tags: ['tlb', 'paging'],
    subtopic: 'Virtual Memory',
    prompt: 'Compute EMAT',
  });
  const qSubtopicMatch = makeQuestion({
    id: 'q-sub',
    subjectId: 'os',
    tags: ['memory'],
    subtopic: 'TLB Lookup',
    prompt: 'Access time calculation',
  });
  const qBodyOnly = makeQuestion({
    id: 'q-body',
    subjectId: 'os',
    tags: ['memory'],
    subtopic: 'Swapping',
    prompt: 'A system uses paging with 4KB frames',
  });
  const qOtherSubject = makeQuestion({
    id: 'q-coa',
    subjectId: 'coa',
    tags: ['tlb', 'paging'],
    prompt: 'TLB in COA',
  });
  const qRemoved = makeQuestion({
    id: 'q-removed',
    subjectId: 'os',
    tags: ['tlb'],
    isOutOf2027Syllabus: true,
  });

  const res = findMatchingPyqsForVaultCard(card, [
    qBodyOnly,
    qOtherSubject,
    qRemoved,
    qSubtopicMatch,
    qTagMatch,
  ]);

  assert.equal(res.usedSubjectFallback, false);
  assert.equal(res.strictMatchCount, 3);
  assert.deepEqual(
    res.questions.map((q) => q.id),
    ['q-tag', 'q-sub', 'q-body']
  );
});

test('findMatchingPyqsForVaultCard falls back honestly to card subject when 0 strict matches exist', () => {
  const card: VaultCard = {
    id: 'card-rare',
    subject: 'cd',
    subtopic: 'Peephole Optimization',
    tagMatchKeywords: ['peephole', 'algebraic-identity'],
    kind: 'TIP',
    highYield: false,
    title: 'Peephole Redundant Load Elimination',
    gateTruth: 'Removes adjacent redundant store-load pairs.',
    source: 'Master Bundle',
  };

  const qCd1 = makeQuestion({ id: 'q-cd-1', subjectId: 'cd', subtopic: 'LR Parsing', prompt: 'Construct SLR(1)' });
  const qOs1 = makeQuestion({ id: 'q-os-1', subjectId: 'os', subtopic: 'Peephole', prompt: 'Peephole in OS' });

  const res = findMatchingPyqsForVaultCard(card, [qCd1, qOs1]);
  assert.equal(res.usedSubjectFallback, true);
  assert.equal(res.strictMatchCount, 0);
  assert.equal(res.fallbackLabel, 'Showing Compilers PYQs');
  assert.deepEqual(
    res.questions.map((q) => q.id),
    ['q-cd-1']
  );
});
