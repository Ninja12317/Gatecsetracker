import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ExternalLink,
  Upload,
  Download,
  RotateCcw,
  X,
  AlertCircle,
  BookOpen,
  RefreshCw,
  Link2,
  FileDown,
  ChevronDown,
  SlidersHorizontal,
  History,
  KeyRound,
  Sparkles,
  CheckCircle2,
  XCircle,
  Trash2,
  Play,
  Target,
} from 'lucide-react';
import type {
  DailyTestRecord,
  DryRunTraceTable,
  ErrorTag,
  GateRSyncStatus,
  PdfExportRequest,
  Question,
  SubjectId,
  TestHistoryEntry,
  VerifiedAnswerRecord,
  WarRoomState,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import { OPEN_RESOURCES, SAMPLE_IMPORT_JSON } from '../data/resources';
import {
  evaluateQuestionResponse,
  validateImportedQuestionsJson,
} from '../utils/gateMath';
import { computeGaStreakMetrics } from '../utils/gaStreak';
import { getIstDateString } from '../utils/pyqServerHelpers';
import { applyVerifiedAnswer } from '../utils/gaterNormalizer';
import { hasGateOverflowUrl } from '../utils/subjectMigration';
import {
  evaluateQuestionStrict,
  formatGradedScoreSummary,
  hasVerifiedAnswerKey,
  parseSerializedResponse,
} from '../utils/testScoringEngine';
import type { SubjectFetchResult, UrlIngestResult } from '../hooks/useWarRoomStore';
import { PyqTestBuilder, type SessionMode } from './PyqTestBuilder';
import { PyqCbtSession, type ActiveCbtSession, type UserResponse } from './PyqCbtSession';
import { RichQuestionContent } from './RichQuestionContent';

export interface ConceptDrillContext {
  nonce: number;
  cardTitle: string;
  subjectId: SubjectId;
  subtopic: string;
  questions: Question[];
  matchedCount: number;
  usedSubjectFallback: boolean;
}

interface DailyCompletionPayload {
  dateIst?: string;
  questionIds: string[];
  score: number;
  maxMarks: number;
  accuracy: number;
  attemptedCount: number;
  correctCount: number;
  durationSeconds?: number;
  responses?: Record<string, string>;
}

interface PyqStudioViewProps {
  state: WarRoomState;
  allQuestions: Question[];
  simpleMode?: boolean;
  autoStartDppTrigger: number;
  autoReviewDppTrigger?: number;
  autoStartGaSprintTrigger?: number;
  autoReviewGaTrigger?: number;
  openMistakesTrigger?: number;
  launchSketchpadSprintTrigger?: number;
  onGetOrCreateTodayDailyDpp: () => {
    todayIst: string;
    record: DailyTestRecord;
    questions: Question[];
    rolledOverPool: boolean;
  };
  onCompleteDailyDpp: (payload: DailyCompletionPayload) => void;
  onGetOrCreateTodayDailyGa: () => {
    todayIst: string;
    record: DailyTestRecord;
    questions: Question[];
    rolledOverPool: boolean;
  };
  onCompleteDailyGa: (payload: DailyCompletionPayload) => void;
  gaterSyncStatus: GateRSyncStatus;
  gaterCount: number;
  arshanCount?: number;
  enrichedCount?: number;
  verifiedBankCount?: number;
  syncProgressMsg?: string;
  gaterSyncedAt: string;
  gaterError: string;
  subjectFetching: SubjectId | null;
  subjectCooldownUntil: Record<string, number>;
  urlIngestLoading: boolean;
  quotaNotice: string;
  onResyncGateR: () => Promise<unknown>;
  onNotify?: (msg: string) => void;
  onSaveVerifiedAnswer: (
    record: Omit<VerifiedAnswerRecord, 'updatedAt'>
  ) => Promise<VerifiedAnswerRecord>;
  onVerifySinglePyq: (question: Question) => Promise<{
    ok: boolean;
    verified?: VerifiedAnswerRecord;
    modelUsed?: string;
    quotaExceeded?: boolean;
    message: string;
  }>;
  onFetchSubjectPyqs: (subjectId: SubjectId) => Promise<SubjectFetchResult>;
  onIngestPublicUrl: (url: string) => Promise<UrlIngestResult>;
  onRecordAttempt: (
    questionId: string,
    isCorrect: boolean,
    marksAwarded: number,
    maxMarks: number,
    selectedAnswer?: string
  ) => void;
  onToggleBookmark: (questionId: string) => void;
  onUpdateMistakeTag: (questionId: string, tag: ErrorTag) => void;
  onUpdateMistakeNote: (questionId: string, note: string) => void;
  onToggleMistakeResolved: (questionId: string) => void;
  onSaveSketch: (questionId: string, dataUrl: string) => void;
  onDeleteSketch: (questionId: string) => void;
  onSaveTraceTable: (questionId: string, table: DryRunTraceTable) => void;
  onDeleteTraceTable: (questionId: string) => void;
  onCompleteGaSprint: (payload: {
    questionsCount: number;
    correctCount: number;
    marksAwarded: number;
    maxMarks: number;
    accuracyPct: number;
    durationSeconds: number;
  }) => void;
  onImportQuestions: (questions: Question[]) => void;
  onToggleCalculator: () => void;
  zenMode: boolean;
  onToggleZenMode: () => void;
  onRequestPdfExport: (req: PdfExportRequest) => void;
  onRecordTestHistory?: (entry: TestHistoryEntry) => void;
  onDeleteTestHistory?: (testId: string) => void;
  onSessionStateChange?: (info: {
    active: boolean;
    isTimed: boolean;
    finished: boolean;
    title: string;
    sketchpadOpen: boolean;
    studioTab: 'practice' | 'history' | 'mistakes' | 'resources';
  }) => void;
  exitSessionTrigger?: number;
  resetStudioTabTrigger?: number;
  conceptDrillContext?: ConceptDrillContext | null;
  onClearConceptDrill?: () => void;
}

type StudioTab = 'practice' | 'history' | 'mistakes' | 'resources';

const ERROR_TAGS: ErrorTag[] = [
  'Conceptual Gap',
  'Silly Math',
  'MSQ Trap',
  'Time Pressure',
];

export const PyqStudioView: React.FC<PyqStudioViewProps> = ({
  state,
  allQuestions,
  simpleMode = false,
  autoStartDppTrigger,
  autoReviewDppTrigger = 0,
  autoStartGaSprintTrigger = 0,
  autoReviewGaTrigger = 0,
  openMistakesTrigger = 0,
  launchSketchpadSprintTrigger = 0,
  onGetOrCreateTodayDailyDpp,
  onCompleteDailyDpp,
  onGetOrCreateTodayDailyGa,
  onCompleteDailyGa,
  gaterSyncStatus,
  gaterCount,
  arshanCount = 0,
  enrichedCount = 0,
  verifiedBankCount,
  syncProgressMsg = '',
  gaterSyncedAt,
  gaterError,
  subjectFetching,
  subjectCooldownUntil,
  urlIngestLoading,
  quotaNotice,
  onResyncGateR,
  onNotify,
  onSaveVerifiedAnswer,
  onVerifySinglePyq,
  onFetchSubjectPyqs,
  onIngestPublicUrl,
  onRecordAttempt,
  onToggleBookmark,
  onUpdateMistakeTag,
  onUpdateMistakeNote,
  onToggleMistakeResolved,
  onSaveSketch,
  onDeleteSketch,
  onSaveTraceTable,
  onDeleteTraceTable,
  onCompleteGaSprint,
  onImportQuestions,
  onToggleCalculator,
  zenMode,
  onToggleZenMode,
  onRequestPdfExport,
  onRecordTestHistory,
  onDeleteTestHistory,
  onSessionStateChange,
  exitSessionTrigger = 0,
  resetStudioTabTrigger = 0,
  conceptDrillContext = null,
  onClearConceptDrill,
}) => {
  const [studioTab, setStudioTab] = useState<StudioTab>('practice');
  const [session, setSession] = useState<ActiveCbtSession | null>(null);
  const [sketchpadOpen, setSketchpadOpen] = useState<boolean>(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState<boolean>(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyKeyDrafts, setHistoryKeyDrafts] = useState<Record<string, string>>({});
  const [historyVerifyingIds, setHistoryVerifyingIds] = useState<Record<string, boolean>>({});
  const [historyKeySaved, setHistoryKeySaved] = useState<Record<string, boolean>>({});

  // Notify parent App about active PYQ test session / sketchpad / sub-tab for Mobile Bottom Nav & Contextual Back
  useEffect(() => {
    onSessionStateChange?.({
      active: Boolean(session && studioTab === 'practice'),
      isTimed: Boolean(session && session.mode === 'cbt_mock' && !session.finished),
      finished: Boolean(session?.finished),
      title: session?.title ?? '',
      sketchpadOpen,
      studioTab,
    });
  }, [session, studioTab, sketchpadOpen, onSessionStateChange]);

  useEffect(() => {
    if (exitSessionTrigger > 0) {
      setSession(null);
      setSketchpadOpen(false);
    }
  }, [exitSessionTrigger]);

  useEffect(() => {
    if (resetStudioTabTrigger > 0) {
      setStudioTab('practice');
    }
  }, [resetStudioTabTrigger]);

  // Per-subject Free-Tier PYQ Fetcher state
  const [fetchSubjectId, setFetchSubjectId] = useState<SubjectId>('os');
  const [fetchFeedback, setFetchFeedback] = useState<{ type: 'ok' | 'warn'; msg: string } | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // One-Click Public URL Importer state
  const [publicUrlInput, setPublicUrlInput] = useState<string>('');
  const [urlFeedback, setUrlFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Mistake Bucket filter
  const [mistakeFilter, setMistakeFilter] = useState<'unresolved' | 'all'>('unresolved');

  // Bulk JSON Importer Modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');

  // Cooldown ticker
  const activeCooldownRemaining = Math.max(
    0,
    Math.ceil(((subjectCooldownUntil[fetchSubjectId] ?? 0) - nowTick) / 1000)
  );
  useEffect(() => {
    if (activeCooldownRemaining <= 0) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [activeCooldownRemaining]);

  const handleFetch5SubjectPyqs = async () => {
    setFetchFeedback(null);
    setNowTick(Date.now());
    const res = await onFetchSubjectPyqs(fetchSubjectId);
    setNowTick(Date.now());
    setFetchFeedback({
      type: res.ok ? 'ok' : 'warn',
      msg: res.message,
    });
  };

  const handleIngestUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlFeedback(null);
    const res = await onIngestPublicUrl(publicUrlInput);
    if (res.ok) {
      setUrlFeedback({ type: 'ok', msg: res.message });
      setPublicUrlInput('');
    } else {
      setUrlFeedback({ type: 'err', msg: res.message });
    }
  };

  const startSession = useCallback(
    (title: string, questions: Question[], mode: SessionMode) => {
      if (questions.length === 0) return;
      setStudioTab('practice');
      // 65Q full mock = 180 mins; otherwise 3 mins/Q
      const totalSeconds =
        questions.length === 65 ? 180 * 60 : Math.max(300, questions.length * 180);
      setSession({
        title,
        mode,
        questions,
        secondsRemaining: totalSeconds,
        elapsedSeconds: 0,
        questionSeconds: {},
        currentIndex: 0,
        responses: {},
        checked: {},
        markedForReview: {},
        visited: { [questions[0].id]: true },
        finished: false,
      });
    },
    []
  );

  const handleLaunchDailyDpp = useCallback(() => {
    const { todayIst, questions } = onGetOrCreateTodayDailyDpp();
    if (questions.length === 0) return;
    setStudioTab('practice');
    setSession({
      title: `Daily Mixed DPP · ${todayIst} (${questions.length} Unseen Qs)`,
      mode: 'cbt_mock',
      questions,
      secondsRemaining: Math.max(300, questions.length * 180),
      elapsedSeconds: 0,
      questionSeconds: {},
      currentIndex: 0,
      responses: {},
      checked: {},
      markedForReview: {},
      visited: { [questions[0].id]: true },
      finished: false,
      dailyKind: 'dpp',
      dailyDateIst: todayIst,
    });
  }, [onGetOrCreateTodayDailyDpp]);

  const handleLaunchGaSprint = useCallback(() => {
    const { todayIst, questions } = onGetOrCreateTodayDailyGa();
    if (questions.length === 0) return;
    setStudioTab('practice');
    setSession({
      title: `Daily 10-Min GA Test · ${todayIst} (${questions.length} Qs)`,
      mode: 'cbt_mock',
      questions,
      secondsRemaining: 600,
      elapsedSeconds: 0,
      questionSeconds: {},
      currentIndex: 0,
      responses: {},
      checked: {},
      markedForReview: {},
      visited: { [questions[0].id]: true },
      finished: false,
      isGaSprint: true,
      dailyKind: 'ga',
      dailyDateIst: todayIst,
    });
  }, [onGetOrCreateTodayDailyGa]);

  const handleReviewDailyTest = useCallback(
    (kind: 'dpp' | 'ga') => {
      const todayIst = getIstDateString();
      const map =
        kind === 'dpp'
          ? state.dailyProgress.dailyDppByDate
          : state.dailyProgress.dailyGaByDate;
      const record =
        map[todayIst] ??
        Object.values(map)
          .filter((r) => r.completed)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!record || record.questionIds.length === 0) return;

      const qById = new Map(allQuestions.map((q) => [q.id, q]));
      const questions = record.questionIds
        .map((id) => qById.get(id))
        .filter((q): q is Question => Boolean(q));
      if (questions.length === 0) return;

      const responses: Record<string, UserResponse> = {};
      const checked: ActiveCbtSession['checked'] = {};
      const visited: Record<string, boolean> = {};

      for (const rawQ of questions) {
        visited[rawQ.id] = true;
        const verified = state.verifiedAnswers[rawQ.id];
        const q = verified ? applyVerifiedAnswer(rawQ, verified) : rawQ;
        const savedAns = record.responses?.[q.id] ?? '';
        let resp: UserResponse = {};
        if (savedAns) {
          if (q.format === 'MCQ') resp = { selectedOption: savedAns };
          else if (q.format === 'MSQ')
            resp = { selectedOptions: savedAns.split(',').filter(Boolean) };
          else resp = { natValue: savedAns };
        }
        responses[q.id] = resp;
        checked[q.id] = evaluateQuestionResponse(q, resp);
      }

      setStudioTab('practice');
      setSession({
        title:
          kind === 'dpp'
            ? `Daily Mixed DPP Review · ${record.date} (${record.score}/${record.maxMarks})`
            : `Daily 10-Min GA Review · ${record.date} (${record.score}/${record.maxMarks})`,
        mode: 'cbt_mock',
        questions,
        secondsRemaining: 0,
        elapsedSeconds: record.durationSeconds ?? 0,
        questionSeconds: {},
        currentIndex: 0,
        responses,
        checked,
        markedForReview: {},
        visited,
        finished: true,
        isGaSprint: kind === 'ga',
        dailyKind: kind,
        dailyDateIst: record.date,
      });
    },
    [state.dailyProgress, state.verifiedAnswers, allQuestions]
  );

  // Auto-launch Daily Mixed DPP when triggered from Dashboard or Command Palette
  useEffect(() => {
    if (autoStartDppTrigger > 0) {
      handleLaunchDailyDpp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartDppTrigger]);

  // Auto-review today's completed Daily Mixed DPP
  useEffect(() => {
    if (autoReviewDppTrigger > 0) {
      handleReviewDailyTest('dpp');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReviewDppTrigger]);

  // Auto-launch Daily 10-Min GA Lock-In Sprint when triggered from Dashboard or Command Palette
  useEffect(() => {
    if (autoStartGaSprintTrigger > 0) {
      handleLaunchGaSprint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartGaSprintTrigger]);

  // Auto-review today's completed Daily GA test
  useEffect(() => {
    if (autoReviewGaTrigger > 0) {
      handleReviewDailyTest('ga');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReviewGaTrigger]);

  const gaStreakMetrics = useMemo(
    () => computeGaStreakMetrics(state.gaStreakLogs, state.attempts, allQuestions),
    [state.gaStreakLogs, state.attempts, allQuestions]
  );

  // Quick-launch Sketchpad Sprint from Dashboard Bento Dock
  useEffect(() => {
    if (launchSketchpadSprintTrigger > 0) {
      setSketchpadOpen(true);
      const withCode = allQuestions.filter(
        (q) =>
          !q.isOutOf2027Syllabus &&
          (Boolean(q.codeSnippet) || (q.bodyHtml ? q.bodyHtml.includes('<pre') : false))
      );
      const rest = allQuestions.filter((q) => !q.isOutOf2027Syllabus && !withCode.includes(q));
      const batch = [...withCode, ...rest].slice(0, 10);
      startSession('Rough-Work Sketchpad Sprint', batch, 'practice_sprint');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchSketchpadSprintTrigger]);

  // Quick-open Mistake Bucket tab from Dashboard Bento Dock
  useEffect(() => {
    if (openMistakesTrigger > 0) {
      setSession(null);
      setStudioTab('mistakes');
    }
  }, [openMistakesTrigger]);

  // Open Test Builder with Concept Drill banner when arriving from Formula & Trap Vault
  useEffect(() => {
    if (conceptDrillContext && conceptDrillContext.nonce > 0) {
      setSession(null);
      setStudioTab('practice');
    }
  }, [conceptDrillContext?.nonce]);

  const questionById = useMemo(
    () => new Map(allQuestions.map((q) => [q.id, q])),
    [allQuestions]
  );

  const handleOpenHistoryReview = useCallback(
    (entry: TestHistoryEntry) => {
      const questions = entry.questionIds
        .map((id) => questionById.get(id))
        .filter((q): q is Question => Boolean(q));
      if (questions.length === 0) return;

      const responses: Record<string, UserResponse> = {};
      const checked: ActiveCbtSession['checked'] = {};
      const visited: Record<string, boolean> = {};

      for (const q of questions) {
        visited[q.id] = true;
        const resp = parseSerializedResponse(q.format, entry.responses[q.id]);
        responses[q.id] = resp;
        const ev = evaluateQuestionStrict(q, resp);
        checked[q.id] = {
          attempted: ev.attempted,
          isCorrect: ev.isCorrect,
          marksAwarded: ev.marksAwarded,
          maxMarks: ev.maxMarks,
        };
      }

      setStudioTab('practice');
      setSession({
        title: entry.title,
        mode: entry.mode === 'practice' || entry.mode === 'concept_drill' ? 'practice_sprint' : 'cbt_mock',
        questions,
        secondsRemaining: 0,
        elapsedSeconds: entry.durationSeconds ?? 0,
        questionSeconds: {},
        currentIndex: 0,
        responses,
        checked,
        markedForReview: {},
        visited,
        finished: true,
      });
    },
    [questionById]
  );

  const handleSaveHistoryKey = useCallback(
    async (q: Question) => {
      const raw = (historyKeyDrafts[q.id] ?? '').trim();
      if (!raw) return;

      let record: Omit<VerifiedAnswerRecord, 'updatedAt'> | null = null;
      if (q.format === 'MCQ') {
        const clean = raw.toUpperCase().replace(/[^A-E]/g, '').slice(0, 1);
        if (!clean) return;
        record = {
          questionId: q.id,
          format: 'MCQ',
          correctOption: clean,
          explanation: q.explanation || 'Official answer key saved by user.',
          wrongOptionAnalysis: q.wrongOptionAnalysis || '',
          source: 'manual',
        };
      } else if (q.format === 'MSQ') {
        const cleanList = Array.from(
          new Set(
            raw
              .toUpperCase()
              .split(/[\s,;]+/)
              .map((x) => x.replace(/[^A-E]/g, '').slice(0, 1))
              .filter((x) => /^[A-E]$/.test(x))
          )
        ).sort();
        if (cleanList.length === 0) return;
        record = {
          questionId: q.id,
          format: 'MSQ',
          correctOptions: cleanList,
          explanation: q.explanation || 'Official MSQ answer key saved by user.',
          wrongOptionAnalysis: q.wrongOptionAnalysis || '',
          source: 'manual',
        };
      } else {
        const num = Number(raw);
        if (!Number.isFinite(num)) return;
        record = {
          questionId: q.id,
          format: 'NAT',
          natAnswer: num,
          natTolerance: 0.01,
          explanation: q.explanation || 'Official NAT answer key saved by user.',
          wrongOptionAnalysis: q.wrongOptionAnalysis || '',
          source: 'manual',
        };
      }

      await onSaveVerifiedAnswer(record);
      setHistoryKeySaved((prev) => ({ ...prev, [q.id]: true }));
      onNotify?.('Official answer key saved — test scores & analytics updated.');
    },
    [historyKeyDrafts, onSaveVerifiedAnswer, onNotify]
  );

  const handleAiVerifyHistoryQuestion = useCallback(
    async (q: Question) => {
      if (historyVerifyingIds[q.id]) return;
      setHistoryVerifyingIds((prev) => ({ ...prev, [q.id]: true }));
      const res = await onVerifySinglePyq(q);
      setHistoryVerifyingIds((prev) => ({ ...prev, [q.id]: false }));
      if (res.ok) {
        onNotify?.('Verified with AI — test scores & analytics updated.');
      } else {
        onNotify?.(res.message);
      }
    },
    [historyVerifyingIds, onVerifySinglePyq, onNotify]
  );

  const mistakeEntries = useMemo(() => {
    const qMap = new Map(allQuestions.map((q) => [q.id, q]));
    return Object.values(state.mistakes)
      .map((entry) => ({ entry, question: qMap.get(entry.questionId) }))
      .filter((x): x is { entry: typeof x.entry; question: Question } => Boolean(x.question))
      .sort((a, b) => Number(a.entry.resolved) - Number(b.entry.resolved));
  }, [state.mistakes, allQuestions]);

  const unresolvedMistakes = useMemo(
    () => mistakeEntries.filter((m) => !m.entry.resolved),
    [mistakeEntries]
  );

  const handleLaunchMistakeDrill = () => {
    const list = (unresolvedMistakes.length > 0 ? unresolvedMistakes : mistakeEntries).map(
      (m) => m.question
    );
    if (list.length === 0) return;
    startSession(`Mistake Bucket Drill (${list.length} Qs)`, list, 'practice_sprint');
  };

  // Bulk JSON Import Handlers
  const handleRunImport = () => {
    const result = validateImportedQuestionsJson(importText);
    if (!result.valid) {
      setImportErrors(result.errors);
      setImportSuccessMsg('');
      return;
    }
    onImportQuestions(result.questions);
    setImportErrors([]);
    setImportSuccessMsg(`Imported ${result.questions.length} question(s) into your PYQ bank.`);
    setImportText('');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportText(reader.result);
        setImportErrors([]);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_IMPORT_JSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gate27-pyq-sample-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===================== ACTIVE CBT PRACTICE / MOCK SESSION =====================
  if (session && studioTab === 'practice') {
    return (
      <PyqCbtSession
        session={session}
        setSession={setSession}
        state={state}
        sketchpadOpen={sketchpadOpen}
        setSketchpadOpen={setSketchpadOpen}
        onExit={() => setSession(null)}
        onRecordAttempt={onRecordAttempt}
        onToggleBookmark={onToggleBookmark}
        onUpdateMistakeTag={onUpdateMistakeTag}
        onSaveSketch={onSaveSketch}
        onDeleteSketch={onDeleteSketch}
        onSaveTraceTable={onSaveTraceTable}
        onDeleteTraceTable={onDeleteTraceTable}
        onCompleteGaSprint={onCompleteGaSprint}
        onCompleteDailyDpp={onCompleteDailyDpp}
        onCompleteDailyGa={onCompleteDailyGa}
        onRecordTestHistory={onRecordTestHistory}
        onSaveVerifiedAnswer={onSaveVerifiedAnswer}
        onVerifySinglePyq={onVerifySinglePyq}
        onToggleCalculator={onToggleCalculator}
        zenMode={zenMode}
        onToggleZenMode={onToggleZenMode}
        onRequestPdfExport={onRequestPdfExport}
      />
    );
  }

  // ===================== STUDIO LOBBY / TEST HISTORY / MISTAKE BUCKET / OPEN RESOURCES =====================
  return (
    <div className="space-y-6">
      {/* Studio Sub-Navigation Pill Bar (Single-row horizontal rail on mobile, zero vertical stacking) */}
      <div className="relative flex flex-nowrap items-center justify-between gap-2 rounded-[24px] sm:rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 sm:px-5 py-2.5 sm:py-3.5 shadow-warm">
        <div className="min-w-0 flex-1 mobile-rail-fade">
          <div
            className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1"
            role="tablist"
            aria-label="PYQ Studio tabs"
          >
            {[
              {
                id: 'practice' as const,
                label: `Test Builder (${allQuestions.length.toLocaleString()})`,
              },
              {
                id: 'history' as const,
                label: `History (${state.testHistory.length})`,
              },
              {
                id: 'mistakes' as const,
                label: `Mistakes (${unresolvedMistakes.length})`,
              },
              ...(!simpleMode
                ? [
                    {
                      id: 'resources' as const,
                      label: 'Importers & Resources',
                    },
                  ]
                : []),
            ].map((tab) => {
              const active = studioTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={(e) => {
                    setStudioTab(tab.id);
                    setMoreToolsOpen(false);
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      inline: 'center',
                      block: 'nearest',
                    });
                  }}
                  className={`shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold press-tactile ${
                    active
                      ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                      : 'text-[#61554D] dark:text-[#A99B8E] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {simpleMode ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreToolsOpen((o) => !o)}
              data-testid="pyq-more-tools-btn"
              aria-expanded={moreToolsOpen}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#EFE9DF] dark:hover:bg-[#312722] press-tactile whitespace-nowrap"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
              <span>More Tools</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${moreToolsOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {moreToolsOpen && (
              <div
                data-testid="pyq-more-tools-menu"
                className="absolute right-0 top-11 z-30 w-52 rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-1.5 shadow-warm-lg space-y-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMoreToolsOpen(false);
                    setImportErrors([]);
                    setImportSuccessMsg('');
                    setImportModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[14px] text-left text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]"
                >
                  <Upload className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                  Bulk Import JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreToolsOpen(false);
                    setStudioTab('resources');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[14px] text-left text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]"
                >
                  <BookOpen className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                  Importers &amp; Resources
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setImportErrors([]);
              setImportSuccessMsg('');
              setImportModalOpen(true);
            }}
            aria-label="Bulk Import JSON"
            title="Bulk Import JSON"
            className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#EFE9DF] dark:hover:bg-[#312722] press-tactile whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
            <span className="hidden sm:inline">Bulk Import JSON</span>
            <span className="sm:hidden">Import</span>
          </button>
        )}
      </div>

      {/* TAB 1: FLEXIBLE GATER CBT TEST BUILDER (+ CONCEPT DRILL BANNER) */}
      {studioTab === 'practice' && (
        <div className="space-y-4">
          {conceptDrillContext && conceptDrillContext.questions.length > 0 && (
            <div
              data-testid="concept-drill-banner"
              className="rounded-[24px] squircle border-2 border-[#C89216] dark:border-[#E0A92E] bg-[#FDF6E3] dark:bg-[#2C2215] p-4 sm:p-5 shadow-warm space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8B6209] dark:text-[#E0A92E]">
                    <Target className="h-3.5 w-3.5" />
                    <span>
                      {conceptDrillContext.usedSubjectFallback
                        ? `Showing ${SUBJECT_MAP[conceptDrillContext.subjectId]?.name ?? conceptDrillContext.subjectId.toUpperCase()} PYQs`
                        : 'Weighted Concept Drill Ready'}
                    </span>
                  </div>
                  <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    Concept Drill: {conceptDrillContext.cardTitle} ·{' '}
                    {conceptDrillContext.usedSubjectFallback
                      ? `Showing ${SUBJECT_MAP[conceptDrillContext.subjectId]?.code ?? ''} PYQs (${conceptDrillContext.questions.length})`
                      : `${conceptDrillContext.matchedCount} Matching PYQ${conceptDrillContext.matchedCount === 1 ? '' : 's'} Found`}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="start-concept-drill-btn"
                    onClick={() =>
                      startSession(
                        `Concept Drill · ${conceptDrillContext.cardTitle}`,
                        conceptDrillContext.questions,
                        'practice_sprint'
                      )
                    }
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#E0A92E] dark:text-[#1C1613] text-[#FAF8F4] text-xs font-bold press-tactile"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start Concept Drill ({conceptDrillContext.questions.length} Qs)
                  </button>
                  <button
                    type="button"
                    data-testid="clear-concept-drill-btn"
                    onClick={() => onClearConceptDrill?.()}
                    className="inline-flex items-center gap-1 h-9 px-3.5 rounded-full border border-[#E8E0D5] dark:border-[#5C441B] bg-[#FFFFFF] dark:bg-[#1C1714] text-xs font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:text-[#1C1613] press-tactile"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {conceptDrillContext.questions.slice(0, 4).map((q) => (
                  <span
                    key={q.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFFFFF]/90 dark:bg-[#1C1714] border border-[#EED89A] dark:border-[#5C441B] text-[11px] text-[#61554D] dark:text-[#D8CBB8]"
                  >
                    <span className="font-mono font-bold text-[#6E261A] dark:text-[#E0A92E]">
                      {q.paperTag || SUBJECT_MAP[q.subjectId]?.code}
                    </span>
                    <span className="truncate max-w-[200px]">{q.subtopic}</span>
                    <span className="font-mono text-[10px] opacity-75">{q.marks}M</span>
                  </span>
                ))}
                {conceptDrillContext.questions.length > 4 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                    +{conceptDrillContext.questions.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )}

          <PyqTestBuilder
            state={state}
            allQuestions={allQuestions}
            gaterSyncStatus={gaterSyncStatus}
            gaterCount={gaterCount}
            arshanCount={arshanCount}
            enrichedCount={enrichedCount}
            verifiedBankCount={verifiedBankCount}
            syncProgressMsg={syncProgressMsg}
            gaterSyncedAt={gaterSyncedAt}
            gaterError={gaterError}
            onResyncGateR={onResyncGateR}
            onStartSession={startSession}
            onStartDailyDpp={handleLaunchDailyDpp}
            gaStreakMetrics={gaStreakMetrics}
            onStartGaSprint={handleLaunchGaSprint}
            onRequestPdfExport={onRequestPdfExport}
            onNotify={onNotify}
          />
        </div>
      )}

      {/* TAB 2: TEST HISTORY & INLINE KEY RECALCULATION */}
      {studioTab === 'history' && (
        <section className="space-y-4" data-testid="pyq-test-history-panel">
          {state.testHistory.length === 0 ? (
            <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-12 text-center shadow-warm space-y-2">
              <History className="h-7 w-7 mx-auto text-[#C89216] dark:text-[#E0A92E]" />
              <p className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                No completed PYQ tests yet.
              </p>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E] max-w-md mx-auto">
                Finish any Practice Sprint, Timed CBT Mock, Daily DPP, or Daily GA session to save it here. You can enter or edit official answer keys anytime and scores recalculate instantly.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {state.testHistory.map((entry) => {
                const isExpanded = expandedHistoryId === entry.id;
                const scoreSummary = formatGradedScoreSummary(entry);
                const dateLabel = (() => {
                  const d = new Date(entry.completedAt);
                  return Number.isNaN(d.getTime())
                    ? entry.completedAt.slice(0, 10)
                    : d.toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                })();

                return (
                  <article
                    key={entry.id}
                    data-testid={`test-history-card-${entry.id}`}
                    className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 sm:p-5 shadow-warm space-y-3.5"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                          <span className="font-mono px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] font-semibold text-[#6E261A] dark:text-[#E0A92E]">
                            {entry.mode === 'daily_dpp'
                              ? 'Daily DPP'
                              : entry.mode === 'daily_ga'
                              ? 'Daily GA'
                              : entry.mode === 'timed'
                              ? 'CBT Mock'
                              : entry.mode === 'concept_drill'
                              ? 'Concept Drill'
                              : 'Practice Sprint'}
                          </span>
                          <span className="font-mono">{dateLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{entry.questionIds.length} Qs</span>
                          {entry.pendingKeyCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] font-bold">
                              <KeyRound className="h-3 w-3" />
                              {entry.pendingKeyCount} Pending Key
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-sm sm:text-base font-bold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                          {entry.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
                          <span
                            data-testid={`history-score-${entry.id}`}
                            className="font-bold text-[#6E261A] dark:text-[#E0A92E]"
                          >
                            {scoreSummary}
                          </span>
                          <span className="text-[#2E5E3E] dark:text-[#7BB88F] font-semibold">
                            Acc: {entry.gradedAttemptedCount > 0 ? `${entry.accuracyPct}%` : '—'}
                          </span>
                          {entry.penaltyMarks > 0 && (
                            <span className="text-[#B83227] dark:text-[#F08A80]">
                              Penalty: −{entry.penaltyMarks.toFixed(2)}M
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedHistoryId((curr) => (curr === entry.id ? null : entry.id))
                          }
                          data-testid={`toggle-history-keys-${entry.id}`}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216] press-tactile"
                        >
                          <KeyRound className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                          {isExpanded ? 'Hide Questions' : 'Inspect & Edit Keys'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenHistoryReview(entry)}
                          className="inline-flex items-center gap-1 h-8 px-3.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                        >
                          Full Review
                        </button>
                        {onDeleteTestHistory && (
                          <button
                            type="button"
                            onClick={() => onDeleteTestHistory(entry.id)}
                            aria-label={`Delete test history entry ${entry.title}`}
                            className="p-2 rounded-full text-[#8C7E75] hover:text-[#B83227] hover:bg-[#FBEAE8] dark:hover:bg-[#3A1E1B]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pt-3 border-t border-[#E8E0D5] dark:border-[#2E2520] space-y-2.5">
                        {entry.questionIds.map((qid, qIdx) => {
                          const q = questionById.get(qid);
                          if (!q) return null;
                          const savedAns = entry.responses[qid] ?? '';
                          const respObj = parseSerializedResponse(q.format, savedAns);
                          const ev = evaluateQuestionStrict(q, respObj);
                          const hasKey = hasVerifiedAnswerKey(q);
                          const isVerifying = Boolean(historyVerifyingIds[q.id]);
                          const keyDisplay =
                            q.format === 'MCQ'
                              ? q.correctOption ?? ''
                              : q.format === 'MSQ'
                              ? q.correctOptions?.join(', ') ?? ''
                              : q.natAnswer !== undefined
                              ? String(q.natAnswer)
                              : '';

                          return (
                            <div
                              key={qid}
                              className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-3.5 space-y-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                                    Q{qIdx + 1}
                                  </span>
                                  <span className="font-mono px-2 py-0.5 rounded-full bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] text-[#6E261A] dark:text-[#E0A92E] font-semibold">
                                    {SUBJECT_MAP[q.subjectId]?.code ?? q.subjectId.toUpperCase()} · {q.format} · {q.marks}M
                                  </span>
                                  <span className="text-[#61554D] dark:text-[#D8CBB8] truncate max-w-[220px]">
                                    {q.subtopic}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                                  <span className="text-[#61554D] dark:text-[#A99B8E]">
                                    Yours: <strong className="text-[#1C1613] dark:text-[#F5F0E8]">{savedAns || 'Skipped'}</strong>
                                  </span>
                                  {ev.status === 'pending_key' ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] font-bold">
                                      Pending Answer Key
                                    </span>
                                  ) : ev.status === 'correct' ? (
                                    <span className="inline-flex items-center gap-1 text-[#2E5E3E] dark:text-[#7BB88F] font-bold">
                                      <CheckCircle2 className="h-3.5 w-3.5" />+{ev.marksAwarded}M
                                    </span>
                                  ) : ev.status === 'wrong' ? (
                                    <span className="inline-flex items-center gap-1 text-[#B83227] dark:text-[#F08A80] font-bold">
                                      <XCircle className="h-3.5 w-3.5" />
                                      {ev.marksAwarded}M
                                    </span>
                                  ) : (
                                    <span className="text-[#8C7E75]">Unattempted</span>
                                  )}
                                  {hasKey && (
                                    <span className="px-2 py-0.5 rounded-full bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8] font-bold">
                                      Key: {keyDisplay}
                                    </span>
                                  )}
                                  {hasGateOverflowUrl(q) && (
                                    <a
                                      href={q.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[#6E261A] dark:text-[#E0A92E] font-semibold hover:underline"
                                    >
                                      GateOverflow ↗
                                    </a>
                                  )}
                                </div>
                              </div>

                              {/* Inline Official Key Input + Verify with AI */}
                              <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-[#E8E0D5]/70 dark:border-[#352A24]">
                                <input
                                  type="text"
                                  aria-label={`Official answer key for Q${qIdx + 1}`}
                                  data-testid={`history-key-input-${q.id}`}
                                  value={historyKeyDrafts[q.id] ?? keyDisplay}
                                  onChange={(e) =>
                                    setHistoryKeyDrafts((prev) => ({
                                      ...prev,
                                      [q.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={
                                    q.format === 'MCQ'
                                      ? 'Key (e.g. B)'
                                      : q.format === 'MSQ'
                                      ? 'Keys (e.g. A, C)'
                                      : 'NAT value (e.g. 42.5)'
                                  }
                                  className="h-8 w-36 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                                />
                                <button
                                  type="button"
                                  data-testid={`history-save-key-btn-${q.id}`}
                                  onClick={() => void handleSaveHistoryKey(q)}
                                  className="h-8 px-3 rounded-full border border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-xs font-semibold text-[#8B6209] dark:text-[#E0A92E] press-tactile"
                                >
                                  {hasKey ? 'Update Key' : 'Save Official Key'}
                                </button>
                                {!hasKey && (
                                  <button
                                    type="button"
                                    disabled={isVerifying}
                                    onClick={() => void handleAiVerifyHistoryQuestion(q)}
                                    className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-[#241914] dark:bg-[#E0A92E] text-[#FAF5EB] dark:text-[#1C1613] text-xs font-semibold disabled:opacity-50 press-tactile"
                                  >
                                    {isVerifying ? (
                                      <RefreshCw className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3 w-3" />
                                    )}
                                    {isVerifying ? 'Verifying...' : 'Verify with AI'}
                                  </button>
                                )}
                                {historyKeySaved[q.id] && (
                                  <span className="text-[11px] font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
                                    Recalculated!
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: MISTAKE BUCKET */}
      {studioTab === 'mistakes' && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5 sm:p-4 shadow-warm">
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 -mx-1">
              <button
                type="button"
                onClick={() => setMistakeFilter('unresolved')}
                className={`shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold press-tactile ${
                  mistakeFilter === 'unresolved'
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white'
                    : 'border border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                Unresolved ({unresolvedMistakes.length})
              </button>
              <button
                type="button"
                onClick={() => setMistakeFilter('all')}
                className={`shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold press-tactile ${
                  mistakeFilter === 'all'
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white'
                    : 'border border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                All Captured ({mistakeEntries.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={mistakeEntries.length === 0}
                onClick={() => {
                  const list = mistakeEntries
                    .filter((m) => mistakeFilter === 'all' || !m.entry.resolved)
                    .map((m) => m.question);
                  if (list.length === 0) return;
                  onRequestPdfExport({
                    kind: 'test-pack',
                    title: `Mistake Bucket Review Booklet (${list.length} Qs)`,
                    subtitle: mistakeFilter === 'unresolved' ? 'Unresolved Mistakes' : 'All Captured Mistakes',
                    questions: list,
                    defaultLayout: 'solutions',
                    mistakeMap: state.mistakes,
                    savedSketches: state.savedSketches,
                    savedTraceTables: state.traceTables,
                  });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216] text-xs font-semibold disabled:opacity-40 press-tactile"
              >
                <FileDown className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                Export Mistake PDF
              </button>
              <button
                type="button"
                disabled={mistakeEntries.length === 0}
                onClick={handleLaunchMistakeDrill}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold disabled:opacity-40 press-tactile"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-Attempt Unresolved
              </button>
            </div>
          </div>

          {mistakeEntries.filter((m) => mistakeFilter === 'all' || !m.entry.resolved).length === 0 ? (
            <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-12 text-center shadow-warm">
              <p className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Mistake Bucket is clear.
              </p>
              <p className="mt-1 text-xs text-[#61554D] dark:text-[#A99B8E]">
                Wrong answers and self-marked misses from any PYQ CBT or Sprint session appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mistakeEntries
                .filter((m) => mistakeFilter === 'all' || !m.entry.resolved)
                .map(({ entry, question }) => {
                  const savedSketch = state.savedSketches[question.id];
                  return (
                    <article
                      key={question.id}
                      className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#61554D] dark:text-[#A99B8E]">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] font-mono font-bold text-[#6E261A] dark:text-[#E0A92E]">
                            {SUBJECT_MAP[question.subjectId].code}
                          </span>
                          {question.paperTag && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] font-mono text-[11px] font-semibold">
                              {question.paperTag}
                            </span>
                          )}
                          <span>{question.subtopic}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{question.format}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              entry.resolved
                                ? 'text-[#2E5E3E] dark:text-[#7BB88F] font-semibold'
                                : 'text-[#B83227] dark:text-[#F08A80] font-semibold'
                            }
                          >
                            {entry.resolved ? 'Resolved' : `Missed ${entry.wrongCount}×`}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {hasGateOverflowUrl(question) && (
                            <a
                              href={question.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[11px] font-semibold text-[#8B6209] dark:text-[#E0A92E] hover:bg-[#F7EAC2] no-underline!"
                            >
                              GateOverflow ↗
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}

                          <select
                            value={entry.errorTag}
                            onChange={(e) =>
                              onUpdateMistakeTag(question.id, e.target.value as ErrorTag)
                            }
                            aria-label={`Error classification for ${question.subtopic}`}
                            className="h-8 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-3 text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8]"
                          >
                            {ERROR_TAGS.map((tag) => (
                              <option key={tag} value={tag}>
                                {tag}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => onToggleMistakeResolved(question.id)}
                            className={`h-8 px-3 rounded-full border text-xs font-semibold press-tactile ${
                              entry.resolved
                                ? 'border-[#2E5E3E] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                                : 'border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                            }`}
                          >
                            {entry.resolved ? 'Reopen' : 'Mark Resolved'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onRequestPdfExport({
                                kind: 'single-question',
                                question,
                                sketchDataUrl: savedSketch,
                                traceTable: state.traceTables[question.id],
                                mistakeTag: entry.errorTag,
                                mistakeNote: entry.userNote,
                              })
                            }
                            aria-label={`Export ${question.subtopic} as PDF`}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216] press-tactile"
                          >
                            <FileDown className="h-3 w-3 text-[#6E261A] dark:text-[#E0A92E]" />
                            PDF
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              startSession(
                                `Single Re-Attempt · ${SUBJECT_MAP[question.subjectId].code}`,
                                [question],
                                'practice_sprint'
                              )
                            }
                            className="h-8 px-3.5 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                          >
                            Retry
                          </button>
                        </div>
                      </div>

                      <div className="max-h-44 overflow-y-auto pr-1">
                        <RichQuestionContent
                          html={question.bodyHtml}
                          plainText={question.prompt}
                          className="text-sm"
                        />
                      </div>

                      <input
                        type="text"
                        value={entry.userNote ?? ''}
                        onChange={(e) => onUpdateMistakeNote(question.id, e.target.value)}
                        placeholder="Add root-cause patch note (why you missed this)..."
                        aria-label={`Root cause note for ${question.subtopic}`}
                        className="w-full h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] text-xs text-[#1C1613] dark:text-[#F5F0E8] placeholder-[#8C7E75]"
                      />

                      {savedSketch && (
                        <div className="pt-1">
                          <div className="text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E] mb-1.5">
                            Saved Rough Work:
                          </div>
                          <img
                            src={savedSketch}
                            alt="Saved rough work"
                            className="max-h-36 rounded-[16px] border border-[#E8E0D5] dark:border-[#2E2520] bg-white"
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: IMPORTERS & OPEN GO CLASSES / GATE OVERFLOW DIRECTORY */}
      {studioTab === 'resources' && (
        <section className="space-y-5">
          {/* Free-Tier Importers Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* One-Click Public URL Importer */}
            <div
              data-testid="public-url-importer"
              className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                <Link2 className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
                <span>One-Click Public URL Importer</span>
              </div>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E] leading-relaxed">
                Paste any public <span className="font-mono">gateoverflow.in</span> or open{' '}
                <span className="font-mono">goclasses.in</span> URL to extract structured MCQ/MSQ/NAT
                questions and step-by-step proofs straight into your synced bank.
              </p>
              <form onSubmit={(e) => void handleIngestUrlSubmit(e)} className="space-y-2.5">
                <input
                  type="url"
                  required
                  value={publicUrlInput}
                  onChange={(e) => setPublicUrlInput(e.target.value)}
                  placeholder="https://gateoverflow.in/..."
                  aria-label="Public GATE Overflow or GO Classes URL"
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8] placeholder-[#8C7E75]"
                />
                <button
                  type="submit"
                  data-testid="ingest-url-submit"
                  disabled={urlIngestLoading}
                  className="w-full h-10 rounded-full border border-[#DFB8AE] dark:border-[#632A20] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#E59283] hover:bg-[#F2DDD7] text-xs font-semibold disabled:opacity-50 press-tactile"
                >
                  {urlIngestLoading ? 'Extracting Questions...' : 'Extract & Save to Bank'}
                </button>
              </form>
              {urlFeedback && (
                <p
                  data-testid="ingest-url-feedback"
                  className={`text-xs font-mono ${
                    urlFeedback.type === 'ok'
                      ? 'text-[#2E5E3E] dark:text-[#7BB88F]'
                      : 'text-[#B83227] dark:text-[#F08A80]'
                  }`}
                >
                  {urlFeedback.msg}
                </p>
              )}
            </div>

            {/* Per-Subject PYQ Fetcher */}
            <div
              data-testid="subject-pyq-fetcher"
              className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    Fetch More Subject PYQs
                  </h3>
                  <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                    Pulls 5 unseen GATE 2024–2026 PYQs with automatic deduplication.
                  </p>
                </div>
                {quotaNotice && (
                  <span className="font-mono text-[11px] text-[#8B6209] dark:text-[#E0A92E]">
                    {quotaNotice}
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <select
                  aria-label="Choose subject to fetch 5 more PYQs"
                  value={fetchSubjectId}
                  onChange={(e) => setFetchSubjectId(e.target.value as SubjectId)}
                  className="flex-1 h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {GATE_2027_SYLLABUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  data-testid="fetch-5-pyqs-btn"
                  disabled={subjectFetching !== null || activeCooldownRemaining > 0}
                  onClick={() => void handleFetch5SubjectPyqs()}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] hover:bg-[#F7EAC2] text-xs font-semibold text-[#8B6209] dark:text-[#E0A92E] disabled:opacity-50 press-tactile whitespace-nowrap"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${subjectFetching === fetchSubjectId ? 'animate-spin' : ''}`}
                  />
                  {subjectFetching === fetchSubjectId
                    ? 'Fetching 5 PYQs...'
                    : activeCooldownRemaining > 0
                    ? `Cooldown (${activeCooldownRemaining}s)`
                    : 'Fetch 5 More PYQs'}
                </button>
              </div>

              {fetchFeedback && (
                <p
                  className={`text-xs font-mono ${
                    fetchFeedback.type === 'ok'
                      ? 'text-[#2E5E3E] dark:text-[#7BB88F]'
                      : 'text-[#8B6209] dark:text-[#E0A92E]'
                  }`}
                >
                  {fetchFeedback.msg}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Open GO Classes &amp; GATE Overflow Directory
              </h2>
              <p className="text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E] mt-1">
                Verified openly accessible courses, DPPs, and community-vetted GATE PYQ archives. Expand your local PYQ Studio anytime using Bulk JSON Import.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              Import Custom PYQs (.json)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {OPEN_RESOURCES.map((res) => (
              <a
                key={res.id}
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm card-lift flex flex-col justify-between gap-3 no-underline!"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                      <span className="font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                        {res.provider}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{res.tag}</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-[#8C7E75] group-hover:text-[#6E261A] dark:group-hover:text-[#E0A92E] shrink-0" />
                  </div>
                  <h3 className="mt-2 font-display text-[15px] font-bold text-[#1C1613] dark:text-[#F5F0E8] group-hover:text-[#6E261A] dark:group-hover:text-[#E0A92E] transition-colors">
                    {res.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#61554D] dark:text-[#A99B8E] leading-relaxed">
                    {res.description}
                  </p>
                </div>
                <div className="text-[11px] font-mono text-[#8B6209] dark:text-[#E0A92E]">
                  {res.subjectsCovered}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* BULK JSON QUESTION IMPORTER MODAL */}
      {importModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1613]/50 p-4"
          onClick={() => setImportModalOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Bulk JSON Question Importer"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] shadow-warm-lg overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19]">
              <div>
                <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Bulk JSON Question Importer
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                  Paste or upload a JSON array of GATE MCQ / MSQ / NAT questions to permanently add to your studio bank.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                aria-label="Close importer modal"
                className="p-1.5 rounded-full text-[#61554D] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportText(SAMPLE_IMPORT_JSON);
                      setImportErrors([]);
                    }}
                    className="px-3.5 py-1.5 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    Load Sample JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSample}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Template
                  </button>
                </div>

                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#DFB8AE] dark:border-[#632A20] bg-[#F8EAE6] dark:bg-[#331A16] text-xs font-semibold text-[#6E261A] dark:text-[#E59283] cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  Upload .json
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileImport}
                    className="sr-only"
                  />
                </label>
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={10}
                placeholder='[{"subjectId": "algo", "subtopic": "MST", "format": "NAT", "marks": 2, "prompt": "...", "natAnswer": 16}]'
                aria-label="JSON question payload"
                className="w-full rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] p-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
              />

              {importErrors.length > 0 && (
                <div className="rounded-[20px] border border-[#EBC7C3] dark:border-[#5E2823] bg-[#FBEAE8] dark:bg-[#3A1E1B] p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#B83227] dark:text-[#F08A80]">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Schema Validation Failed
                  </div>
                  {importErrors.map((err, i) => (
                    <p key={i} className="text-xs font-mono text-[#8E2219] dark:text-[#F5ABA3]">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              {importSuccessMsg && (
                <div className="rounded-[20px] border border-[#B9D6C2] dark:border-[#254A33] bg-[#EBF5EE] dark:bg-[#152B1D] p-3.5 text-xs font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
                  {importSuccessMsg}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleRunImport}
                  className="px-5 py-2 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                >
                  Validate &amp; Import Questions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
