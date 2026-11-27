import type {
  Question,
  QuestionGradeStatus,
  TestHistoryEntry,
} from '../types';
import { evaluateQuestionResponse } from './gateMath';

export interface UserResponseLike {
  selectedOption?: string;
  selectedOptions?: string[];
  natValue?: string;
}

export interface StrictQuestionEvaluation {
  questionId: string;
  status: QuestionGradeStatus;
  attempted: boolean;
  hasKey: boolean;
  isCorrect: boolean;
  marksAwarded: number;
  penaltyMarks: number;
  maxMarks: number;
  serializedAnswer: string;
}

export interface StrictSessionGradeSummary {
  gradedMarks: number;
  gradedMaxMarks: number;
  totalMaxMarks: number;
  gradedCount: number;
  gradedAttemptedCount: number;
  pendingKeyCount: number;
  pendingAttemptedCount: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  penaltyMarks: number;
  accuracyPct: number;
  perQuestion: Record<string, StrictQuestionEvaluation>;
}

/**
 * Checks whether a question actually has a usable, verified official answer key.
 * Questions without a verified key MUST NEVER be scored as 0 or receive negative marks.
 */
export function hasVerifiedAnswerKey(q: Question): boolean {
  if (q.hasAnswerKey === false) return false;
  if (q.format === 'MCQ') {
    return typeof q.correctOption === 'string' && q.correctOption.trim().length > 0;
  }
  if (q.format === 'MSQ') {
    return Array.isArray(q.correctOptions) && q.correctOptions.length > 0;
  }
  // NAT
  const hasRange =
    typeof q.natRangeMin === 'number' &&
    typeof q.natRangeMax === 'number' &&
    Number.isFinite(q.natRangeMin) &&
    Number.isFinite(q.natRangeMax);
  const hasScalar = typeof q.natAnswer === 'number' && Number.isFinite(q.natAnswer);
  return hasRange || hasScalar;
}

export function serializeUserResponse(
  format: Question['format'],
  response: UserResponseLike | undefined
): string {
  if (!response) return '';
  if (format === 'MCQ') return (response.selectedOption ?? '').trim().toUpperCase();
  if (format === 'MSQ') {
    return Array.from(new Set((response.selectedOptions ?? []).map((x) => x.trim().toUpperCase())))
      .filter(Boolean)
      .sort()
      .join(',');
  }
  return (response.natValue ?? '').trim();
}

export function parseSerializedResponse(
  format: Question['format'],
  serialized: string | undefined
): UserResponseLike {
  const clean = (serialized ?? '').trim();
  if (!clean) return {};
  if (format === 'MCQ') return { selectedOption: clean.toUpperCase() };
  if (format === 'MSQ') {
    return {
      selectedOptions: clean
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    };
  }
  return { natValue: clean };
}

/**
 * Evaluates a single question strictly enforcing the "No-Key, No-Marks" rule:
 * - Unattempted -> status: 'unattempted', marksAwarded: 0
 * - Attempted (or unattempted) without a verified key -> status: 'pending_key', marksAwarded: 0, penaltyMarks: 0
 * - Attempted with verified key -> exact GATE CSE marking (+1/-0.33, +2/-0.66, MSQ +2/0, NAT +1/+2)
 */
export function evaluateQuestionStrict(
  q: Question,
  response: UserResponseLike | undefined,
  selfCheckOverride?: 'correct' | 'wrong'
): StrictQuestionEvaluation {
  const serializedAnswer = serializeUserResponse(q.format, response);
  const attempted = serializedAnswer.length > 0;
  const keyed = hasVerifiedAnswerKey(q);

  if (!keyed) {
    // Allow explicit self-check override if the user marked Right/Wrong without a key yet
    if (attempted && selfCheckOverride) {
      const isCorrect = selfCheckOverride === 'correct';
      const marksAwarded = isCorrect
        ? q.marks
        : q.format === 'MCQ'
        ? Number((q.marks === 1 ? -1 / 3 : -2 / 3).toFixed(2))
        : 0;
      return {
        questionId: q.id,
        status: isCorrect ? 'correct' : 'wrong',
        attempted: true,
        hasKey: true,
        isCorrect,
        marksAwarded,
        penaltyMarks: marksAwarded < 0 ? Math.abs(marksAwarded) : 0,
        maxMarks: q.marks,
        serializedAnswer,
      };
    }

    return {
      questionId: q.id,
      status: attempted ? 'pending_key' : 'unattempted',
      attempted,
      hasKey: false,
      isCorrect: false,
      marksAwarded: 0,
      penaltyMarks: 0,
      maxMarks: q.marks,
      serializedAnswer,
    };
  }

  if (!attempted) {
    return {
      questionId: q.id,
      status: 'unattempted',
      attempted: false,
      hasKey: true,
      isCorrect: false,
      marksAwarded: 0,
      penaltyMarks: 0,
      maxMarks: q.marks,
      serializedAnswer: '',
    };
  }

  const evalRes = evaluateQuestionResponse(q, response ?? {});
  const penaltyMarks = evalRes.marksAwarded < 0 ? Number(Math.abs(evalRes.marksAwarded).toFixed(2)) : 0;

  return {
    questionId: q.id,
    status: evalRes.isCorrect ? 'correct' : 'wrong',
    attempted: true,
    hasKey: true,
    isCorrect: evalRes.isCorrect,
    marksAwarded: evalRes.marksAwarded,
    penaltyMarks,
    maxMarks: q.marks,
    serializedAnswer,
  };
}

/**
 * Grades a full test session by partitioning questions into Graded vs Pending Answer Key.
 * Pending-key questions are EXCLUDED from gradedMaxMarks, gradedMarks, penaltyMarks, and accuracyPct.
 */
export function gradeTestSessionStrict(
  questions: Question[],
  responsesById: Record<string, UserResponseLike | undefined>,
  selfCheckOverrides?: Record<string, 'correct' | 'wrong'>
): StrictSessionGradeSummary {
  const perQuestion: Record<string, StrictQuestionEvaluation> = {};
  let gradedMarks = 0;
  let gradedMaxMarks = 0;
  let totalMaxMarks = 0;
  let gradedCount = 0;
  let gradedAttemptedCount = 0;
  let pendingKeyCount = 0;
  let pendingAttemptedCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;
  let penaltyMarks = 0;

  for (const q of questions) {
    totalMaxMarks += q.marks;
    const ev = evaluateQuestionStrict(q, responsesById[q.id], selfCheckOverrides?.[q.id]);
    perQuestion[q.id] = ev;

    if (!ev.hasKey) {
      pendingKeyCount += 1;
      if (ev.attempted) pendingAttemptedCount += 1;
      else unattemptedCount += 1;
      continue;
    }

    gradedCount += 1;
    gradedMaxMarks += q.marks;

    if (!ev.attempted) {
      unattemptedCount += 1;
      continue;
    }

    gradedAttemptedCount += 1;
    gradedMarks += ev.marksAwarded;
    penaltyMarks += ev.penaltyMarks;
    if (ev.isCorrect) correctCount += 1;
    else wrongCount += 1;
  }

  const roundedGradedMarks = Number(gradedMarks.toFixed(2));
  const roundedPenalty = Number(penaltyMarks.toFixed(2));
  const accuracyPct =
    gradedAttemptedCount > 0 ? Math.round((correctCount / gradedAttemptedCount) * 100) : 0;

  return {
    gradedMarks: roundedGradedMarks,
    gradedMaxMarks,
    totalMaxMarks,
    gradedCount,
    gradedAttemptedCount,
    pendingKeyCount,
    pendingAttemptedCount,
    correctCount,
    wrongCount,
    unattemptedCount,
    penaltyMarks: roundedPenalty,
    accuracyPct,
    perQuestion,
  };
}

/**
 * Formats graded score cleanly, e.g.:
 * - "14.33 / 18 Graded · (3 Pending Key)"
 * - "16 / 20 Graded"
 * - "Pending Key (5 Qs)" when 0 questions have keys yet
 */
export function formatGradedScoreSummary(summary: {
  gradedMarks: number;
  gradedMaxMarks: number;
  pendingKeyCount: number;
}): string {
  const scoreStr = Number.isInteger(summary.gradedMarks)
    ? String(summary.gradedMarks)
    : summary.gradedMarks.toFixed(2).replace(/\.00$/, '');
  if (summary.gradedMaxMarks === 0 && summary.pendingKeyCount > 0) {
    return `Pending Answer Key (${summary.pendingKeyCount} Q${summary.pendingKeyCount === 1 ? '' : 's'})`;
  }
  const base = `${scoreStr} / ${summary.gradedMaxMarks} Graded`;
  if (summary.pendingKeyCount > 0) {
    return `${base} · (${summary.pendingKeyCount} Pending Key)`;
  }
  return base;
}

/**
 * Re-evaluates a stored TestHistoryEntry against the live question bank (with updated verifiedAnswers)
 * so adding or editing ANY official answer key immediately updates historical test scores,
 * accuracy %, penalty marks, and pending counts in real time.
 */
export function recalculateTestHistoryEntry(
  entry: TestHistoryEntry,
  liveQuestionMap: Map<string, Question>
): TestHistoryEntry {
  const resolvedQuestions: Question[] = [];
  const responsesById: Record<string, UserResponseLike> = {};

  for (const qid of entry.questionIds) {
    const q = liveQuestionMap.get(qid);
    if (!q) continue;
    resolvedQuestions.push(q);
    responsesById[qid] = parseSerializedResponse(q.format, entry.responses[qid]);
  }

  if (resolvedQuestions.length === 0) return entry;

  const summary = gradeTestSessionStrict(resolvedQuestions, responsesById);
  return {
    ...entry,
    gradedMarks: summary.gradedMarks,
    gradedMaxMarks: summary.gradedMaxMarks,
    totalMaxMarks: summary.totalMaxMarks,
    gradedCount: summary.gradedCount,
    gradedAttemptedCount: summary.gradedAttemptedCount,
    pendingKeyCount: summary.pendingKeyCount,
    correctCount: summary.correctCount,
    wrongCount: summary.wrongCount,
    unattemptedCount: summary.unattemptedCount,
    penaltyMarks: summary.penaltyMarks,
    accuracyPct: summary.accuracyPct,
  };
}
