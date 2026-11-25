import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGateRDataset,
  extractOptionsFromHtml,
  detectOutOf2027Syllabus,
  mapTagsToSubjectId,
  filterPyqBank,
  applyVerifiedAnswer,
} from './gaterNormalizer';

test('normalizeGateRDataset handles real GateR array schema and nested object schema safely', () => {
  const sampleArray = [
    {
      title: 'GATE CSE 2023 | Question: 1',
      year: 'gatecse-2023',
      link: 'https://gateoverflow.in/399311/gate-cse-2023-question-1',
      question:
        '<p>Consider compiler phases.</p><ol style="list-style-type:upper-alpha"><li>Only S1</li><li>Only S1 and S2</li><li>All</li><li>S1 and S3</li></ol>',
      tags: ['gatecse-2023', 'compiler-design', 'compilation-phases', '1-mark'],
    },
    {
      title: 'GATE CSE 2023 | Question: 12',
      year: 'gatecse-2023',
      link: 'https://gateoverflow.in/399300/gate-cse-2023-question-12',
      question:
        '<p>Which one or more of the following need to be saved on a thread switch?</p><ol><li>PTBR</li><li>SP</li><li>PC</li><li>GPR</li></ol>',
      tags: ['gatecse-2023', 'operating-system', 'process-and-threads', 'multiple-selects', '1-mark'],
    },
    {
      title: 'GATE CSE 2023 | Question: 25',
      year: 'gatecse-2023',
      link: 'https://gateoverflow.in/399286/gate-cse-2023-question-25',
      question: '<p>The integer value printed is ________</p><pre>int main(){return 0;}</pre>',
      tags: ['gatecse-2023', 'programming-in-c', 'numerical-answers', '2-marks'],
    },
  ];

  const fromArray = normalizeGateRDataset(sampleArray);
  assert.equal(fromArray.length, 3);
  assert.equal(fromArray[0].id, 'go_399311');
  assert.equal(fromArray[0].subjectId, 'cd');
  assert.equal(fromArray[0].format, 'MCQ');
  assert.equal(fromArray[0].marks, 1);
  assert.equal(fromArray[0].year, 2023);
  assert.equal(fromArray[0].optionsExtracted, true);
  assert.equal(fromArray[0].options?.length, 4);
  assert.equal(fromArray[0].hasAnswerKey, false);

  assert.equal(fromArray[1].format, 'MSQ');
  assert.equal(fromArray[1].subjectId, 'os');

  assert.equal(fromArray[2].format, 'NAT');
  assert.equal(fromArray[2].subjectId, 'pds');
  assert.equal(fromArray[2].marks, 2);

  // Nested object wrapper fallback
  const fromObject = normalizeGateRDataset({ questions: sampleArray });
  assert.equal(fromObject.length, 3);
});

test('extractOptionsFromHtml falls back to floating A/B/C/D dock on complex HTML', () => {
  const complexHtml =
    '<p>Match the following table:</p><table><tr><td>A</td><td>1</td></tr></table><p>Choose correct matching.</p>';
  const res = extractOptionsFromHtml(complexHtml, 'MCQ');
  assert.equal(res.optionsExtracted, false);
  assert.equal(res.options.length, 4);
  assert.equal(res.promptHtml, complexHtml);
});

test('detectOutOf2027Syllabus flags removed GATE 2027 topics accurately', () => {
  assert.equal(detectOutOf2027Syllabus(['computer-networks', 'udp', '2-marks']), true);
  assert.equal(detectOutOf2027Syllabus(['operating-system', 'magnetic-disk']), true);
  assert.equal(detectOutOf2027Syllabus(['computer-networks', 'arp', 'dhcp']), true);
  assert.equal(detectOutOf2027Syllabus(['computer-networks', 'tcp', 'congestion-control']), false);
});

test('mapTagsToSubjectId maps all 11 GATE CSE subjects cleanly', () => {
  assert.equal(mapTagsToSubjectId(['quantitative-aptitude']), 'ga');
  assert.equal(mapTagsToSubjectId(['linear-algebra']), 'em');
  assert.equal(mapTagsToSubjectId(['digital-logic']), 'dl');
  assert.equal(mapTagsToSubjectId(['co-and-architecture']), 'coa');
  assert.equal(mapTagsToSubjectId(['data-structures']), 'pds');
  assert.equal(mapTagsToSubjectId(['algorithms']), 'algo');
  assert.equal(mapTagsToSubjectId(['theory-of-computation']), 'toc');
  assert.equal(mapTagsToSubjectId(['compiler-design']), 'cd');
  assert.equal(mapTagsToSubjectId(['operating-system']), 'os');
  assert.equal(mapTagsToSubjectId(['databases']), 'dbms');
  assert.equal(mapTagsToSubjectId(['computer-networks']), 'cn');
});

test('filterPyqBank and applyVerifiedAnswer work together deterministically', () => {
  const qs = normalizeGateRDataset([
    {
      title: 'GATE CSE 2022 | Q1',
      year: 'gatecse-2022',
      link: 'https://gateoverflow.in/1001/q1',
      question: '<p>TCP question</p><ol><li>A1</li><li>B1</li><li>C1</li><li>D1</li></ol>',
      tags: ['gatecse-2022', 'computer-networks', 'tcp', '2-marks'],
    },
    {
      title: 'GATE CSE 2015 | Q2',
      year: 'gatecse-2015',
      link: 'https://gateoverflow.in/1002/q2',
      question: '<p>UDP question</p><ol><li>A2</li><li>B2</li><li>C2</li><li>D2</li></ol>',
      tags: ['gatecse-2015', 'computer-networks', 'udp', '1-mark'],
    },
  ]);

  const filtered = filterPyqBank(
    qs,
    {
      subjects: ['cn'],
      tags: [],
      yearRange: 'all',
      specificYear: null,
      marks: 'all',
      format: 'all',
      status: 'all',
      hideRemoved2027: true,
      searchQuery: '',
    },
    {},
    {},
    []
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'go_1001');

  const merged = applyVerifiedAnswer(filtered[0], {
    questionId: 'go_1001',
    format: 'MCQ',
    correctOption: 'B',
    explanation: 'TCP congestion window doubles in slow start.',
    wrongOptionAnalysis: 'A confuses slow start with congestion avoidance.',
    source: 'ai',
    updatedAt: '2026-11-25T00:00:00Z',
  });
  assert.equal(merged.hasAnswerKey, true);
  assert.equal(merged.correctOption, 'B');
  assert.match(merged.explanation, /slow start/);
});
