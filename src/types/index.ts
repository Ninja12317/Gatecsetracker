export type NavView =
  | 'dashboard'
  | 'syllabus'
  | 'focus'
  | 'pyq'
  | 'cslab'
  | 'revision'
  | 'tips'
  | 'mocks'
  | 'settings';

export type TopicStatus = 'not_started' | 'concept_done' | 'pyqs_done' | 'mastered';

export type SubjectId =
  | 'ga'
  | 'em'
  | 'dl'
  | 'coa'
  | 'pds'
  | 'algo'
  | 'toc'
  | 'cd'
  | 'os'
  | 'dbms'
  | 'cn';

export interface Subtopic {
  id: string;
  subjectId: SubjectId;
  title: string;
  highRoi?: boolean;
}

export interface SubjectDefinition {
  id: SubjectId;
  code: string;
  name: string;
  shortName: string;
  weightage: number; // Historical GATE CSE marks out of 100
  update2027Note?: string;
  subtopics: Subtopic[];
}

export interface SubtopicProgress {
  status: TopicStatus;
  confidence: number; // 1-5
  lastRevisedAt: string | null; // ISO date string
  notes: string;
}

export type FocusSessionType = 'Concept' | 'PYQs' | 'Mock Analysis' | 'Revision';

export type FocusPresetId =
  | 'sprint_25'
  | 'deep_50'
  | 'ultradian_90'
  | 'stamina_180'
  | 'short_break'
  | 'long_break'
  | 'stopwatch';

export type AmbientSoundMode = 'off' | 'brown' | 'rain' | 'pink';

export interface StudyLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  subjectId: SubjectId;
  minutes: number;
  mode: 'pomodoro' | 'stopwatch';
  completedAt: string;
  startedAt?: string;
  sessionType?: FocusSessionType;
  goal?: string;
  resumeNote?: string;
  distractions?: number;
  presetLabel?: string;
}

export type QuestionFormat = 'MCQ' | 'MSQ' | 'NAT';
export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export interface QuestionOption {
  id: string; // 'A' | 'B' | 'C' | 'D'
  text: string;
}

export interface Question {
  id: string;
  title?: string;
  subjectId: SubjectId;
  subtopic: string;
  format: QuestionFormat;
  marks: 1 | 2;
  difficulty: DifficultyLevel;
  sourceTag: string; // e.g., "PYQ · GATE 2024" or "GATE CSE 2023"
  sourceUrl?: string;
  year?: number;
  paperTag?: string;
  tags?: string[];
  prompt: string;
  bodyHtml?: string; // Sanitized HTML body (without split options if optionsExtracted is true)
  codeSnippet?: string;
  options?: QuestionOption[]; // Required for MCQ & MSQ (may contain HTML/LaTeX)
  optionsExtracted?: boolean; // True if options were cleanly parsed out of HTML; false uses floating A/B/C/D dock
  hasAnswerKey?: boolean; // True if pre-filled or verified key exists
  isOutOf2027Syllabus?: boolean; // True if tags match removed GATE 2027 syllabus topics
  isGateR?: boolean;
  correctOption?: string; // For MCQ
  correctOptions?: string[]; // For MSQ (sorted)
  natAnswer?: number; // For NAT
  natTolerance?: number; // e.g. 0.01 or 0
  natUnit?: string;
  explanation: string;
  wrongOptionAnalysis: string;
  fingerprint?: string;
  isCustom?: boolean;
}

export interface VerifiedAnswerRecord {
  questionId: string;
  format: QuestionFormat;
  correctOption?: string;
  correctOptions?: string[];
  natAnswer?: number;
  natTolerance?: number;
  explanation: string;
  wrongOptionAnalysis: string;
  source: 'manual' | 'ai';
  updatedAt: string;
}

export type ErrorTag =
  | 'Conceptual Gap'
  | 'Silly Math'
  | 'MSQ Trap'
  | 'Time Pressure';

export interface MistakeEntry {
  questionId: string;
  errorTag: ErrorTag;
  wrongCount: number;
  lastAttemptedAt: string;
  resolved: boolean;
  userNote?: string;
}

export interface QuestionAttemptRecord {
  questionId: string;
  isCorrect: boolean;
  marksAwarded: number;
  maxMarks: number;
  attemptedAt: string;
  selectedAnswer?: string;
}

export type TrapSourceType =
  | 'ai_daily'
  | 'ai_subject'
  | 'mistake_mined'
  | 'local_mined'
  | 'manual';

export interface TipItem {
  id: string;
  subjectId: SubjectId;
  title: string;
  category: 'Exam Trap' | 'Formula' | 'Shortcut' | 'Edge Case';
  summary: string;
  detail: string;
  formula?: string;
  sourceUrl?: string;
  isCustom?: boolean;
  trapSource?: TrapSourceType;
  generatedDateIst?: string;
  sourceQuestionId?: string;
}

export type GateSubject = SubjectId;

export type VaultKind =
  | 'FORMULA'
  | 'TRAP'
  | 'SHORTCUT'
  | 'TIP'
  | 'COUNTER_EXAMPLE'
  | 'EDGE_CASE';

export type VaultSource =
  | 'Master Bundle'
  | 'GitHub Sync'
  | 'JSON Import'
  | 'My Mistakes'
  | 'Custom';

export interface VaultCard {
  id: string;
  subject: GateSubject;
  subtopic: string;
  tagMatchKeywords: string[];
  kind: VaultKind;
  highYield: boolean;
  title: string;
  formulaLatex?: string;
  codeSnippet?: string;
  commonTrap?: string;
  gateTruth: string;
  quickExample?: string;
  source: VaultSource;
  packId?: string;
  packName?: string;
  outOf2027Syllabus?: boolean;
  createdAt?: number;
}

export interface VaultPack {
  packId: string;
  name: string;
  source: 'GitHub Sync' | 'JSON Import' | 'Custom';
  sourceUrl?: string;
  cardCount: number;
  cards: VaultCard[];
  createdAt: number;
  updatedAt: number;
}

export type SrsRating = 'hard' | 'good' | 'mastered';
export type SrsItemType = 'mistake' | 'trap';

export interface SrsCardRecord {
  cardId: string;
  itemType: SrsItemType;
  itemId: string;
  intervalDays: 1 | 3 | 7 | 14;
  nextReviewDate: string; // YYYY-MM-DD
  lastRating: SrsRating;
  reviewCount: number;
  updatedAt: string;
}

export type MockTestType = 'Full-Length Mock' | 'Subject Test' | 'Topic-Wise Test';
export type MockSubjectId = SubjectId | 'all';
export type MockParseSource = 'local_deterministic' | 'ai_free_tier' | 'manual';

export interface MockTestEntry {
  id: string;
  name: string;
  source: string;
  subjectId?: MockSubjectId;
  date: string; // YYYY-MM-DD
  type: MockTestType;
  score: number; // Resultant / net marks
  maxScore: number; // Total marks (25, 50, 100, etc.)
  normalizedScore?: number; // (score / maxScore) * 100
  percentage?: number;
  accuracy: number; // 0-100
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
  parseSource?: MockParseSource;
  notes: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type UiScaleMode = 'compact' | 'default' | 'comfortable';
export type ContentWidthMode = 'focused' | 'wide';

export interface ExamSettings {
  targetDateIso: string; // Default: "2027-02-06T09:30:00+05:30"
  shift: 'Forenoon (09:30 IST)' | 'Afternoon (14:30 IST)';
  dailyGoalMinutes: number;
  themeMode: ThemeMode;
  uiScale: UiScaleMode;
  contentWidth: ContentWidthMode;
  pomodoroWorkMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  timerChimeEnabled: boolean;
  autoHideRemoved2027: boolean;
  autoAddWrongToMistakes: boolean;
  showLivePaceTimer: boolean;
  enableKeyboardShortcuts: boolean;
  enableMobileSwipeNav?: boolean;
}

export type PdfExportLayout = 'worksheet' | 'solutions';

export interface GaStreakEntry {
  date: string; // YYYY-MM-DD
  completedAt: string; // ISO string
  questionsCount: number;
  correctCount: number;
  marksAwarded: number;
  maxMarks: number;
  accuracyPct: number;
  durationSeconds: number;
}

export interface DryRunTraceRow {
  id: string;
  cells: string[];
}

export interface DryRunTraceTable {
  questionId: string;
  columns: string[];
  rows: DryRunTraceRow[];
  presetName?: string;
  updatedAt: string;
}

export interface FlowchartNode {
  id: string;
  label: string;
  type: 'start' | 'end' | 'process' | 'decision' | 'call' | 'return' | 'io';
  line: number;
  stepRefs: number[];
  returnLabel?: string;
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
}

export interface CodeFlowchartGraph {
  mode: 'flowchart' | 'recursion_tree';
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

export interface CodeTraceFrame {
  step: number;
  line: number;
  activeNodeId: string;
  cfgNodeId?: string;
  recNodeId?: string;
  variables: Record<string, string>;
  memoryPointers?: Array<{ name: string; address: string; value: string }>;
  callStack: string[];
  outputSoFar: string;
  branchTaken?: 'true' | 'false' | null;
  explanation: string;
}

export interface CodeVisualizationResult {
  ok: boolean;
  engine: 'local' | 'ai';
  modelUsed?: string;
  stdout: string;
  frames: CodeTraceFrame[];
  flowchart: CodeFlowchartGraph;
  truncated?: boolean;
  quotaExceeded?: boolean;
  error?: string;
}

export type PdfExportRequest =
  | {
      kind: 'single-question';
      question: Question;
      sketchDataUrl?: string;
      traceTable?: DryRunTraceTable;
      userAnswerLabel?: string;
      timeSpentSeconds?: number;
      mistakeTag?: ErrorTag;
      mistakeNote?: string;
    }
  | {
      kind: 'test-pack';
      title: string;
      subtitle?: string;
      questions: Question[];
      defaultLayout?: PdfExportLayout;
      userAnswers?: Record<string, string>;
      questionSeconds?: Record<string, number>;
      mistakeMap?: Record<string, MistakeEntry>;
      savedSketches?: Record<string, string>;
      savedTraceTables?: Record<string, DryRunTraceTable>;
    }
  | {
      kind: 'study-report';
      title?: string;
    }
  | {
      kind: 'mock-report';
      title?: string;
    };

export type SyncStatus = 'signed_out' | 'connecting' | 'synced' | 'error';
export type GateRSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface AuthUserSummary {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
}

export interface WarRoomState {
  version: number;
  theme: 'light' | 'dark';
  settings: ExamSettings;
  lastAutopilotIstDate: string;
  lastTrapsIstDate: string;
  progress: Record<string, SubtopicProgress>;
  studyLogs: StudyLogEntry[];
  attempts: Record<string, QuestionAttemptRecord>;
  mistakes: Record<string, MistakeEntry>;
  verifiedAnswers: Record<string, VerifiedAnswerRecord>;
  bookmarkedQuestions: string[];
  savedSketches: Record<string, string>; // questionId -> dataURL
  traceTables: Record<string, DryRunTraceTable>; // questionId -> dry-run trace table
  gaStreakLogs: Record<string, GaStreakEntry>; // YYYY-MM-DD -> completed daily GA sprint
  customQuestions: Question[];
  bookmarkedTips: string[];
  customTips: TipItem[];
  trapsVault: TipItem[];
  vaultPacks: VaultPack[];
  srsCards: Record<string, SrsCardRecord>;
  mocks: MockTestEntry[];
}
