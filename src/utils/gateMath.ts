import type {
  Question,
  SubjectDefinition,
  SubjectId,
  SubtopicProgress,
  TopicStatus,
  QuestionAttemptRecord,
  StudyLogEntry,
  WarRoomState,
} from '../types';
import { normalizeSubject12 } from './subjectMigration';

export interface CountdownBreakdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  isExpired: boolean;
}

export function computeCountdown(targetIso: string, nowMs: number = Date.now()): CountdownBreakdown {
  const targetMs = new Date(targetIso).getTime();
  if (Number.isNaN(targetMs)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isExpired: true };
  }
  const diff = Math.max(0, targetMs - nowMs);
  if (diff === 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isExpired: true };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalMs: diff, isExpired: false };
}

export interface SprintPhaseInfo {
  phaseNumber: 1 | 2 | 3;
  label: string;
  focus: string;
  clampedDaysRemaining: number;
  sprintProgressPct: number; // 0 to 100 across 70 days
}

export function computeSprintPhase(daysRemaining: number): SprintPhaseInfo {
  const clamped = Math.max(0, Math.min(70, daysRemaining));
  const elapsed = 70 - clamped;
  const sprintProgressPct = Math.round((elapsed / 70) * 100);

  if (clamped >= 41) {
    return {
      phaseNumber: 1,
      label: 'Phase 1 · Days 70–41',
      focus: 'Core Consolidation & Topic-wise PYQs',
      clampedDaysRemaining: clamped,
      sprintProgressPct,
    };
  }
  if (clamped >= 16) {
    return {
      phaseNumber: 2,
      label: 'Phase 2 · Days 40–16',
      focus: 'High-Weightage Drills, DPPs & Subject Tests',
      clampedDaysRemaining: clamped,
      sprintProgressPct,
    };
  }
  return {
    phaseNumber: 3,
    label: 'Phase 3 · Days 15–1',
    focus: 'Full-Length Mocks, Mistake Patching & Formula Lock',
    clampedDaysRemaining: clamped,
    sprintProgressPct,
  };
}

export interface EvaluationResult {
  attempted: boolean;
  isCorrect: boolean;
  marksAwarded: number;
  maxMarks: number;
}

export function evaluateQuestionResponse(
  question: Question,
  response: {
    selectedOption?: string;
    selectedOptions?: string[];
    natValue?: string;
  }
): EvaluationResult {
  const maxMarks = question.marks;

  if (question.format === 'MCQ') {
    const sel = response.selectedOption?.trim();
    if (!sel) {
      return { attempted: false, isCorrect: false, marksAwarded: 0, maxMarks };
    }
    if (sel === question.correctOption) {
      return { attempted: true, isCorrect: true, marksAwarded: maxMarks, maxMarks };
    }
    const penalty = maxMarks === 1 ? -1 / 3 : -2 / 3;
    return {
      attempted: true,
      isCorrect: false,
      marksAwarded: Number(penalty.toFixed(2)),
      maxMarks,
    };
  }

  if (question.format === 'MSQ') {
    const sel = Array.from(new Set(response.selectedOptions ?? [])).sort();
    if (sel.length === 0) {
      return { attempted: false, isCorrect: false, marksAwarded: 0, maxMarks };
    }
    const expected = Array.from(new Set(question.correctOptions ?? [])).sort();
    const isExactMatch =
      sel.length === expected.length && sel.every((opt, idx) => opt === expected[idx]);
    return {
      attempted: true,
      isCorrect: isExactMatch,
      marksAwarded: isExactMatch ? maxMarks : 0, // Zero partial credit, zero negative marking
      maxMarks,
    };
  }

  // NAT
  const raw = response.natValue?.trim() ?? '';
  if (raw === '') {
    return { attempted: false, isCorrect: false, marksAwarded: 0, maxMarks };
  }
  const numeric = Number(raw);
  if (Number.isNaN(numeric)) {
    return { attempted: true, isCorrect: false, marksAwarded: 0, maxMarks };
  }
  let isCorrect = false;
  if (
    typeof question.natRangeMin === 'number' &&
    typeof question.natRangeMax === 'number' &&
    Number.isFinite(question.natRangeMin) &&
    Number.isFinite(question.natRangeMax)
  ) {
    const low = Math.min(question.natRangeMin, question.natRangeMax);
    const high = Math.max(question.natRangeMin, question.natRangeMax);
    isCorrect = numeric >= low - 1e-9 && numeric <= high + 1e-9;
  } else if (question.natAnswer !== undefined && Number.isFinite(question.natAnswer)) {
    const tolerance = question.natTolerance ?? 0.01;
    isCorrect = Math.abs(numeric - question.natAnswer) <= tolerance + 1e-9;
  }
  return {
    attempted: true,
    isCorrect,
    marksAwarded: isCorrect ? maxMarks : 0, // NAT has zero negative marking
    maxMarks,
  };
}

export const STATUS_ORDER: TopicStatus[] = [
  'not_started',
  'concept_done',
  'pyqs_done',
  'mastered',
];

export function nextTopicStatus(current: TopicStatus): TopicStatus {
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

export function statusWeight(status: TopicStatus): number {
  switch (status) {
    case 'not_started':
      return 0;
    case 'concept_done':
      return 0.4;
    case 'pyqs_done':
      return 0.75;
    case 'mastered':
      return 1;
  }
}

export function needsSpacedRevision(
  entry: SubtopicProgress | undefined,
  nowMs: number = Date.now(),
  thresholdDays: number = 7
): boolean {
  if (!entry || entry.status === 'not_started') return false;
  if (!entry.lastRevisedAt) return true;
  const lastMs = new Date(entry.lastRevisedAt).getTime();
  if (Number.isNaN(lastMs)) return true;
  const diffDays = (nowMs - lastMs) / (1000 * 60 * 60 * 24);
  return diffDays >= thresholdDays;
}

export function computeSubjectMastery(
  subject: SubjectDefinition,
  progress: Record<string, SubtopicProgress>
): number {
  if (subject.subtopics.length === 0) return 0;
  let total = 0;
  for (const sub of subject.subtopics) {
    const p = progress[sub.id];
    total += p ? statusWeight(p.status) : 0;
  }
  return Math.round((total / subject.subtopics.length) * 100);
}

export function computeOverallMastery(
  subjects: SubjectDefinition[],
  progress: Record<string, SubtopicProgress>
): number {
  const allSubtopics = subjects.flatMap((s) => s.subtopics);
  if (allSubtopics.length === 0) return 0;
  let sum = 0;
  for (const sub of allSubtopics) {
    const p = progress[sub.id];
    sum += p ? statusWeight(p.status) : 0;
  }
  return Math.round((sum / allSubtopics.length) * 100);
}

export function computePyqAccuracy(
  attempts: Record<string, QuestionAttemptRecord>
): { accuracyPct: number; attemptedCount: number; correctCount: number } {
  const list = Object.values(attempts);
  if (list.length === 0) {
    return { accuracyPct: 0, attemptedCount: 0, correctCount: 0 };
  }
  const correctCount = list.filter((a) => a.isCorrect).length;
  return {
    accuracyPct: Math.round((correctCount / list.length) * 100),
    attemptedCount: list.length,
    correctCount,
  };
}

export function computeEstimatedGateMarks(
  subjects: SubjectDefinition[],
  progress: Record<string, SubtopicProgress>,
  attempts: Record<string, QuestionAttemptRecord>
): number {
  const { accuracyPct, attemptedCount } = computePyqAccuracy(attempts);
  const accuracyFactor = attemptedCount > 0 ? 0.55 + (accuracyPct / 100) * 0.45 : 0.78;
  let weightedSum = 0;
  for (const subject of subjects) {
    const masteryPct = computeSubjectMastery(subject, progress);
    weightedSum += subject.weightage * (masteryPct / 100);
  }
  const projected = Math.min(100, Math.max(0, weightedSum * accuracyFactor));
  return Number(projected.toFixed(1));
}

export function computeStudyStreak(logs: StudyLogEntry[], todayIsoDate: string): number {
  if (logs.length === 0) return 0;
  const activeDates = new Set(logs.filter((l) => l.minutes > 0).map((l) => l.date));
  if (activeDates.size === 0) return 0;

  const parseDay = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  const formatDay = (utcMs: number) => {
    const dt = new Date(utcMs);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  let cursor = parseDay(todayIsoDate);
  // Allow streak to continue if user hasn't logged today yet but logged yesterday
  if (!activeDates.has(formatDay(cursor))) {
    cursor -= 86400000;
    if (!activeDates.has(formatDay(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (activeDates.has(formatDay(cursor))) {
    streak += 1;
    cursor -= 86400000;
  }
  return streak;
}

export function generateMixedDppQuestions(
  allQuestions: Question[],
  subjects: SubjectDefinition[],
  progress: Record<string, SubtopicProgress>,
  attempts: Record<string, QuestionAttemptRecord>,
  count: number = 10
): Question[] {
  // Rank subjects by ROI priority: high weightage * (1 - mastery/100)
  const subjectPriority = new Map<SubjectId, number>();
  for (const s of subjects) {
    const mastery = computeSubjectMastery(s, progress);
    const revDueCount = s.subtopics.filter((st) => needsSpacedRevision(progress[st.id])).length;
    const priority = s.weightage * (1 - mastery / 100) + revDueCount * 3;
    subjectPriority.set(s.id, priority);
  }

  // Score each question: unattempted or previously wrong + high priority subject
  const scored = allQuestions.map((q, idx) => {
    const att = attempts[q.id];
    const unattemptedBonus = !att ? 15 : !att.isCorrect ? 20 : 0;
    const subScore = subjectPriority.get(q.subjectId) ?? 5;
    // Small deterministic tie-breaker
    return { q, score: subScore + unattemptedBonus + ((idx * 7) % 5) * 0.1 };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick balanced set (max 2 per subject on first pass)
  const picked: Question[] = [];
  const perSubject = new Map<SubjectId, number>();
  for (const item of scored) {
    if (picked.length >= count) break;
    const used = perSubject.get(item.q.subjectId) ?? 0;
    if (used < 2) {
      picked.push(item.q);
      perSubject.set(item.q.subjectId, used + 1);
    }
  }
  // Fill remaining if fewer than count
  if (picked.length < count) {
    const pickedIds = new Set(picked.map((p) => p.id));
    for (const item of scored) {
      if (picked.length >= count) break;
      if (!pickedIds.has(item.q.id)) {
        picked.push(item.q);
        pickedIds.add(item.q.id);
      }
    }
  }
  return picked;
}

// Pure scientific calculator math helpers
export function calcFactorial(n: number): number {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 170) {
    return NaN;
  }
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

export function applyUnaryCalcOp(
  op: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'log' | 'ln' | 'sqrt' | 'sq' | 'pow2' | 'exp' | 'inv' | 'fact' | 'abs' | 'neg',
  val: number,
  angleMode: 'DEG' | 'RAD'
): number {
  const toRad = (v: number) => (angleMode === 'DEG' ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (angleMode === 'DEG' ? (v * 180) / Math.PI : v);

  switch (op) {
    case 'sin':
      return Math.sin(toRad(val));
    case 'cos':
      return Math.cos(toRad(val));
    case 'tan':
      return Math.tan(toRad(val));
    case 'asin':
      return fromRad(Math.asin(val));
    case 'acos':
      return fromRad(Math.acos(val));
    case 'atan':
      return fromRad(Math.atan(val));
    case 'log':
      return val > 0 ? Math.log10(val) : NaN;
    case 'ln':
      return val > 0 ? Math.log(val) : NaN;
    case 'sqrt':
      return val >= 0 ? Math.sqrt(val) : NaN;
    case 'sq':
      return val * val;
    case 'pow2':
      return Math.pow(2, val);
    case 'exp':
      return Math.exp(val);
    case 'inv':
      return val !== 0 ? 1 / val : NaN;
    case 'fact':
      return calcFactorial(val);
    case 'abs':
      return Math.abs(val);
    case 'neg':
      return -val;
  }
}

export function applyBinaryCalcOp(
  op: '+' | '-' | '*' | '/' | 'pow' | 'mod',
  a: number,
  b: number
): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b !== 0 ? a / b : NaN;
    case 'pow':
      return Math.pow(a, b);
    case 'mod':
      return b !== 0 ? a % b : NaN;
  }
}

export function formatCalcResult(num: number): string {
  if (!Number.isFinite(num)) return 'Error';
  if (Object.is(num, -0) || Math.abs(num) < 1e-12) return '0';
  if (Math.abs(num) >= 1e12 || (Math.abs(num) > 0 && Math.abs(num) < 1e-7)) {
    return num.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return Number(num.toPrecision(10)).toString();
}

const VALID_SUBJECT_IDS = new Set<string>([
  'ga', 'em', 'dl', 'coa', 'cprog', 'ds', 'pds', 'algo', 'toc', 'cd', 'os', 'dbms', 'cn',
]);

export function validateImportedQuestionsJson(rawJson: string): {
  valid: boolean;
  questions: Question[];
  errors: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      valid: false,
      questions: [],
      errors: [`Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failed'}`],
    };
  }

  if (!Array.isArray(parsed)) {
    return { valid: false, questions: [], errors: ['Root JSON value must be an array of question objects.'] };
  }

  if (parsed.length === 0) {
    return { valid: false, questions: [], errors: ['Question array is empty.'] };
  }

  const errors: string[] = [];
  const questions: Question[] = [];

  parsed.forEach((item, index) => {
    const prefix = `Item #${index + 1}`;
    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}: must be an object.`);
      return;
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.subjectId !== 'string' || !VALID_SUBJECT_IDS.has(obj.subjectId)) {
      errors.push(`${prefix}: invalid or missing subjectId (must be one of ga, em, dl, coa, cprog, ds, algo, toc, cd, os, dbms, cn).`);
      return;
    }
    if (typeof obj.prompt !== 'string' || obj.prompt.trim().length < 5) {
      errors.push(`${prefix}: prompt must be a non-empty string.`);
      return;
    }
    if (obj.format !== 'MCQ' && obj.format !== 'MSQ' && obj.format !== 'NAT') {
      errors.push(`${prefix}: format must be MCQ, MSQ, or NAT.`);
      return;
    }
    const marks = obj.marks === 1 || obj.marks === 2 ? obj.marks : 2;
    const difficulty =
      obj.difficulty === 'Easy' || obj.difficulty === 'Medium' || obj.difficulty === 'Hard'
        ? obj.difficulty
        : 'Medium';

    if (obj.format === 'MCQ') {
      if (!Array.isArray(obj.options) || obj.options.length < 2) {
        errors.push(`${prefix}: MCQ requires at least 2 options.`);
        return;
      }
      if (typeof obj.correctOption !== 'string') {
        errors.push(`${prefix}: MCQ requires correctOption (e.g. "A").`);
        return;
      }
    }

    if (obj.format === 'MSQ') {
      if (!Array.isArray(obj.options) || obj.options.length < 2) {
        errors.push(`${prefix}: MSQ requires at least 2 options.`);
        return;
      }
      if (!Array.isArray(obj.correctOptions) || obj.correctOptions.length === 0) {
        errors.push(`${prefix}: MSQ requires non-empty correctOptions array.`);
        return;
      }
    }

    if (obj.format === 'NAT') {
      if (typeof obj.natAnswer !== 'number' || Number.isNaN(obj.natAnswer)) {
        errors.push(`${prefix}: NAT requires numeric natAnswer.`);
        return;
      }
    }

    questions.push({
      id:
        typeof obj.id === 'string' && obj.id.trim().length > 0
          ? obj.id.trim()
          : `custom-${Date.now()}-${index}`,
      subjectId: normalizeSubject12(obj.subjectId, {
        subtopic: typeof obj.subtopic === 'string' ? obj.subtopic : '',
        text: `${typeof obj.prompt === 'string' ? obj.prompt : ''} ${typeof obj.codeSnippet === 'string' ? obj.codeSnippet : ''}`,
      }),
      subtopic: typeof obj.subtopic === 'string' && obj.subtopic.trim() ? obj.subtopic.trim() : 'General',
      format: obj.format,
      marks,
      difficulty,
      sourceTag:
        typeof obj.sourceTag === 'string' && obj.sourceTag.trim()
          ? obj.sourceTag.trim()
          : 'Imported Open PYQ',
      prompt: obj.prompt.trim(),
      codeSnippet: typeof obj.codeSnippet === 'string' ? obj.codeSnippet : undefined,
      options: Array.isArray(obj.options)
        ? obj.options.map((o: unknown, i: number) => {
            const optObj = o as Record<string, unknown>;
            return {
              id: typeof optObj?.id === 'string' ? optObj.id : String.fromCharCode(65 + i),
              text: typeof optObj?.text === 'string' ? optObj.text : String(o),
            };
          })
        : undefined,
      correctOption: typeof obj.correctOption === 'string' ? obj.correctOption : undefined,
      correctOptions: Array.isArray(obj.correctOptions)
        ? obj.correctOptions.map(String)
        : undefined,
      natAnswer: typeof obj.natAnswer === 'number' ? obj.natAnswer : undefined,
      natTolerance: typeof obj.natTolerance === 'number' ? obj.natTolerance : 0.01,
      natUnit: typeof obj.natUnit === 'string' ? obj.natUnit : undefined,
      explanation:
        typeof obj.explanation === 'string' && obj.explanation.trim()
          ? obj.explanation.trim()
          : 'Review first principles and verify boundary conditions.',
      wrongOptionAnalysis:
        typeof obj.wrongOptionAnalysis === 'string' && obj.wrongOptionAnalysis.trim()
          ? obj.wrongOptionAnalysis.trim()
          : 'Verify edge cases and check for off-by-one or sign errors.',
      isCustom: true,
    });
  });

  return {
    valid: errors.length === 0 && questions.length > 0,
    questions,
    errors,
  };
}

export function validateBackupJson(rawJson: string): {
  valid: boolean;
  state?: Partial<WarRoomState>;
  error?: string;
} {
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, error: 'Backup file must contain a JSON object.' };
    }
    if (typeof parsed.version !== 'number' || !parsed.progress || typeof parsed.progress !== 'object') {
      return { valid: false, error: 'Missing required GATE War Room backup fields (version, progress).' };
    }
    return { valid: true, state: parsed as Partial<WarRoomState> };
  } catch (err) {
    return {
      valid: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
    };
  }
}

export function toLocalIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
