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
} from 'lucide-react';
import type {
  DryRunTraceTable,
  ErrorTag,
  GateRSyncStatus,
  PdfExportRequest,
  Question,
  SubjectId,
  VerifiedAnswerRecord,
  WarRoomState,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import { OPEN_RESOURCES, SAMPLE_IMPORT_JSON } from '../data/resources';
import {
  generateMixedDppQuestions,
  validateImportedQuestionsJson,
} from '../utils/gateMath';
import {
  computeGaStreakMetrics,
  selectDailyGaSprintQuestions,
} from '../utils/gaStreak';
import type { SubjectFetchResult, UrlIngestResult } from '../hooks/useWarRoomStore';
import { PyqTestBuilder, type SessionMode } from './PyqTestBuilder';
import { PyqCbtSession, type ActiveCbtSession } from './PyqCbtSession';
import { RichQuestionContent } from './RichQuestionContent';

interface PyqStudioViewProps {
  state: WarRoomState;
  allQuestions: Question[];
  autoStartDppTrigger: number;
  autoStartGaSprintTrigger?: number;
  openMistakesTrigger?: number;
  launchSketchpadSprintTrigger?: number;
  gaterSyncStatus: GateRSyncStatus;
  gaterCount: number;
  gaterSyncedAt: string;
  gaterError: string;
  subjectFetching: SubjectId | null;
  subjectCooldownUntil: Record<string, number>;
  urlIngestLoading: boolean;
  quotaNotice: string;
  onResyncGateR: () => Promise<unknown>;
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
  onSessionStateChange?: (info: {
    active: boolean;
    isTimed: boolean;
    finished: boolean;
    title: string;
    sketchpadOpen: boolean;
    studioTab: 'practice' | 'mistakes' | 'resources';
  }) => void;
  exitSessionTrigger?: number;
  resetStudioTabTrigger?: number;
}

type StudioTab = 'practice' | 'mistakes' | 'resources';

const ERROR_TAGS: ErrorTag[] = [
  'Conceptual Gap',
  'Silly Math',
  'MSQ Trap',
  'Time Pressure',
];

export const PyqStudioView: React.FC<PyqStudioViewProps> = ({
  state,
  allQuestions,
  autoStartDppTrigger,
  autoStartGaSprintTrigger = 0,
  openMistakesTrigger = 0,
  launchSketchpadSprintTrigger = 0,
  gaterSyncStatus,
  gaterCount,
  gaterSyncedAt,
  gaterError,
  subjectFetching,
  subjectCooldownUntil,
  urlIngestLoading,
  quotaNotice,
  onResyncGateR,
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
  onSessionStateChange,
  exitSessionTrigger = 0,
  resetStudioTabTrigger = 0,
}) => {
  const [studioTab, setStudioTab] = useState<StudioTab>('practice');
  const [session, setSession] = useState<ActiveCbtSession | null>(null);
  const [sketchpadOpen, setSketchpadOpen] = useState<boolean>(false);

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
    const inSyllabus = allQuestions.filter((q) => !q.isOutOf2027Syllabus);
    const dpp = generateMixedDppQuestions(
      inSyllabus.length >= 10 ? inSyllabus : allQuestions,
      GATE_2027_SYLLABUS,
      state.progress,
      state.attempts,
      10
    );
    startSession('Daily Mixed DPP · 10 High-ROI Questions', dpp, 'cbt_mock');
  }, [allQuestions, state.progress, state.attempts, startSession]);

  const handleLaunchGaSprint = useCallback(() => {
    const gaPool = selectDailyGaSprintQuestions(allQuestions, state.attempts, 5);
    const chosen = gaPool.length > 0 ? gaPool : allQuestions.slice(0, 5);
    if (chosen.length === 0) return;
    setStudioTab('practice');
    setSession({
      title: `Daily 10-Min GA Lock-In Sprint (${chosen.length} Qs)`,
      mode: 'cbt_mock',
      questions: chosen,
      secondsRemaining: 600,
      elapsedSeconds: 0,
      questionSeconds: {},
      currentIndex: 0,
      responses: {},
      checked: {},
      markedForReview: {},
      visited: { [chosen[0].id]: true },
      finished: false,
      isGaSprint: true,
    });
  }, [allQuestions, state.attempts]);

  // Auto-launch Daily Mixed DPP when triggered from Dashboard or Command Palette
  useEffect(() => {
    if (autoStartDppTrigger > 0) {
      handleLaunchDailyDpp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartDppTrigger]);

  // Auto-launch Daily 10-Min GA Lock-In Sprint when triggered from Dashboard or Command Palette
  useEffect(() => {
    if (autoStartGaSprintTrigger > 0) {
      handleLaunchGaSprint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartGaSprintTrigger]);

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
        onSaveVerifiedAnswer={onSaveVerifiedAnswer}
        onVerifySinglePyq={onVerifySinglePyq}
        onToggleCalculator={onToggleCalculator}
        zenMode={zenMode}
        onToggleZenMode={onToggleZenMode}
        onRequestPdfExport={onRequestPdfExport}
      />
    );
  }

  // ===================== STUDIO LOBBY / MISTAKE BUCKET / OPEN RESOURCES =====================
  return (
    <div className="space-y-6">
      {/* Studio Sub-Navigation Pill Bar (Single-row horizontal rail on mobile, zero vertical stacking) */}
      <div className="flex flex-nowrap items-center justify-between gap-2 rounded-[24px] sm:rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 sm:px-5 py-2.5 sm:py-3.5 shadow-warm">
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
                id: 'mistakes' as const,
                label: `Mistakes (${unresolvedMistakes.length})`,
              },
              {
                id: 'resources' as const,
                label: 'Importers & Resources',
              },
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
      </div>

      {/* TAB 1: FLEXIBLE GATER CBT TEST BUILDER */}
      {studioTab === 'practice' && (
        <PyqTestBuilder
          state={state}
          allQuestions={allQuestions}
          gaterSyncStatus={gaterSyncStatus}
          gaterCount={gaterCount}
          gaterSyncedAt={gaterSyncedAt}
          gaterError={gaterError}
          onResyncGateR={onResyncGateR}
          onStartSession={startSession}
          onStartDailyDpp={handleLaunchDailyDpp}
          gaStreakMetrics={gaStreakMetrics}
          onStartGaSprint={handleLaunchGaSprint}
          onRequestPdfExport={onRequestPdfExport}
        />
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
                          {question.sourceUrl && (
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

                      {question.bodyHtml ? (
                        <div className="max-h-44 overflow-y-auto pr-1">
                          <RichQuestionContent html={question.bodyHtml} />
                        </div>
                      ) : (
                        <p className="text-sm text-[#1C1613] dark:text-[#F5F0E8] leading-relaxed">
                          {question.prompt}
                        </p>
                      )}

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

            {/* Per-Subject Free-Tier Fetcher */}
            <div
              data-testid="subject-pyq-fetcher"
              className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    Fetch More Subject PYQs (Free-Tier Grounded)
                  </h3>
                  <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                    Cache-first · Pulls 5 unseen GATE 2024–2026 PYQs with strict deduplication &amp; 45s cooldown.
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
