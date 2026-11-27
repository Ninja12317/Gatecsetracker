import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPdsToCprogOrDs,
  hasGateOverflowUrl,
  migrateLegacyProgressMap,
  migrateLegacyQuestion,
  normalizeSubject12,
} from './subjectMigration.ts';
import type { Question, SubtopicProgress } from '../types/index.ts';

test('classifyPdsToCprogOrDs routes C-language topics to cprog and DS topics to ds', () => {
  assert.equal(
    classifyPdsToCprogOrDs({
      tags: ['c-programming', 'pointers'],
      title: 'Double pointer output',
      text: 'int main() { printf("%d", **ptr); }',
    }),
    'cprog'
  );
  assert.equal(
    classifyPdsToCprogOrDs({
      tags: ['recursion', 'static'],
      subtopic: 'Storage Classes & Scoping',
    }),
    'cprog'
  );
  assert.equal(
    classifyPdsToCprogOrDs({
      tags: ['binary-search-trees', 'data-structures'],
      subtopic: 'AVL Trees & Rotations',
    }),
    'ds'
  );
  assert.equal(
    classifyPdsToCprogOrDs({
      title: 'Min-Heap delete-min and Linked List reversal',
      subtopic: 'Heaps & Stacks',
    }),
    'ds'
  );
});

test('normalizeSubject12 converts legacy pds cleanly and preserves canonical 12 IDs', () => {
  assert.equal(normalizeSubject12('cprog'), 'cprog');
  assert.equal(normalizeSubject12('ds'), 'ds');
  assert.equal(normalizeSubject12('pds', { subtopic: 'Pointers & Recursion' }), 'cprog');
  assert.equal(normalizeSubject12('pds', { subtopic: 'Binary Heaps & Queues' }), 'ds');
});

test('hasGateOverflowUrl strictly allows only gateoverflow.in URLs and rejects GitHub/Arshan URLs', () => {
  assert.equal(hasGateOverflowUrl({ sourceUrl: 'https://gateoverflow.in/12345/gate-cse-2023' }), true);
  assert.equal(hasGateOverflowUrl({ sourceUrl: 'https://www.gateoverflow.in/400001' }), true);
  assert.equal(
    hasGateOverflowUrl({ sourceUrl: 'https://github.com/arshanalikhan/gate-cse/blob/main/q1.md' }),
    false
  );
  assert.equal(hasGateOverflowUrl({ sourceUrl: 'https://raw.githubusercontent.com/foo/bar' }), false);
  assert.equal(hasGateOverflowUrl({ sourceUrl: '' }), false);
  assert.equal(hasGateOverflowUrl({ sourceUrl: undefined }), false);
});

test('migrateLegacyProgressMap safely expands pds-* subtopics to cprog-* and ds-* without data loss', () => {
  const sample: SubtopicProgress = {
    status: 'pyqs_done',
    confidence: 4,
    lastRevisedAt: '2026-11-20T00:00:00.000Z',
    notes: 'Revise static pointers',
  };
  const migrated = migrateLegacyProgressMap({
    'pds-c': sample,
    'pds-trees': { ...sample, notes: 'Catalan BST' },
    'os-mem': { ...sample, notes: 'TLB' },
  });
  assert.equal(migrated['cprog-basics'].notes, 'Revise static pointers');
  assert.equal(migrated['cprog-pointers'].notes, 'Revise static pointers');
  assert.equal(migrated['ds-trees'].notes, 'Catalan BST');
  assert.equal(migrated['os-mem'].notes, 'TLB');
  assert.equal(migrated['pds-c'], undefined);
});

test('migrateLegacyQuestion converts legacy pds Question safely', () => {
  const legacyQ = {
    id: 'legacy-1',
    subjectId: 'pds' as unknown as Question['subjectId'],
    subtopic: 'Linked Lists & Stacks',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GATE',
    prompt: 'Given a singly linked list with n nodes...',
    explanation: 'O(n)',
    wrongOptionAnalysis: 'Check head pointer.',
  } as Question;
  const out = migrateLegacyQuestion(legacyQ);
  assert.equal(out.subjectId, 'ds');
});
