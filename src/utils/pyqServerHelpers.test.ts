import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIstDateString,
  computeQuestionFingerprint,
  validatePublicGateUrl,
  extractJsonFromModelText,
  isQuotaExceededError,
  sanitizeFetchedQuestions,
  sanitizeFetchedTip,
} from './pyqServerHelpers';

test('getIstDateString converts UTC timestamps accurately to Asia/Kolkata calendar date', () => {
  // 2026-11-24T19:00:00Z is 2026-11-25 00:30:00 IST
  const lateUtc = new Date('2026-11-24T19:00:00Z');
  assert.equal(getIstDateString(lateUtc), '2026-11-25');

  // 2026-11-24T18:00:00Z is 2026-11-24 23:30:00 IST
  const earlierUtc = new Date('2026-11-24T18:00:00Z');
  assert.equal(getIstDateString(earlierUtc), '2026-11-24');
});

test('computeQuestionFingerprint is deterministic and normalizes punctuation/casing', () => {
  const f1 = computeQuestionFingerprint('What is the time complexity of Dijkstra with Binary Heap?');
  const f2 = computeQuestionFingerprint('what is the time complexity of dijkstra with binary heap');
  const f3 = computeQuestionFingerprint('What is the chromatic number of a planar graph?');

  assert.equal(f1, f2);
  assert.notEqual(f1, f3);
  assert.match(f1, /^fp_[0-9a-f]{16}$/);
});

test('validatePublicGateUrl enforces SSRF allowlist strictly', () => {
  assert.equal(validatePublicGateUrl('https://gateoverflow.in/1234/gate-cse-2024').valid, true);
  assert.equal(validatePublicGateUrl('https://www.goclasses.in/s/store').valid, true);
  assert.equal(validatePublicGateUrl('https://gate.iitm.ac.in/syllabus').valid, true);

  // Blocked SSRF & protocol attacks
  assert.equal(validatePublicGateUrl('http://gateoverflow.in/1234').valid, false);
  assert.equal(validatePublicGateUrl('https://localhost:3000/api/health').valid, false);
  assert.equal(validatePublicGateUrl('https://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(validatePublicGateUrl('https://127.0.0.1/admin').valid, false);
  assert.equal(validatePublicGateUrl('https://user:pass@gateoverflow.in/1234').valid, false);
  assert.equal(validatePublicGateUrl('https://evil.example.com/gateoverflow.in').valid, false);
  assert.equal(validatePublicGateUrl('file:///etc/passwd').valid, false);
});

test('extractJsonFromModelText extracts JSON from fenced and noisy LLM output', () => {
  const fenced = 'Here are the extracted PYQs:\n```json\n{"questions":[{"id":"1"}]}\n```\nDone!';
  assert.deepEqual(extractJsonFromModelText(fenced), { questions: [{ id: '1' }] });

  const noisy = 'Sure! [{"a": 1}, {"b": 2}] Hope this helps.';
  assert.deepEqual(extractJsonFromModelText(noisy), [{ a: 1 }, { b: 2 }]);

  assert.equal(extractJsonFromModelText('No json here'), null);
});

test('isQuotaExceededError accurately detects 429 and RESOURCE_EXHAUSTED', () => {
  assert.equal(isQuotaExceededError({ status: 429, message: 'Too Many Requests' }), true);
  assert.equal(isQuotaExceededError(new Error('429 RESOURCE_EXHAUSTED: Quota exceeded')), true);
  assert.equal(isQuotaExceededError(new Error('Network timeout')), false);
});

test('sanitizeFetchedQuestions validates formats, deduplicates, and drops malformed entries', () => {
  const existing = new Set<string>([
    computeQuestionFingerprint('Already seen question prompt for deduplication check'),
  ]);

  const raw = [
    {
      subjectId: 'os',
      subtopic: 'Page Replacement',
      format: 'NAT',
      marks: 2,
      difficulty: 'Medium',
      sourceTag: 'GATE CSE 2024',
      prompt: 'Already seen question prompt for deduplication check',
      natAnswer: 7,
      explanation: 'Belady anomaly check for FIFO page faults.',
      wrongOptionAnalysis: 'Watch frame count.',
    },
    {
      subjectId: 'os',
      subtopic: 'CPU Scheduling',
      format: 'MCQ',
      marks: 2,
      difficulty: 'Hard',
      sourceTag: 'GATE CSE 2023',
      prompt: 'Which scheduling algorithm can suffer from starvation without aging?',
      options: [
        { id: 'A', text: 'FCFS' },
        { id: 'B', text: 'Round Robin' },
        { id: 'C', text: 'Shortest Remaining Time First' },
        { id: 'D', text: 'FIFO' },
      ],
      correctOption: 'C',
      explanation: 'SRTF may continuously preempt long jobs when short jobs arrive.',
      wrongOptionAnalysis: 'FCFS and RR guarantee bounded wait times.',
    },
    {
      // Invalid MCQ missing correct option in options list -> dropped
      subjectId: 'dbms',
      format: 'MCQ',
      prompt: 'Invalid question with wrong option letter',
      options: [
        { id: 'A', text: 'One' },
        { id: 'B', text: 'Two' },
      ],
      correctOption: 'D',
      explanation: 'Should be rejected.',
    },
  ];

  const sanitized = sanitizeFetchedQuestions(raw, {
    existingFingerprints: existing,
    fallbackSourceUrl: 'https://gateoverflow.in/123',
  });

  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].subjectId, 'os');
  assert.equal(sanitized[0].correctOption, 'C');
  assert.equal(sanitized[0].sourceUrl, 'https://gateoverflow.in/123');
});

test('sanitizeFetchedTip validates Daily Trap cards cleanly', () => {
  const valid = sanitizeFetchedTip({
    subjectId: 'coa',
    title: 'Write-Back Cache Dirty Bit Penalty',
    category: 'Exam Trap',
    summary: 'Only dirty evicted lines incur write-back delay.',
    detail: 'When calculating EMAT for a write-back cache, multiply miss penalty by (1 + dirty_fraction).',
    formula: 'EMAT = H*Tc + (1-H)*(1 + d)*Tm',
  });
  assert.ok(valid);
  assert.equal(valid?.subjectId, 'coa');
  assert.equal(valid?.category, 'Exam Trap');

  assert.equal(sanitizeFetchedTip({ title: 'x', detail: 'y' }), null);
});
