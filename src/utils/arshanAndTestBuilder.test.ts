import test from 'node:test';
import assert from 'node:assert/strict';
import type { Question } from '../types/index.ts';
import {
  extractArshanPyqData,
  extractQuestionsFromArshanMarkdown,
  mergeQuestionBanks,
  normalizeArshanStructuredQuestions,
  normalizeCanonicalSubjectId,
  parseArshanAnswerKey,
  renderArshanMarkdownToSafeHtml,
} from './arshanNormalizer.ts';
import {
  buildExactCountTest,
  computeSourceFilterCounts,
  computeSubjectMatchCounts,
  computeUniqueFilteredPool,
  deduplicateQuestionPool,
  fisherYatesShuffle,
  type TestBuilderFilterCriteria,
} from './testBuilder.ts';
import { evaluateQuestionResponse } from './gateMath.ts';

function makeMockQuestion(idx: number, overrides: Partial<Question> = {}): Question {
  return {
    id: `q_${idx}`,
    title: `GATE CSE ${2010 + (idx % 14)} | Question: ${idx}`,
    subjectId: 'os',
    subtopic: 'Paging',
    format: 'MCQ',
    marks: idx % 2 === 0 ? 2 : 1,
    difficulty: 'Medium',
    sourceTag: `GATE CSE ${2010 + (idx % 14)}`,
    year: 2010 + (idx % 14),
    prompt: `Unique GATE question statement number ${idx} about virtual memory page tables and TLB hits.`,
    options: [
      { id: 'A', text: 'Option A' },
      { id: 'B', text: 'Option B' },
      { id: 'C', text: 'Option C' },
      { id: 'D', text: 'Option D' },
    ],
    hasAnswerKey: false,
    isGateR: true,
    sourceRepo: 'gater',
    sourceCategory: 'PYQ',
    explanation: '',
    wrongOptionAnalysis: '',
    ...overrides,
  };
}

test('Canonical 12-subject normalization maps Discrete Math under EM, DB under DBMS, and splits C Programming & DS', () => {
  const dm = normalizeCanonicalSubjectId('DM', 'Graph Theory');
  assert.equal(dm.subjectId, 'em');
  assert.equal(dm.subtopicOverride, 'Discrete Mathematics');
  assert.ok(dm.extraTags.includes('discrete-mathematics'));

  const dmFull = normalizeCanonicalSubjectId('Discrete Mathematics');
  assert.equal(dmFull.subjectId, 'em');
  assert.equal(dmFull.subtopicOverride, 'Discrete Mathematics');

  assert.equal(normalizeCanonicalSubjectId('DB').subjectId, 'dbms');
  assert.equal(normalizeCanonicalSubjectId('C Programming').subjectId, 'cprog');
  assert.equal(normalizeCanonicalSubjectId('Data Structures').subjectId, 'ds');
  assert.equal(normalizeCanonicalSubjectId('CO & Architecture').subjectId, 'coa');
  assert.equal(normalizeCanonicalSubjectId('ALGO').subjectId, 'algo');
  assert.equal(normalizeCanonicalSubjectId('TOC').subjectId, 'toc');
  assert.equal(normalizeCanonicalSubjectId('CD').subjectId, 'cd');
  assert.equal(normalizeCanonicalSubjectId('CN').subjectId, 'cn');
  assert.equal(normalizeCanonicalSubjectId('DL').subjectId, 'dl');
  assert.equal(normalizeCanonicalSubjectId('GA').subjectId, 'ga');
});

test('parseArshanAnswerKey handles MCQ, MSQ, NAT ranges, and ignores MTA', () => {
  const mcq = parseArshanAnswerKey('c', 'MCQ');
  assert.equal(mcq.hasKey, true);
  assert.equal(mcq.correctOption, 'C');

  const msq = parseArshanAnswerKey(['B', 'A', 'D'], 'MSQ');
  assert.equal(msq.hasKey, true);
  assert.deepEqual(msq.correctOptions, ['A', 'B', 'D']);

  const natObj = parseArshanAnswerKey({ min: 10.5, max: 11.5 }, 'NAT');
  assert.equal(natObj.hasKey, true);
  assert.equal(natObj.natRangeMin, 10.5);
  assert.equal(natObj.natRangeMax, 11.5);

  const natRangeStr = parseArshanAnswerKey('509 to 509', 'NAT');
  assert.equal(natRangeStr.hasKey, true);
  assert.equal(natRangeStr.natAnswer, 509);

  const natPartial = parseArshanAnswerKey('to 5', 'NAT');
  assert.equal(natPartial.hasKey, true);
  assert.equal(natPartial.natAnswer, 5);

  const mta = parseArshanAnswerKey('MTA', 'MCQ');
  assert.equal(mta.hasKey, false);
});

test('NAT range grading in evaluateQuestionResponse honors natRangeMin..natRangeMax', () => {
  const natQ = makeMockQuestion(999, {
    format: 'NAT',
    marks: 2,
    natAnswer: 11,
    natRangeMin: 10.5,
    natRangeMax: 11.5,
    hasAnswerKey: true,
  });
  assert.equal(evaluateQuestionResponse(natQ, { natValue: '10.5' }).isCorrect, true);
  assert.equal(evaluateQuestionResponse(natQ, { natValue: '11.5' }).isCorrect, true);
  assert.equal(evaluateQuestionResponse(natQ, { natValue: '10.4' }).isCorrect, false);
  assert.equal(evaluateQuestionResponse(natQ, { natValue: '11.6' }).isCorrect, false);
});

test('renderArshanMarkdownToSafeHtml escapes raw script tags while preserving KaTeX and code blocks', () => {
  const html = renderArshanMarkdownToSafeHtml(
    'Value is $x < y$ with **bold** and <script>alert(1)</script> and `int *p`.'
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<code>int *p</code>'));
  assert.ok(html.includes('$x &lt; y$'));
});

test('normalizeArshanStructuredQuestions parses Predicted GATE 2027 JSON with DM->EM mapping', () => {
  const payload = {
    title: 'Predicted GATE CSE 2027 paper',
    questions: [
      {
        no: 12,
        marks: 2,
        type: 'MSQ',
        subject: 'DM',
        topic_name: 'Graph Theory',
        text: 'Which of the following statements about planar graphs are **TRUE**?',
        options: ['Every tree is planar', 'K5 is planar', 'K3,3 is non-planar', 'Euler formula holds'],
        answer: ['A', 'C', 'D'],
        solution: 'By Kuratowski theorem, $K_5$ and $K_{3,3}$ are non-planar.',
        why: 'Planar graphs appear frequently in DM.',
      },
      {
        no: 15,
        marks: 1,
        type: 'NAT',
        subject: 'DL',
        topic_name: 'IEEE 754',
        text: 'The decimal value of `0xC1340000` is ______.',
        options: null,
        answer: { min: -11.25, max: -11.25 },
        solution: 'Sign=1, exp=3, mantissa=1.40625 => -11.25.',
        why: 'High yield IEEE 754 conversion.',
      },
    ],
  };

  const qs = normalizeArshanStructuredQuestions(payload, 'data/predicted-2027.json');
  assert.equal(qs.length, 2);
  assert.equal(qs[0].subjectId, 'em');
  assert.equal(qs[0].subtopic, 'Discrete Mathematics · Graph Theory');
  assert.ok(qs[0].tags?.includes('discrete-mathematics'));
  assert.equal(qs[0].sourceCategory, 'PREDICTED_2027');
  assert.equal(qs[0].sourceRepo, 'arshan');
  assert.equal(qs[0].hasAnswerKey, true);
  assert.deepEqual(qs[0].correctOptions, ['A', 'C', 'D']);

  assert.equal(qs[1].format, 'NAT');
  assert.equal(qs[1].natAnswer, -11.25);
  assert.equal(qs[1].natRangeMin, -11.25);
  assert.equal(qs[1].natRangeMax, -11.25);
});

test('extractQuestionsFromArshanMarkdown parses structured Markdown question blocks safely', () => {
  const md = `
### Q.1 · 1 mark · MCQ · Operating Systems
What is the minimum number of page frames required to avoid Belady's anomaly in LRU?
- (A) 1
- (B) 2
- (C) LRU never suffers from Belady's anomaly
- (D) 4

**Answer:** C
**Solution:** LRU is a stack algorithm so it never suffers from Belady's anomaly.
`;
  const qs = extractQuestionsFromArshanMarkdown(md, 'content/extra-practice.md');
  assert.equal(qs.length, 1);
  assert.equal(qs[0].subjectId, 'os');
  assert.equal(qs[0].correctOption, 'C');
  assert.equal(qs[0].options?.length, 4);
  assert.equal(qs[0].sourceCategory, 'EXTRA_PRACTICE');
});

test('mergeQuestionBanks enriches matching GateR PYQs in-place without duplication and appends unique Arshan questions', () => {
  const gaterQ1 = makeMockQuestion(1, {
    id: 'go_371935',
    title: 'GATE CSE 2022 | Question: 1',
    subjectId: 'algo',
    year: 2022,
    marks: 1,
    format: 'MCQ',
    hasAnswerKey: false,
    correctOption: undefined,
  });
  const gaterQ2 = makeMockQuestion(2, {
    id: 'go_371934',
    title: 'GATE CSE 2022 | Question: 2',
    subjectId: 'toc',
    year: 2022,
    marks: 1,
    format: 'MCQ',
    hasAnswerKey: false,
  });

  const { pyqAnswerKeys } = extractArshanPyqData([
    {
      paper: '2022',
      year: 2022,
      set: null,
      qno: 11,
      subject: 'ALGO',
      topic_name: 'Asymptotic Analysis',
      type: 'MCQ',
      marks: 1,
      key: 'A',
      text: 'Asymptotic statements valid for all positive f(n)',
      pdf: 'papers/GATE-CS-2022.pdf',
    },
    {
      paper: '2022',
      year: 2022,
      set: null,
      qno: 12,
      subject: 'TOC',
      topic_name: 'Finite Automata',
      type: 'MCQ',
      marks: 1,
      key: 'D',
      text: 'Regular expression for a finite automaton',
      pdf: 'papers/GATE-CS-2022.pdf',
    },
  ]);

  const arshanPred = normalizeArshanStructuredQuestions(
    {
      questions: [
        {
          no: 1,
          marks: 2,
          type: 'MCQ',
          subject: 'OS',
          topic_name: 'Deadlock',
          text: 'Consider a system with 3 processes and 10 identical tape drives. What is the safe state condition?',
          options: ['Always safe', 'Deadlock possible', 'Needs 12 drives', 'None'],
          answer: 'B',
          solution: 'Max need exceeds available.',
        },
      ],
    },
    'data/predicted-2027.json'
  );

  const { questions, stats } = mergeQuestionBanks([gaterQ1, gaterQ2], arshanPred, pyqAnswerKeys);
  assert.equal(questions.length, 3); // 2 enriched GateR + 1 unique Predicted 2027 (ZERO duplication!)
  assert.equal(stats.enrichedCount, 2);
  assert.equal(stats.verifiedCount, 3);
  assert.equal(stats.predicted2027Count, 1);

  const enriched1 = questions.find((q) => q.id === 'go_371935');
  assert.equal(enriched1?.hasAnswerKey, true);
  assert.equal(enriched1?.correctOption, 'A');
  assert.equal(enriched1?.sourceRepo, 'merged');
});

test('buildExactCountTest delivers exact 25 unique Qs, zero overlap on consecutive runs, and handles rollover + shortfall', () => {
  // Include 60 unique questions (some without answer keys — must NOT be silently dropped!)
  // plus 5 duplicate-text questions to prove strict deduplication.
  const bank: Question[] = [];
  for (let i = 1; i <= 60; i++) {
    bank.push(makeMockQuestion(i, { hasAnswerKey: i % 3 === 0 }));
  }
  // Add duplicates with different IDs but identical normalized prompt text
  bank.push(makeMockQuestion(1, { id: 'dup_of_1' }));
  bank.push(makeMockQuestion(2, { id: 'dup_of_2' }));

  const deduped = deduplicateQuestionPool(bank);
  assert.equal(deduped.length, 60);

  let servedHistory: Record<string, number> = {};
  const attemptedIds = new Set<string>();

  // Deterministic PRNG for repeatable test assertions
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  // Run 1: request 25 from 60 -> must get exact 25 unique fresh questions
  const run1 = buildExactCountTest({
    pool: bank,
    requestedCount: 25,
    attemptedIds,
    servedHistory,
    shuffleOrder: true,
    rng,
  });
  assert.equal(run1.questions.length, 25);
  assert.equal(new Set(run1.questions.map((q) => q.id)).size, 25);
  assert.equal(run1.freshCount, 25);
  assert.equal(run1.recycledCount, 0);
  assert.equal(run1.shortfall, 0);

  // Record Run 1 into servedHistory
  const t1 = 1000;
  for (const q of run1.questions) servedHistory[q.id] = t1;

  // Run 2: request 25 -> must get 25 completely different fresh questions (0 overlap with Run 1!)
  const run2 = buildExactCountTest({
    pool: bank,
    requestedCount: 25,
    attemptedIds,
    servedHistory,
    shuffleOrder: true,
    rng,
  });
  assert.equal(run2.questions.length, 25);
  assert.equal(new Set(run2.questions.map((q) => q.id)).size, 25);
  const run1Ids = new Set(run1.questions.map((q) => q.id));
  const overlap12 = run2.questions.filter((q) => run1Ids.has(q.id));
  assert.equal(overlap12.length, 0);

  // Record Run 2 into servedHistory at later timestamp t2
  const t2 = 2000;
  for (const q of run2.questions) servedHistory[q.id] = t2;

  // Run 3: only 10 fresh remain -> must take all 10 fresh + 15 oldest recycled (all from Run 1 at t1!)
  const run3 = buildExactCountTest({
    pool: bank,
    requestedCount: 25,
    attemptedIds,
    servedHistory,
    shuffleOrder: true,
    rng,
  });
  assert.equal(run3.questions.length, 25);
  assert.equal(new Set(run3.questions.map((q) => q.id)).size, 25);
  assert.equal(run3.freshCount, 10);
  assert.equal(run3.recycledCount, 15);
  const run2Ids = new Set(run2.questions.map((q) => q.id));
  const overlapWithRecentRun2 = run3.questions.filter((q) => run2Ids.has(q.id));
  assert.equal(overlapWithRecentRun2.length, 0);

  // Shortfall test: request 25 from a 14-question pool -> exact 14 + shortfall 11
  const narrow = buildExactCountTest({
    pool: deduped.slice(0, 14),
    requestedCount: 25,
    attemptedIds,
    servedHistory: {},
    shuffleOrder: true,
    rng,
  });
  assert.equal(narrow.questions.length, 14);
  assert.equal(narrow.availableCount, 14);
  assert.equal(narrow.shortfall, 11);
});

test('computeUniqueFilteredPool respects Source Filter pills and never drops unverified Qs by default', () => {
  const qs: Question[] = [
    makeMockQuestion(1, { subjectId: 'os', hasAnswerKey: false, sourceRepo: 'gater', sourceCategory: 'PYQ' }),
    makeMockQuestion(2, { subjectId: 'os', hasAnswerKey: true, correctOption: 'A', sourceRepo: 'merged', sourceCategory: 'PYQ', isArshan: true }),
    makeMockQuestion(3, { subjectId: 'cn', hasAnswerKey: true, correctOption: 'B', sourceRepo: 'arshan', sourceCategory: 'PREDICTED_2027', isArshan: true, isGateR: false, year: 2027 }),
  ];

  const baseCriteria: TestBuilderFilterCriteria = {
    subjects: [],
    tags: [],
    sourceFilter: 'all',
    yearRange: 'all',
    specificYear: null,
    marks: 'all',
    format: 'all',
    status: 'all',
    hideRemoved2027: true,
    searchQuery: '',
  };

  assert.equal(computeUniqueFilteredPool(qs, baseCriteria, {}, {}, []).length, 3);
  assert.equal(
    computeUniqueFilteredPool(qs, { ...baseCriteria, sourceFilter: 'verified_only' }, {}, {}, []).length,
    2
  );
  assert.equal(
    computeUniqueFilteredPool(qs, { ...baseCriteria, sourceFilter: 'extra_predicted' }, {}, {}, []).length,
    1
  );
  assert.equal(
    computeUniqueFilteredPool(qs, { ...baseCriteria, sourceFilter: 'arshan_bank' }, {}, {}, []).length,
    2
  );
  assert.equal(
    computeUniqueFilteredPool(qs, { ...baseCriteria, sourceFilter: 'gater_bank' }, {}, {}, []).length,
    2
  );

  const subjCounts = computeSubjectMatchCounts(qs, { ...baseCriteria, sourceFilter: 'verified_only' }, {}, {}, []);
  assert.equal(subjCounts['os'], 1);
  assert.equal(subjCounts['cn'], 1);

  const srcCounts = computeSourceFilterCounts(qs, true);
  assert.equal(srcCounts.all, 3);
  assert.equal(srcCounts.verified_only, 2);
  assert.equal(srcCounts.extra_predicted, 1);

  const shuffled = fisherYatesShuffle([1, 2, 3, 4, 5]);
  assert.equal(shuffled.length, 5);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});
