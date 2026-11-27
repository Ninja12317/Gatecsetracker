import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPdfDocument,
  getOfficialAnswerSummary,
  sanitizePdfFilename,
  stripHtmlAndLatexForPdf,
} from './pdfExporter.ts';
import type { Question, WarRoomState } from '../types/index.ts';

function makeSampleQuestion(): Question {
  return {
    id: 'q-algo-2024-1',
    title: 'GATE CSE 2024 · Dijkstra Complexity',
    subjectId: 'algo',
    subtopic: 'Shortest Paths',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ · GATE 2024',
    sourceUrl: 'https://gateoverflow.in/123456',
    year: 2024,
    prompt: 'What is the time complexity of Dijkstra algorithm with a binary heap?',
    bodyHtml:
      '<p>Consider a connected graph $G = (V, E)$ with non-negative weights.</p><p>Using a binary min-heap, the worst-case complexity is $\\Theta((|V| + |E|) \\log |V|)$ &amp; $\\frac{1}{2} \\leq 1$.</p>',
    codeSnippet: 'while (!pq.empty()) {\n  int u = pq.pop();\n}',
    options: [
      { id: 'A', text: '$O(|V|^2)$' },
      { id: 'B', text: '$\\Theta((|V| + |E|) \\log |V|)$' },
      { id: 'C', text: '$O(|E|)$' },
      { id: 'D', text: '$O(|V| \\log |V|)$' },
    ],
    optionsExtracted: true,
    correctOption: 'B',
    explanation: 'Each vertex is extracted once and each edge causes at most one decrease-key operation.',
    wrongOptionAnalysis: 'Option A applies to unsorted array priority queue, not binary heap.',
  };
}

function makeMinimalState(): WarRoomState {
  return {
    version: 2,
    theme: 'light',
    settings: {
      targetDateIso: '2027-02-06T09:30:00+05:30',
      shift: 'Forenoon (09:30 IST)',
      dailyGoalMinutes: 240,
      themeMode: 'light',
      accentTheme: 'brown',
      simpleMode: false,
      uiScale: 'default',
      contentWidth: 'focused',
      pomodoroWorkMinutes: 50,
      pomodoroShortBreakMinutes: 10,
      pomodoroLongBreakMinutes: 25,
      timerChimeEnabled: true,
      autoHideRemoved2027: true,
      autoAddWrongToMistakes: true,
      showLivePaceTimer: true,
      enableKeyboardShortcuts: true,
    },
    lastAutopilotIstDate: '2026-11-25',
    lastTrapsIstDate: '2026-11-25',
    progress: {},
    studyLogs: [
      {
        id: 'log-1',
        date: '2026-11-25',
        subjectId: 'algo',
        minutes: 50,
        mode: 'pomodoro',
        completedAt: '2026-11-25T10:00:00.000Z',
      },
    ],
    attempts: {},
    mistakes: {},
    verifiedAnswers: {},
    bookmarkedQuestions: [],
    savedSketches: {},
    traceTables: {
      'q-test-1': {
        questionId: 'q-test-1',
        presetName: 'c_trace',
        columns: ['Step', 'u', 'dist[u]'],
        rows: [
          { id: 'r1', cells: ['1', '0', '0'] },
          { id: 'r2', cells: ['2', '1', '4'] },
        ],
        updatedAt: '2026-11-25T10:00:00Z',
      },
    },
    gaStreakLogs: {},
    dailyProgress: {
      usedDailyDppIds: [],
      usedDailyGaIds: [],
      dailyDppByDate: {},
      dailyGaByDate: {},
    },
    customQuestions: [],
    bookmarkedTips: [],
    customTips: [],
    trapsVault: [],
    vaultPacks: [],
    srsCards: {},
    mocks: [
      {
        id: 'mock-1',
        name: 'GO Classes · Discrete Math Topic Test 2',
        source: 'GO Classes',
        subjectId: 'em',
        date: '2026-11-24',
        type: 'Topic-Wise Test',
        score: 18.33,
        maxScore: 25,
        normalizedScore: 73.32,
        accuracy: 85,
        correct: 11,
        wrong: 2,
        unattempted: 2,
        positiveMarks: 19.67,
        penaltyMarks: 1.34,
        notes: 'Solid accuracy on combinatorics',
      },
    ],
  };
}

describe('pdfExporter', () => {
  it('cleans HTML tags, entities, and LaTeX into crisp PDF-safe text', () => {
    const cleaned = stripHtmlAndLatexForPdf(
      '<p>Complexity is $\\Theta(n \\log n)$ &amp; $\\frac{a}{b} \\leq \\infty$ &rarr; Done.</p>'
    );
    assert.ok(cleaned.includes('Theta(n log n)'));
    assert.ok(cleaned.includes('&'));
    assert.ok(cleaned.includes('(a)/(b) <= inf'));
    assert.ok(cleaned.includes('-> Done.'));
    assert.ok(!cleaned.includes('<p>'));

    // Double-escaped Huffman formula with \;, \quad, \text{}, \log
    const huffman = stripHtmlAndLatexForPdf(
      'T_{\\\\text{Huffman}} = O(n\\\\log n) \\\\;(\\\\text{or } O(n) \\\\text{ if frequencies pre-sorted using 2 queues}) \\\\quad \\\\implies V = C_{n-1} \\\\oplus C_n'
    );
    assert.ok(huffman.includes('T_Huffman = O(n log n)'));
    assert.ok(huffman.includes('(or O(n) if frequencies pre-sorted using 2 queues)'));
    assert.ok(huffman.includes('=> V = C_(n-1) XOR C_n'));
    assert.ok(!huffman.includes('\\text'), `Raw \\text leaked: ${huffman}`);
    assert.ok(!huffman.includes('\\;'), `Raw \\; leaked: ${huffman}`);
    assert.ok(!huffman.includes('\\quad'), `Raw \\quad leaked: ${huffman}`);
  });

  it('sanitizes filenames cleanly with GATE27 prefix and ISO date', () => {
    const fn = sanitizePdfFilename('PYQ Sprint: OS / DBMS #1!', '2026-11-25T09:00:00Z');
    assert.equal(fn, 'GATE27_PYQ_Sprint_OS_DBMS_1_2026-11-25.pdf');
  });

  it('formats MCQ, MSQ, and NAT official answer summaries accurately', () => {
    const q = makeSampleQuestion();
    assert.equal(getOfficialAnswerSummary(q), 'B');
    assert.equal(
      getOfficialAnswerSummary({ ...q, format: 'MSQ', correctOptions: ['A', 'C'] }),
      'A, C'
    );
    assert.equal(
      getOfficialAnswerSummary({ ...q, format: 'NAT', natAnswer: 42.5, natTolerance: 0.1 }),
      '42.5 (+/-0.1)'
    );
  });

  it('generates valid %PDF- binary output for all 4 export kinds', () => {
    const state = makeMinimalState();
    const q = makeSampleQuestion();
    const generatedAt = '2026-11-25T10:00:00.000Z';

    const jobs = [
      {
        request: { kind: 'single-question' as const, question: q },
        layout: 'solutions' as const,
        includeExplanation: true,
        includeSketch: true,
        includeSourceLink: true,
        generatedAt,
      },
      {
        request: { kind: 'test-pack' as const, title: 'Daily PYQ Sprint', questions: [q] },
        layout: 'worksheet' as const,
        includeExplanation: true,
        includeSketch: true,
        includeSourceLink: true,
        generatedAt,
      },
      {
        request: { kind: 'study-report' as const, title: '70-Day Study Report' },
        layout: 'solutions' as const,
        includeExplanation: true,
        includeSketch: true,
        includeSourceLink: true,
        generatedAt,
      },
      {
        request: { kind: 'mock-report' as const, title: 'Mock Analytics Report' },
        layout: 'solutions' as const,
        includeExplanation: true,
        includeSketch: true,
        includeSourceLink: true,
        generatedAt,
      },
    ];

    for (const job of jobs) {
      const { doc, filename, pageCount } = buildPdfDocument(job, state);
      assert.ok(filename.endsWith('.pdf'), `Expected .pdf filename, got ${filename}`);
      assert.ok(pageCount >= 1, `Expected >=1 pages for ${job.request.kind}`);
      const pdfBytes = new Uint8Array(doc.output('arraybuffer'));
      const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
      assert.equal(header, '%PDF-', `Invalid PDF header for ${job.request.kind}`);
      assert.ok(pdfBytes.byteLength > 1000, `PDF too small for ${job.request.kind}`);
    }
  });
});
