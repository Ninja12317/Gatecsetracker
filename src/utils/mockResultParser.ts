import type {
  MockParseSource,
  MockSubjectId,
  MockTestEntry,
  MockTestType,
  SubjectId,
  SubtopicProgress,
} from '../types';
import { GATE_2027_SYLLABUS } from '../data/syllabus';
import { computeSubjectMastery, toLocalIsoDate } from './gateMath';

export interface ParsedMockDraft {
  name: string;
  source: string;
  subjectId: MockSubjectId;
  date: string;
  type: MockTestType;
  score: number;
  maxScore: number;
  normalizedScore: number;
  percentage: number;
  accuracy: number;
  totalQuestions?: number;
  attempted?: number;
  correct?: number;
  wrong?: number;
  unattempted: number;
  q1Attempted?: number;
  q2Attempted?: number;
  q1Correct?: number;
  q2Correct?: number;
  q1Wrong?: number;
  q2Wrong?: number;
  q1Total?: number;
  q2Total?: number;
  positiveMarks?: number;
  penaltyMarks?: number;
  q1PositiveMarks?: number;
  q2PositiveMarks?: number;
  q1PenaltyMarks?: number;
  q2PenaltyMarks?: number;
  durationMinutes?: number;
  timeTakenMinutes?: number;
  rank?: number;
  totalCandidates?: number;
  percentile?: number;
  parseSource: MockParseSource;
  notes: string;
}

export interface LocalParseResult {
  draft: ParsedMockDraft;
  confidence: 'high' | 'medium' | 'low';
  extractedFieldsCount: number;
  matchedFormat: string;
  warnings: string[];
}

export const SAMPLE_GO_CLASSES_PASTE = `Exam Summary (GO Classes CS Test Series | Discrete Mathematics | Topic Wise Test 2)
2.7%
0.67/25
1 Correct  3 Wrong  11 Skipped  0m of 45m
Qs. Attempted: 4 (1 + 3)
Correct Attempts: 1 (0 + 1)
Incorrect Attempts: 3 (1 + 2)
Correct Marks: 2 (0 + 2)
Penalty Marks: 1.33 (0 + 1.33)
Resultant Marks: 0.67 (0 + 0.67)
Total Questions: 15 (5 + 10)
Total Marks: 25 (5 + 20)
Exam Duration: 45 Minutes
Time Taken: 0 Minutes`;

const SUBJECT_PATTERNS: Array<{ id: SubjectId; regex: RegExp }> = [
  { id: 'ga', regex: /\b(general\s*aptitude|aptitude|verbal|quantitative|ga)\b/i },
  {
    id: 'em',
    regex:
      /\b(engineering\s*math\w*|discrete\s*math\w*|linear\s*algebra|probability|calculus|combinatorics|graph\s*theory|propositional|predicate|set\s*theory|em|dm)\b/i,
  },
  {
    id: 'dl',
    regex:
      /\b(digital\s*logic|boolean|k-?map|combinational|sequential|flip[\s-]?flop|number\s*system|dl)\b/i,
  },
  {
    id: 'coa',
    regex:
      /\b(computer\s*organization|architecture|coa|pipeline|pipelining|cache|memory\s*hierarchy|addressing\s*modes|alu)\b/i,
  },
  {
    id: 'cprog',
    regex:
      /\b(c\s*programming|programming\s*in\s*c|cprog|pointers?|recursion|storage\s*class(?:es)?|macros?)\b/i,
  },
  {
    id: 'ds',
    regex:
      /\b(data\s*structures?|programming\s*(?:&|and)?\s*data\s*structures?|linked\s*list|binary\s*tree|bst|avl|heap|stack|queue|pds|ds)\b/i,
  },
  {
    id: 'algo',
    regex:
      /\b(algorithms?|algo|asymptotic|dynamic\s*programming|greedy|divide\s*and\s*conquer|shortest\s*path|mst|sorting|hashing)\b/i,
  },
  {
    id: 'toc',
    regex:
      /\b(theory\s*of\s*computation|toc|automata|dfa|nfa|cfg|pda|turing|decidability|regular\s*languages?|context[\s-]?free)\b/i,
  },
  {
    id: 'cd',
    regex:
      /\b(compiler\s*design|compilers?|lexical|parsing|ll\(1\)|lr\(0\)|slr|lalr|sdt|intermediate\s*code|cd)\b/i,
  },
  {
    id: 'os',
    regex:
      /\b(operating\s*systems?|os|cpu\s*scheduling|deadlock|synchronization|semaphore|paging|virtual\s*memory|threads?|process)\b/i,
  },
  {
    id: 'dbms',
    regex:
      /\b(databases?|dbms|sql|relational\s*algebra|normalization|bcnf|transactions?|concurrency|b\+?\s*tree|er\s*model)\b/i,
  },
  {
    id: 'cn',
    regex:
      /\b(computer\s*networks?|cn|tcp|ip\s*addressing|subnetting|sliding\s*window|routing|ethernet|csma|http|dns)\b/i,
  },
];

export function detectProvider(text: string): string {
  if (/go\s*classes/i.test(text)) return 'GO Classes';
  if (/made\s*easy/i.test(text)) return 'Made Easy';
  if (/ace\s*(engineering|academy|online)?/i.test(text)) return 'ACE Academy';
  if (/gate\s*overflow/i.test(text)) return 'GateOverflow';
  if (/zeal/i.test(text)) return 'Zeal';
  if (/testbook/i.test(text)) return 'Testbook';
  if (/rbr|ravindrababu/i.test(text)) return 'RBR';
  if (/applied\s*gate/i.test(text)) return 'Applied GATE';
  return 'GATE Test Series';
}

export function detectMockType(
  text: string,
  maxScore?: number,
  totalQuestions?: number
): MockTestType {
  if (/\b(topic[\s-]*wise|twt|mini\s*test|chapter[\s-]*wise)\b/i.test(text)) {
    return 'Topic-Wise Test';
  }
  if (
    /\b(full[\s-]*length|flt|aimt|all\s*india\s*mock|full\s*mock|grand\s*test|mock\s*test\s*\d+|full\s*syllabus)\b/i.test(
      text
    )
  ) {
    return 'Full-Length Mock';
  }
  if (/\b(subject[\s-]*wise|subject\s*test|swt|multi[\s-]*subject)\b/i.test(text)) {
    return 'Subject Test';
  }
  if ((maxScore !== undefined && maxScore >= 85) || (totalQuestions !== undefined && totalQuestions >= 55)) {
    return 'Full-Length Mock';
  }
  if (maxScore !== undefined && maxScore <= 30) {
    return 'Topic-Wise Test';
  }
  return 'Subject Test';
}

export function detectSubjectId(text: string, testType: MockTestType): MockSubjectId {
  if (testType === 'Full-Length Mock') return 'all';
  for (const item of SUBJECT_PATTERNS) {
    if (item.regex.test(text)) {
      return item.id;
    }
  }
  return 'all';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Extracts a numeric metric along with optional parenthesized "(1M + 2M)" split,
 * e.g. "Qs. Attempted: 4 (1 + 3)" or "Penalty Marks\t1.33 (0 + 1.33)"
 */
function extractMetricWithSplit(
  text: string,
  labelPattern: string
): { total: number; q1?: number; q2?: number } | null {
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:${labelPattern})\\s*[:\\-\\t ]+\\s*(-?\\d+(?:\\.\\d+)?)(?:\\s*\\(\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\+\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\))?`,
    'i'
  );
  const m = text.match(re);
  if (!m) return null;
  const total = Number(m[1]);
  if (!Number.isFinite(total)) return null;
  const q1 = m[2] !== undefined ? Number(m[2]) : undefined;
  const q2 = m[3] !== undefined ? Number(m[3]) : undefined;
  return {
    total,
    q1: q1 !== undefined && Number.isFinite(q1) ? q1 : undefined,
    q2: q2 !== undefined && Number.isFinite(q2) ? q2 : undefined,
  };
}

function parseMinutesValue(raw: string): number | undefined {
  // Match "2h 15m" or "1 hr 30 min"
  const hm = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?/i);
  if (hm) {
    return round2(Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0));
  }
  // Match "HH:MM:SS"
  const hms = raw.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hms) {
    return round2(Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3]) / 60);
  }
  // Match plain minutes "45 Minutes", "42m", "0 mins"
  const mOnly = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (mOnly) {
    return round2(Number(mOnly[1]));
  }
  // Bare number on a minutes-labeled line
  const bare = raw.match(/(-?\d+(?:\.\d+)?)/);
  if (bare) {
    const val = Number(bare[1]);
    return Number.isFinite(val) && val >= 0 ? round2(val) : undefined;
  }
  return undefined;
}

/**
 * Layer 1 — Instant Local Deterministic Parser (0ms, ₹0 API cost).
 * Tuned for GO Classes Exam Summary and universal Made Easy / ACE / GateOverflow pastes.
 */
export function parseMockResultLocally(rawInput: string): LocalParseResult {
  const normalized = rawInput
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();

  const warnings: string[] = [];
  let extractedFieldsCount = 0;

  // 1. Header / Title extraction
  let name = '';
  let source = detectProvider(normalized);
  let headerContext = '';

  const examSummaryHeader = normalized.match(/Exam\s*Summary\s*\(([^)]+)\)/i);
  if (examSummaryHeader) {
    headerContext = examSummaryHeader[1].trim();
    extractedFieldsCount += 2;
    const segments = headerContext
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length >= 2) {
      const detectedFromFirst = detectProvider(segments[0]);
      if (detectedFromFirst !== 'GATE Test Series') {
        source = detectedFromFirst;
        name = segments.slice(1).join(' · ');
      } else {
        name = segments.join(' · ');
      }
    } else if (segments.length === 1) {
      name = segments[0];
    }
  } else {
    // Check explicit "Test Name:" or "Exam:" line, or use first descriptive non-numeric line
    const labeledName = normalized.match(/(?:^|\n)\s*(?:Test\s*Name|Exam\s*Name|Paper|Title)\s*[:\-]\s*(.+)/i);
    if (labeledName) {
      name = labeledName[1].trim();
      headerContext = name;
      extractedFieldsCount += 1;
    } else {
      const lines = normalized
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const candidateLine = lines.find(
        (l) =>
          l.length >= 5 &&
          !/^\d+(\.\d+)?\s*%?$/.test(l) &&
          !/^-?\d+(\.\d+)?\s*\/\s*\d+/.test(l) &&
          !/^(qs\.?|correct|incorrect|wrong|skipped|penalty|resultant|total|exam\s*duration|time\s*taken|accuracy|score|marks)/i.test(
            l
          )
      );
      if (candidateLine) {
        name = candidateLine.replace(/^[-•*]\s*/, '').slice(0, 140);
        headerContext = candidateLine;
        extractedFieldsCount += 1;
      }
    }
  }

  // 2. Score / MaxScore fraction (e.g. "0.67/25" or "Score: 62.33 / 100" or "54.67 out of 100")
  let score: number | undefined;
  let maxScore: number | undefined;

  const fractionLine =
    normalized.match(/(?:^|\n)\s*(?:Score|Marks(?:\s*Obtained)?|Resultant\s*Marks|Total\s*Score)?\s*[:\-]?\s*(-?\d+(?:\.\d+)?)\s*(?:\/|out\s*of)\s*(\d+(?:\.\d+)?)\b/i) ??
    normalized.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?!\s*(?:candidates|students|users|attempt))/i);

  if (fractionLine) {
    const sVal = Number(fractionLine[1]);
    const mVal = Number(fractionLine[2]);
    if (Number.isFinite(sVal) && Number.isFinite(mVal) && mVal >= 1 && mVal <= 300) {
      score = round2(sVal);
      maxScore = round2(mVal);
      extractedFieldsCount += 2;
    }
  }

  // 3. GO Classes & structured key-value metrics with optional "(1M + 2M)" split
  const qsAttempted = extractMetricWithSplit(normalized, 'Qs\\.?\\s*Attempted|Questions?\\s*Attempted|Attempted');
  const correctAttempts = extractMetricWithSplit(
    normalized,
    'Correct\\s*(?:Attempts?|Answers?|Qs\\.?)|Correct(?!\\s*Marks)'
  );
  const incorrectAttempts = extractMetricWithSplit(
    normalized,
    '(?:Incorrect|Wrong)\\s*(?:Attempts?|Answers?|Qs\\.?)|Incorrect|Wrong'
  );
  const correctMarks = extractMetricWithSplit(normalized, 'Correct\\s*Marks|Positive\\s*Marks|Marks\\s*Awarded');
  const penaltyMarksMetric = extractMetricWithSplit(normalized, 'Penalty\\s*Marks|Negative\\s*Marks|Marks\\s*Deducted|Penalty');
  const resultantMarks = extractMetricWithSplit(normalized, 'Resultant\\s*Marks|Net\\s*Marks|Net\\s*Score|Marks\\s*Obtained|Final\\s*Score|Your\\s*Score|Score');
  const totalQuestionsMetric = extractMetricWithSplit(normalized, 'Total\\s*Questions|Total\\s*Qs\\.?');
  const totalMarksMetric = extractMetricWithSplit(normalized, 'Total\\s*Marks|Max(?:imum)?\\s*Marks|Max\\s*Score');
  const skippedMetric = extractMetricWithSplit(normalized, 'Skipped|Unattempted|Not\\s*Attempted|Left');

  if (resultantMarks) {
    score = round2(resultantMarks.total);
    extractedFieldsCount += 1;
  }
  if (totalMarksMetric && totalMarksMetric.total >= 1 && totalMarksMetric.total <= 300) {
    maxScore = round2(totalMarksMetric.total);
    extractedFieldsCount += 1;
  }

  // 4. Inline summary row: "1 Correct  3 Wrong  11 Skipped  0m of 45m"
  let correct = correctAttempts?.total;
  let wrong = incorrectAttempts?.total;
  let unattempted = skippedMetric?.total;
  let timeTakenMinutes: number | undefined;
  let durationMinutes: number | undefined;

  const inlineCorrect = normalized.match(/\b(\d+)[ \t]+Correct\b/i);
  if (correct === undefined && inlineCorrect) {
    correct = Number(inlineCorrect[1]);
    extractedFieldsCount += 1;
  } else if (correctAttempts) {
    extractedFieldsCount += 1;
  }

  const inlineWrong = normalized.match(/\b(\d+)[ \t]+(?:Wrong|Incorrect)\b/i);
  if (wrong === undefined && inlineWrong) {
    wrong = Number(inlineWrong[1]);
    extractedFieldsCount += 1;
  } else if (incorrectAttempts) {
    extractedFieldsCount += 1;
  }

  const inlineSkipped = normalized.match(/\b(\d+)[ \t]+(?:Skipped|Unattempted|Left)\b/i);
  if (unattempted === undefined && inlineSkipped) {
    unattempted = Number(inlineSkipped[1]);
    extractedFieldsCount += 1;
  } else if (skippedMetric) {
    extractedFieldsCount += 1;
  }

  // Inline time "0m of 45m" or "142m of 180m"
  const inlineTime = normalized.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\s*(?:of|\/)\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/i);
  if (inlineTime) {
    timeTakenMinutes = round2(Number(inlineTime[1]));
    durationMinutes = round2(Number(inlineTime[2]));
    extractedFieldsCount += 2;
  }

  // Labeled Exam Duration / Time Taken lines
  const durationLine = normalized.match(/(?:^|\n)\s*(?:Exam\s*Duration|Total\s*Duration|Duration|Total\s*Time)\s*[:\-\t ]+(.+)/i);
  if (durationLine) {
    const parsedDur = parseMinutesValue(durationLine[1]);
    if (parsedDur !== undefined) {
      durationMinutes = parsedDur;
      extractedFieldsCount += 1;
    }
  }
  const timeTakenLine = normalized.match(/(?:^|\n)\s*(?:Time\s*Taken|Time\s*Spent|Duration\s*Taken)\s*[:\-\t ]+(.+)/i);
  if (timeTakenLine) {
    const parsedTaken = parseMinutesValue(timeTakenLine[1]);
    if (parsedTaken !== undefined) {
      timeTakenMinutes = parsedTaken;
      extractedFieldsCount += 1;
    }
  }

  // 5. Explicit Accuracy, Percentage, Rank, Percentile
  let explicitAccuracy: number | undefined;
  const accMatch = normalized.match(/(?:Accuracy)\s*[:\-\t ]+(\d+(?:\.\d+)?)\s*%?/i);
  if (accMatch) {
    explicitAccuracy = round2(Number(accMatch[1]));
    extractedFieldsCount += 1;
  }

  let explicitPercentage: number | undefined;
  const pctLabeled = normalized.match(/(?:Percentage|Score\s*%)\s*[:\-\t ]+(-?\d+(?:\.\d+)?)\s*%/i);
  const pctStandalone = normalized.match(/(?:^|\n)\s*(-?\d+(?:\.\d+)?)\s*%\s*(?:\n|$)/);
  if (pctLabeled) {
    explicitPercentage = round2(Number(pctLabeled[1]));
    extractedFieldsCount += 1;
  } else if (pctStandalone) {
    explicitPercentage = round2(Number(pctStandalone[1]));
    extractedFieldsCount += 1;
  }

  let rank: number | undefined;
  let totalCandidates: number | undefined;
  const rankMatch = normalized.match(/(?:AIR|All\s*India\s*Rank|Your\s*Rank|Rank)\s*[:\-#\t ]+(\d+)(?:\s*(?:\/|out\s*of)\s*(\d+))?/i);
  if (rankMatch) {
    rank = Number(rankMatch[1]);
    if (rankMatch[2]) totalCandidates = Number(rankMatch[2]);
    extractedFieldsCount += 1;
  }

  let percentile: number | undefined;
  const pctileMatch = normalized.match(/(?:Percentile)\s*[:\-\t ]+(\d+(?:\.\d+)?)\s*%?/i);
  if (pctileMatch) {
    percentile = round2(Number(pctileMatch[1]));
    extractedFieldsCount += 1;
  }

  // 6. Reconcile derived metrics cleanly
  let attempted = qsAttempted?.total;
  if (attempted === undefined && correct !== undefined && wrong !== undefined) {
    attempted = correct + wrong;
  }
  if (qsAttempted) extractedFieldsCount += 1;

  let totalQuestions = totalQuestionsMetric?.total;
  if (totalQuestionsMetric) extractedFieldsCount += 1;
  if (totalQuestions === undefined && attempted !== undefined && unattempted !== undefined) {
    totalQuestions = attempted + unattempted;
  }
  if (unattempted === undefined && totalQuestions !== undefined && attempted !== undefined) {
    unattempted = Math.max(0, totalQuestions - attempted);
  }

  const positiveMarks = correctMarks ? Math.abs(round2(correctMarks.total)) : undefined;
  const penaltyMarks = penaltyMarksMetric ? Math.abs(round2(penaltyMarksMetric.total)) : undefined;
  if (correctMarks) extractedFieldsCount += 1;
  if (penaltyMarksMetric) extractedFieldsCount += 1;

  if (score === undefined && positiveMarks !== undefined) {
    score = round2(positiveMarks - (penaltyMarks ?? 0));
  }

  const finalMaxScore = maxScore ?? (totalQuestions && totalQuestions >= 55 ? 100 : 100);
  const finalScore = score ?? 0;
  const normalizedScore =
    finalMaxScore > 0 ? round2((finalScore / finalMaxScore) * 100) : 0;
  const percentage = explicitPercentage ?? normalizedScore;

  // Compute accuracy: prefer Correct / Attempted when both exist (more accurate than percentage!)
  let accuracy: number;
  if (explicitAccuracy !== undefined) {
    accuracy = Math.max(0, Math.min(100, Math.round(explicitAccuracy)));
  } else if (correct !== undefined && attempted !== undefined && attempted > 0) {
    accuracy = Math.max(0, Math.min(100, Math.round((correct / attempted) * 100)));
  } else if (correct !== undefined && wrong !== undefined && correct + wrong > 0) {
    accuracy = Math.max(0, Math.min(100, Math.round((correct / (correct + wrong)) * 100)));
  } else {
    accuracy = Math.max(0, Math.min(100, Math.round(Math.max(0, normalizedScore))));
  }

  // Infer test type & subject from header + full text
  const classificationText = `${headerContext} ${name} ${normalized.slice(0, 300)}`;
  const type = detectMockType(classificationText, maxScore, totalQuestions);
  const subjectId = detectSubjectId(classificationText, type);

  if (!name) {
    name = `${source} · ${type}`;
    warnings.push('Could not find an explicit test title — defaulted name; feel free to edit.');
  }

  if (score === undefined) {
    warnings.push('Score was not clearly detected — verify Resultant Marks before saving.');
  }

  // Determine confidence level
  const isGoClassesFormat = Boolean(examSummaryHeader || (qsAttempted && penaltyMarksMetric));
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (score !== undefined && maxScore !== undefined && (correct !== undefined || attempted !== undefined)) {
    confidence = isGoClassesFormat || extractedFieldsCount >= 5 ? 'high' : 'medium';
  } else if (score !== undefined && extractedFieldsCount >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const matchedFormat = isGoClassesFormat
    ? 'GO Classes Exam Summary'
    : source !== 'GATE Test Series'
    ? `${source} Summary`
    : 'Universal GATE Summary';

  return {
    draft: {
      name: name.slice(0, 160),
      source: source.slice(0, 120),
      subjectId,
      date: toLocalIsoDate(),
      type,
      score: finalScore,
      maxScore: finalMaxScore,
      normalizedScore,
      percentage,
      accuracy,
      totalQuestions,
      attempted,
      correct,
      wrong,
      unattempted: unattempted ?? 0,
      q1Attempted: qsAttempted?.q1,
      q2Attempted: qsAttempted?.q2,
      q1Correct: correctAttempts?.q1,
      q2Correct: correctAttempts?.q2,
      q1Wrong: incorrectAttempts?.q1,
      q2Wrong: incorrectAttempts?.q2,
      q1Total: totalQuestionsMetric?.q1,
      q2Total: totalQuestionsMetric?.q2,
      positiveMarks,
      penaltyMarks,
      q1PositiveMarks: correctMarks?.q1 !== undefined ? Math.abs(round2(correctMarks.q1)) : undefined,
      q2PositiveMarks: correctMarks?.q2 !== undefined ? Math.abs(round2(correctMarks.q2)) : undefined,
      q1PenaltyMarks:
        penaltyMarksMetric?.q1 !== undefined ? Math.abs(round2(penaltyMarksMetric.q1)) : undefined,
      q2PenaltyMarks:
        penaltyMarksMetric?.q2 !== undefined ? Math.abs(round2(penaltyMarksMetric.q2)) : undefined,
      durationMinutes,
      timeTakenMinutes,
      rank,
      totalCandidates,
      percentile,
      parseSource: 'local_deterministic',
      notes: '',
    },
    confidence,
    extractedFieldsCount,
    matchedFormat,
    warnings,
  };
}

// ===================== PURE DIAGNOSTICS ENGINE =====================

export interface MockDiagnosticsSummary {
  totalTests: number;
  fullLengthCount: number;
  subjectTestCount: number;
  topicTestCount: number;
  avgNormalizedPct: number;
  peakNormalizedPct: number;
  meanAccuracy: number;
  totalPenaltyBleed: number;
  avgPenaltyPerTest: number;
  avgMinutesPerQuestion: number | null;
  q1Stats: {
    attempted: number;
    correct: number;
    wrong: number;
    accuracy: number;
    penaltyMarks: number;
  };
  q2Stats: {
    attempted: number;
    correct: number;
    wrong: number;
    accuracy: number;
    penaltyMarks: number;
  };
  progressionSeries: Array<{
    label: string;
    fullName: string;
    date: string;
    type: MockTestType;
    rawScoreText: string;
    normalizedPct: number;
    accuracy: number;
    positiveMarks: number;
    penaltyMarks: number;
    netScore: number;
    correct: number;
    wrong: number;
    unattempted: number;
  }>;
  subjectMatrix: Array<{
    id: SubjectId;
    code: string;
    name: string;
    weightage: number;
    mastery: number;
    mockAvgPct: number | null;
    mockCount: number;
    unrealizedMarks: number;
  }>;
  insights: Array<{
    tone: 'alert' | 'gold' | 'good';
    title: string;
    detail: string;
  }>;
}

export function getNormalizedMockPct(m: MockTestEntry): number {
  if (typeof m.normalizedScore === 'number' && Number.isFinite(m.normalizedScore)) {
    return round2(m.normalizedScore);
  }
  if (m.maxScore > 0) {
    return round2((m.score / m.maxScore) * 100);
  }
  return round2(m.score);
}

export function computeMockDiagnostics(
  mocks: MockTestEntry[],
  progress: Record<string, SubtopicProgress>
): MockDiagnosticsSummary {
  const totalTests = mocks.length;
  let fullLengthCount = 0;
  let subjectTestCount = 0;
  let topicTestCount = 0;
  let sumNormalized = 0;
  let peakNormalizedPct = 0;
  let sumAccuracy = 0;
  let totalPenaltyBleed = 0;
  let timedMinutesSum = 0;
  let timedAttemptedSum = 0;

  const q1Stats = { attempted: 0, correct: 0, wrong: 0, accuracy: 0, penaltyMarks: 0 };
  const q2Stats = { attempted: 0, correct: 0, wrong: 0, accuracy: 0, penaltyMarks: 0 };

  const subjectScoresMap: Record<string, number[]> = {};

  const progressionSeries = mocks.map((m, idx) => {
    if (m.type === 'Full-Length Mock') fullLengthCount++;
    else if (m.type === 'Topic-Wise Test') topicTestCount++;
    else subjectTestCount++;

    const norm = getNormalizedMockPct(m);
    sumNormalized += norm;
    if (idx === 0 || norm > peakNormalizedPct) {
      peakNormalizedPct = norm;
    }
    sumAccuracy += m.accuracy;

    const penalty = Math.max(0, Number(m.penaltyMarks ?? 0));
    totalPenaltyBleed += penalty;

    const positive =
      typeof m.positiveMarks === 'number' && Number.isFinite(m.positiveMarks)
        ? m.positiveMarks
        : round2(Math.max(0, m.score + penalty));

    if (
      typeof m.timeTakenMinutes === 'number' &&
      m.timeTakenMinutes > 0 &&
      typeof m.attempted === 'number' &&
      m.attempted > 0
    ) {
      timedMinutesSum += m.timeTakenMinutes;
      timedAttemptedSum += m.attempted;
    }

    if (typeof m.q1Attempted === 'number') q1Stats.attempted += m.q1Attempted;
    if (typeof m.q1Correct === 'number') q1Stats.correct += m.q1Correct;
    if (typeof m.q1Wrong === 'number') q1Stats.wrong += m.q1Wrong;
    if (typeof m.q1PenaltyMarks === 'number') q1Stats.penaltyMarks += m.q1PenaltyMarks;

    if (typeof m.q2Attempted === 'number') q2Stats.attempted += m.q2Attempted;
    if (typeof m.q2Correct === 'number') q2Stats.correct += m.q2Correct;
    if (typeof m.q2Wrong === 'number') q2Stats.wrong += m.q2Wrong;
    if (typeof m.q2PenaltyMarks === 'number') q2Stats.penaltyMarks += m.q2PenaltyMarks;

    if (m.subjectId && m.subjectId !== 'all') {
      if (!subjectScoresMap[m.subjectId]) subjectScoresMap[m.subjectId] = [];
      subjectScoresMap[m.subjectId].push(norm);
    }

    return {
      label: `T${idx + 1} (${m.date.slice(5)})`,
      fullName: m.name,
      date: m.date,
      type: m.type,
      rawScoreText: `${m.score.toFixed(2)}/${m.maxScore}`,
      normalizedPct: norm,
      accuracy: m.accuracy,
      positiveMarks: round2(positive),
      penaltyMarks: round2(penalty),
      netScore: round2(m.score),
      correct: m.correct ?? 0,
      wrong: m.wrong ?? 0,
      unattempted: m.unattempted ?? 0,
    };
  });

  q1Stats.accuracy =
    q1Stats.attempted > 0 ? Math.round((q1Stats.correct / q1Stats.attempted) * 100) : 0;
  q2Stats.accuracy =
    q2Stats.attempted > 0 ? Math.round((q2Stats.correct / q2Stats.attempted) * 100) : 0;
  q1Stats.penaltyMarks = round2(q1Stats.penaltyMarks);
  q2Stats.penaltyMarks = round2(q2Stats.penaltyMarks);

  const subjectMatrix = GATE_2027_SYLLABUS.map((subj) => {
    const mastery = computeSubjectMastery(subj, progress);
    const subjScores = subjectScoresMap[subj.id] ?? [];
    const mockAvgPct =
      subjScores.length > 0
        ? round2(subjScores.reduce((a, b) => a + b, 0) / subjScores.length)
        : null;
    const unrealizedMarks = Number(((subj.weightage * (100 - mastery)) / 100).toFixed(1));
    return {
      id: subj.id,
      code: subj.code,
      name: subj.name,
      weightage: subj.weightage,
      mastery,
      mockAvgPct,
      mockCount: subjScores.length,
      unrealizedMarks,
    };
  });

  const avgNormalizedPct = totalTests > 0 ? round2(sumNormalized / totalTests) : 0;
  const meanAccuracy = totalTests > 0 ? Math.round(sumAccuracy / totalTests) : 0;
  const avgPenaltyPerTest = totalTests > 0 ? round2(totalPenaltyBleed / totalTests) : 0;
  const avgMinutesPerQuestion =
    timedAttemptedSum > 0 ? round2(timedMinutesSum / timedAttemptedSum) : null;

  // Build actionable diagnostic insights
  const insights: MockDiagnosticsSummary['insights'] = [];
  if (totalTests > 0) {
    if (totalPenaltyBleed >= 1) {
      const bleedShare =
        progressionSeries.reduce((a, p) => a + p.positiveMarks, 0) > 0
          ? Math.round(
              (totalPenaltyBleed / progressionSeries.reduce((a, p) => a + p.positiveMarks, 0)) * 100
            )
          : 0;
      insights.push({
        tone: bleedShare >= 25 ? 'alert' : 'gold',
        title: `Negative Marking Bleed: −${round2(totalPenaltyBleed).toFixed(2)} Marks`,
        detail:
          bleedShare >= 25
            ? `You surrendered ${bleedShare}% of your earned positive marks to MCQ penalties (avg −${avgPenaltyPerTest.toFixed(2)}M/test). Tighten elimination before marking uncertain MCQs.`
            : `Average penalty is −${avgPenaltyPerTest.toFixed(2)}M per test (${bleedShare}% of gross marks). Target <10% penalty ratio in full-length mocks.`,
      });
    }

    if (q1Stats.attempted > 0 && q2Stats.attempted > 0) {
      const gap = q2Stats.accuracy - q1Stats.accuracy;
      insights.push({
        tone: q2Stats.accuracy < 60 ? 'alert' : 'good',
        title: `1M vs 2M Split: ${q1Stats.accuracy}% (1M) · ${q2Stats.accuracy}% (2M)`,
        detail:
          gap < -10
            ? `2-mark questions carry −0.67 penalty and currently trail 1-mark accuracy by ${Math.abs(gap)}%. Spend extra verification steps on 2M problems.`
            : `1-mark attempts: ${q1Stats.correct}/${q1Stats.attempted} (−${q1Stats.penaltyMarks}M) · 2-mark attempts: ${q2Stats.correct}/${q2Stats.attempted} (−${q2Stats.penaltyMarks}M).`,
      });
    }

    if (meanAccuracy < 70) {
      insights.push({
        tone: 'gold',
        title: `Accuracy Diagnostic: ${meanAccuracy}% Mean`,
        detail:
          'Skipping ambiguous 1-mark and 2-mark MCQs beats guessing in GATE. Aim for ≥80% accuracy before increasing attempt volume.',
      });
    } else {
      insights.push({
        tone: 'good',
        title: `Strong Accuracy Discipline: ${meanAccuracy}% Mean`,
        detail:
          'Accuracy is in the AIR < 500 zone. Push controlled attempt volume on high-weightage 2-mark MSQ & NAT questions (zero negative marks).',
      });
    }
  }

  return {
    totalTests,
    fullLengthCount,
    subjectTestCount,
    topicTestCount,
    avgNormalizedPct,
    peakNormalizedPct: totalTests > 0 ? round2(peakNormalizedPct) : 0,
    meanAccuracy,
    totalPenaltyBleed: round2(totalPenaltyBleed),
    avgPenaltyPerTest,
    avgMinutesPerQuestion,
    q1Stats,
    q2Stats,
    progressionSeries,
    subjectMatrix,
    insights,
  };
}
