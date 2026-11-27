import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_C_PRESETS,
  executeCCodeLocally,
  extractCodeFromPyq,
  convertFramesToTraceTable,
} from './cCodeInterpreter.ts';
import type { Question } from '../types/index.ts';

test('Local C interpreter executes static variable recursion accurately (GATE classic)', () => {
  const preset = GATE_C_PRESETS.find((p) => p.id === 'static_recursion')!;
  const res = executeCCodeLocally(preset.code);
  assert.equal(res.ok, true);
  assert.equal(res.stdout.trim(), 'ans = 7');
  assert.equal(res.flowchart.mode, 'recursion_tree');
  assert.ok(res.frames.length >= 10);
  assert.ok(res.flowchart.nodes.length >= 4);
});

test('Local C interpreter executes pointer arithmetic & array mutation accurately', () => {
  const preset = GATE_C_PRESETS.find((p) => p.id === 'pointer_arith')!;
  const res = executeCCodeLocally(preset.code);
  assert.equal(res.ok, true);
  assert.equal(res.stdout.trim(), 'a[0]=25 sum=100');
  assert.equal(res.flowchart.mode, 'flowchart');
  assert.ok(res.frames.some((f) => (f.memoryPointers?.length ?? 0) > 0));
});

test('Local C interpreter builds recursion tree for branching fib(4)', () => {
  const preset = GATE_C_PRESETS.find((p) => p.id === 'tree_recursion')!;
  const res = executeCCodeLocally(preset.code);
  assert.equal(res.ok, true);
  assert.equal(res.stdout.trim(), 'fib(4) = 3');
  assert.equal(res.flowchart.mode, 'recursion_tree');
  assert.ok(res.flowchart.edges.length >= 8);
});

test('Local C interpreter guards infinite loops cleanly without hanging', () => {
  const res = executeCCodeLocally(`
    int main() {
      int x = 0;
      while (1) { x++; }
      return 0;
    }
  `);
  assert.equal(res.ok, true);
  assert.equal(res.truncated, true);
  assert.ok(res.frames.length <= 220);
});

test('extractCodeFromPyq and convertFramesToTraceTable produce valid structured data', () => {
  const q: Question = {
    id: 'test_q',
    subjectId: 'cprog',
    subtopic: 'C Pointers',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GATE 2024',
    prompt: 'What is output?',
    bodyHtml: '<p>Consider:</p><pre><code>int main() {\n  int x = 5;\n  printf("%d", x);\n}</code></pre>',
    explanation: '',
    wrongOptionAnalysis: '',
  };
  const extracted = extractCodeFromPyq(q);
  assert.ok(extracted && extracted.includes('int x = 5;'));

  const run = executeCCodeLocally(extracted!);
  assert.equal(run.ok, true);
  assert.equal(run.stdout, '5');

  const table = convertFramesToTraceTable('test_q', run.frames);
  assert.equal(table.questionId, 'test_q');
  assert.equal(table.columns.length, 5);
  assert.ok(table.rows.length > 0);
});
