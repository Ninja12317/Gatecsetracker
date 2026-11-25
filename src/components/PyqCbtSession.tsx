import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bookmark,
  PenTool,
  Calculator,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Flag,
  Sparkles,
  Check,
  X,
  AlertTriangle,
  KeyRound,
  RefreshCw,
  Maximize2,
  Minimize2,
  FileDown,
  Clock,
  LayoutGrid,
} from 'lucide-react';
import type {
  DryRunTraceTable,
  ErrorTag,
  PdfExportRequest,
  Question,
  VerifiedAnswerRecord,
  WarRoomState,
} from '../types';
import { SUBJECT_MAP } from '../data/syllabus';
import { evaluateQuestionResponse, type EvaluationResult } from '../utils/gateMath';
import { applyVerifiedAnswer } from '../utils/gaterNormalizer';
import {
  computeSprintPaceAnalytics,
  formatPaceDuration,
  isSlowPaceQuestion,
} from '../utils/examPolish';
import { SketchpadStudioPanel } from './SketchpadStudioPanel';
import { CodeBlock } from './CodeBlock';
import { RichQuestionContent } from './RichQuestionContent';
import type { SessionMode } from './PyqTestBuilder';

export interface UserResponse {
  selectedOption?: string;
  selectedOptions?: string[];
  natValue?: string;
}

export interface ActiveCbtSession {
  title: string;
  mode: SessionMode;
  questions: Question[];
  secondsRemaining: number;
  elapsedSeconds: number;
  questionSeconds: Record<string, number>;
  currentIndex: number;
  responses: Record<string, UserResponse>;
  checked: Record<string, EvaluationResult & { selfChecked?: boolean }>;
  markedForReview: Record<string, boolean>;
  visited: Record<string, boolean>;
  finished: boolean;
  isGaSprint?: boolean;
}

interface PyqCbtSessionProps {
  session: ActiveCbtSession;
  setSession: React.Dispatch<React.SetStateAction<ActiveCbtSession | null>>;
  state: WarRoomState;
  sketchpadOpen: boolean;
  setSketchpadOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onExit: () => void;
  onRecordAttempt: (
    questionId: string,
    isCorrect: boolean,
    marksAwarded: number,
    maxMarks: number,
    selectedAnswer?: string
  ) => void;
  onToggleBookmark: (questionId: string) => void;
  onUpdateMistakeTag: (questionId: string, tag: ErrorTag) => void;
  onSaveSketch: (questionId: string, dataUrl: string) => void;
  onDeleteSketch: (questionId: string) => void;
  onSaveTraceTable: (questionId: string, table: DryRunTraceTable) => void;
  onDeleteTraceTable: (questionId: string) => void;
  onCompleteGaSprint?: (payload: {
    questionsCount: number;
    correctCount: number;
    marksAwarded: number;
    maxMarks: number;
    accuracyPct: number;
    durationSeconds: number;
  }) => void;
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
  onToggleCalculator: () => void;
  zenMode: boolean;
  onToggleZenMode: () => void;
  onRequestPdfExport: (req: PdfExportRequest) => void;
}

const ERROR_TAGS: ErrorTag[] = [
  'Conceptual Gap',
  'Silly Math',
  'MSQ Trap',
  'Time Pressure',
];

function formatTimer(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSelectedAnswer(resp?: UserResponse): string {
  if (!resp) return '';
  if (resp.selectedOption) return resp.selectedOption;
  if (resp.selectedOptions && resp.selectedOptions.length > 0) {
    return [...resp.selectedOptions].sort().join(',');
  }
  if (resp.natValue && resp.natValue.trim() !== '') return resp.natValue.trim();
  return '';
}

function hasAnswerResponse(resp?: UserResponse): boolean {
  return formatSelectedAnswer(resp).length > 0;
}

function questionHasKey(q: Question): boolean {
  if (q.hasAnswerKey === true) return true;
  if (q.format === 'MCQ') return Boolean(q.correctOption);
  if (q.format === 'MSQ') return Boolean(q.correctOptions && q.correctOptions.length > 0);
  return typeof q.natAnswer === 'number' && Number.isFinite(q.natAnswer);
}

export const PyqCbtSession: React.FC<PyqCbtSessionProps> = ({
  session,
  setSession,
  state,
  sketchpadOpen,
  setSketchpadOpen,
  onExit,
  onRecordAttempt,
  onToggleBookmark,
  onUpdateMistakeTag,
  onSaveSketch,
  onDeleteSketch,
  onSaveTraceTable,
  onDeleteTraceTable,
  onCompleteGaSprint,
  onSaveVerifiedAnswer,
  onVerifySinglePyq,
  onToggleCalculator,
  zenMode,
  onToggleZenMode,
  onRequestPdfExport,
}) => {
  const [verifyingIds, setVerifyingIds] = useState<Record<string, boolean>>({});
  const [verifyFeedback, setVerifyFeedback] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [manualKeyDrafts, setManualKeyDrafts] = useState<Record<string, string>>({});
  const [manualKeySaved, setManualKeySaved] = useState<Record<string, boolean>>({});
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  // Merge latest verifiedAnswers onto session questions dynamically without resetting session state
  const liveQuestions = useMemo(() => {
    return session.questions.map((q) => {
      const verified = state.verifiedAnswers[q.id];
      return verified ? applyVerifiedAnswer(q, verified) : q;
    });
  }, [session.questions, state.verifiedAnswers]);

  const currentQ = liveQuestions[session.currentIndex];
  const isTimedMock = session.mode === 'cbt_mock';

  // Active CBT Session Clock + Per-Question Pace Tracker
  useEffect(() => {
    if (session.finished) return;
    const id = window.setInterval(() => {
      setSession((prev) => {
        if (!prev || prev.finished) return prev;
        const activeId = prev.questions[prev.currentIndex]?.id;
        const nextQuestionSeconds = activeId
          ? {
              ...prev.questionSeconds,
              [activeId]: (prev.questionSeconds?.[activeId] ?? 0) + 1,
            }
          : prev.questionSeconds;

        if (prev.mode === 'cbt_mock') {
          if (prev.secondsRemaining <= 1) {
            return {
              ...prev,
              secondsRemaining: 0,
              elapsedSeconds: prev.elapsedSeconds + 1,
              questionSeconds: nextQuestionSeconds,
            };
          }
          return {
            ...prev,
            secondsRemaining: prev.secondsRemaining - 1,
            elapsedSeconds: prev.elapsedSeconds + 1,
            questionSeconds: nextQuestionSeconds,
          };
        }
        return {
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1,
          questionSeconds: nextQuestionSeconds,
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.finished, session.mode, setSession]);

  // Keyboard shortcuts: N / P, S (sketchpad), C (calculator), B (bookmark), F (Zen Fullscreen)
  useEffect(() => {
    if (session.finished || !(state.settings.enableKeyboardShortcuts ?? true)) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        setSession((prev) => {
          if (!prev) return prev;
          const nextIdx = Math.min(prev.questions.length - 1, prev.currentIndex + 1);
          const nextId = prev.questions[nextIdx]?.id;
          return {
            ...prev,
            currentIndex: nextIdx,
            visited: nextId ? { ...prev.visited, [nextId]: true } : prev.visited,
          };
        });
      } else if (key === 'p') {
        e.preventDefault();
        setSession((prev) => {
          if (!prev) return prev;
          const prevIdx = Math.max(0, prev.currentIndex - 1);
          const prevId = prev.questions[prevIdx]?.id;
          return {
            ...prev,
            currentIndex: prevIdx,
            visited: prevId ? { ...prev.visited, [prevId]: true } : prev.visited,
          };
        });
      } else if (key === 's') {
        e.preventDefault();
        setSketchpadOpen((o) => !o);
      } else if (key === 'c') {
        e.preventDefault();
        onToggleCalculator();
      } else if (key === 'b') {
        e.preventDefault();
        if (currentQ) onToggleBookmark(currentQ.id);
      } else if (key === 'f') {
        e.preventDefault();
        onToggleZenMode();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    session.finished,
    state.settings.enableKeyboardShortcuts,
    currentQ,
    setSession,
    setSketchpadOpen,
    onToggleBookmark,
    onToggleCalculator,
    onToggleZenMode,
  ]);

  const jumpToIndex = useCallback(
    (idx: number) => {
      setSession((prev) => {
        if (!prev) return prev;
        const clamped = Math.max(0, Math.min(prev.questions.length - 1, idx));
        const targetId = prev.questions[clamped]?.id;
        return {
          ...prev,
          currentIndex: clamped,
          visited: targetId ? { ...prev.visited, [targetId]: true } : prev.visited,
        };
      });
    },
    [setSession]
  );

  const updateResponse = useCallback(
    (questionId: string, patch: UserResponse) => {
      setSession((prev) => {
        if (!prev) return prev;
        if (prev.mode === 'practice_sprint' && prev.checked[questionId]) return prev;
        return {
          ...prev,
          responses: {
            ...prev.responses,
            [questionId]: patch,
          },
        };
      });
    },
    [setSession]
  );

  const toggleMarkForReview = useCallback(
    (questionId: string, advance = false) => {
      setSession((prev) => {
        if (!prev) return prev;
        const nextIdx = advance
          ? Math.min(prev.questions.length - 1, prev.currentIndex + 1)
          : prev.currentIndex;
        const nextId = prev.questions[nextIdx]?.id;
        return {
          ...prev,
          currentIndex: nextIdx,
          markedForReview: {
            ...prev.markedForReview,
            [questionId]: advance ? true : !prev.markedForReview[questionId],
          },
          visited: nextId ? { ...prev.visited, [nextId]: true } : prev.visited,
        };
      });
    },
    [setSession]
  );

  const handleCheckPracticeQuestion = useCallback(
    (q: Question) => {
      const resp = session.responses[q.id] ?? {};
      const selText = formatSelectedAnswer(resp);

      if (questionHasKey(q)) {
        const evalRes = evaluateQuestionResponse(q, resp);
        if (evalRes.attempted) {
          onRecordAttempt(q.id, evalRes.isCorrect, evalRes.marksAwarded, evalRes.maxMarks, selText);
        }
        setSession((prev) =>
          prev
            ? {
                ...prev,
                checked: { ...prev.checked, [q.id]: evalRes },
              }
            : prev
        );
      } else {
        // Reveal review panel with GateOverflow Solution + Self-Check + AI Verify
        setSession((prev) =>
          prev
            ? {
                ...prev,
                checked: {
                  ...prev.checked,
                  [q.id]: {
                    attempted: hasAnswerResponse(resp),
                    isCorrect: false,
                    marksAwarded: 0,
                    maxMarks: q.marks,
                    selfChecked: false,
                  },
                },
              }
            : prev
        );
      }
    },
    [session.responses, onRecordAttempt, setSession]
  );

  const handleSelfCheck = useCallback(
    (q: Question, gotItRight: boolean) => {
      const resp = session.responses[q.id] ?? {};
      const selText = formatSelectedAnswer(resp);
      let marksAwarded = 0;
      if (gotItRight) {
        marksAwarded = q.marks;
      } else if (q.format === 'MCQ') {
        marksAwarded = Number((q.marks === 1 ? -1 / 3 : -2 / 3).toFixed(2));
      } else {
        marksAwarded = 0;
      }

      onRecordAttempt(q.id, gotItRight, marksAwarded, q.marks, selText);

      setSession((prev) =>
        prev
          ? {
              ...prev,
              checked: {
                ...prev.checked,
                [q.id]: {
                  attempted: true,
                  isCorrect: gotItRight,
                  marksAwarded,
                  maxMarks: q.marks,
                  selfChecked: true,
                },
              },
            }
          : prev
      );
    },
    [session.responses, onRecordAttempt, setSession]
  );

  const handleSaveManualKey = useCallback(
    async (q: Question) => {
      const raw = (manualKeyDrafts[q.id] ?? '').trim();
      if (!raw) return;

      let record: Omit<VerifiedAnswerRecord, 'updatedAt'> | null = null;
      if (q.format === 'MCQ') {
        const clean = raw.toUpperCase().replace(/[^A-E]/g, '').slice(0, 1);
        if (!clean) return;
        record = {
          questionId: q.id,
          format: 'MCQ',
          correctOption: clean,
          explanation: q.explanation || 'Official answer key saved by user from GateOverflow.',
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
          explanation: q.explanation || 'Official MSQ answer key saved by user from GateOverflow.',
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
          explanation: q.explanation || 'Official NAT answer key saved by user from GateOverflow.',
          wrongOptionAnalysis: q.wrongOptionAnalysis || '',
          source: 'manual',
        };
      }

      const saved = await onSaveVerifiedAnswer(record);
      setManualKeySaved((prev) => ({ ...prev, [q.id]: true }));

      // Re-evaluate user's response automatically with the newly saved key
      const updatedQ = applyVerifiedAnswer(q, saved);
      const resp = session.responses[q.id] ?? {};
      const evalRes = evaluateQuestionResponse(updatedQ, resp);
      if (evalRes.attempted) {
        onRecordAttempt(
          q.id,
          evalRes.isCorrect,
          evalRes.marksAwarded,
          evalRes.maxMarks,
          formatSelectedAnswer(resp)
        );
      }
      setSession((prev) =>
        prev
          ? {
              ...prev,
              checked: { ...prev.checked, [q.id]: evalRes },
            }
          : prev
      );
    },
    [manualKeyDrafts, onSaveVerifiedAnswer, session.responses, onRecordAttempt, setSession]
  );

  const handleAiVerifyQuestion = useCallback(
    async (q: Question) => {
      if (verifyingIds[q.id]) return;
      setVerifyingIds((prev) => ({ ...prev, [q.id]: true }));
      setVerifyFeedback((prev) => {
        const copy = { ...prev };
        delete copy[q.id];
        return copy;
      });

      const res = await onVerifySinglePyq(q);
      setVerifyingIds((prev) => ({ ...prev, [q.id]: false }));
      setVerifyFeedback((prev) => ({
        ...prev,
        [q.id]: { ok: res.ok, msg: res.message },
      }));

      if (res.ok && res.verified) {
        const updatedQ = applyVerifiedAnswer(q, res.verified);
        const resp = session.responses[q.id] ?? {};
        const evalRes = evaluateQuestionResponse(updatedQ, resp);
        if (evalRes.attempted) {
          onRecordAttempt(
            q.id,
            evalRes.isCorrect,
            evalRes.marksAwarded,
            evalRes.maxMarks,
            formatSelectedAnswer(resp)
          );
        }
        setSession((prev) =>
          prev
            ? {
                ...prev,
                checked: { ...prev.checked, [q.id]: evalRes },
              }
            : prev
        );
      }
    },
    [verifyingIds, onVerifySinglePyq, session.responses, onRecordAttempt, setSession]
  );

  const handleFinishSession = useCallback(() => {
    const nextChecked = { ...session.checked };
    let correctCount = 0;
    let gradedAttempted = 0;
    let marksAwarded = 0;
    let maxMarks = 0;

    for (const q of liveQuestions) {
      maxMarks += q.marks;
      const resp = session.responses[q.id] ?? {};
      const selText = formatSelectedAnswer(resp);
      if (questionHasKey(q)) {
        const res = evaluateQuestionResponse(q, resp);
        nextChecked[q.id] = res;
        if (res.attempted) {
          gradedAttempted += 1;
          if (res.isCorrect) correctCount += 1;
          marksAwarded += res.marksAwarded;
          onRecordAttempt(q.id, res.isCorrect, res.marksAwarded, res.maxMarks, selText);
        }
      } else if (!nextChecked[q.id]) {
        nextChecked[q.id] = {
          attempted: hasAnswerResponse(resp),
          isCorrect: false,
          marksAwarded: 0,
          maxMarks: q.marks,
          selfChecked: false,
        };
      } else if (nextChecked[q.id].attempted) {
        gradedAttempted += 1;
        if (nextChecked[q.id].isCorrect) correctCount += 1;
        marksAwarded += nextChecked[q.id].marksAwarded;
      }
    }

    if (session.isGaSprint && onCompleteGaSprint && !session.finished) {
      const denom = gradedAttempted > 0 ? gradedAttempted : liveQuestions.length;
      const accuracyPct = denom > 0 ? Math.round((correctCount / denom) * 100) : 0;
      onCompleteGaSprint({
        questionsCount: liveQuestions.length,
        correctCount,
        marksAwarded: Math.round(marksAwarded * 100) / 100,
        maxMarks,
        accuracyPct,
        durationSeconds: session.elapsedSeconds,
      });
    }

    setSession((prev) => (prev ? { ...prev, checked: nextChecked, finished: true } : prev));
  }, [
    session.checked,
    session.responses,
    session.isGaSprint,
    session.finished,
    session.elapsedSeconds,
    liveQuestions,
    onRecordAttempt,
    onCompleteGaSprint,
    setSession,
  ]);

  // Shared Review / Verification Card used in Practice Sprint & Score Report
  const renderReviewPanel = (q: Question, evalRes: EvaluationResult & { selfChecked?: boolean }) => {
    const hasKey = questionHasKey(q);
    const isVerifying = Boolean(verifyingIds[q.id]);
    const feedback = verifyFeedback[q.id];
    const mistakeEntry = state.mistakes[q.id];
    const resp = session.responses[q.id];
    const userSel = formatSelectedAnswer(resp);

    const officialKeyLabel =
      q.format === 'MCQ'
        ? q.correctOption
        : q.format === 'MSQ'
        ? q.correctOptions?.join(', ')
        : `${q.natAnswer}${q.natUnit ? ` ${q.natUnit}` : ''}`;

    return (
      <div
        data-testid="question-review-panel"
        className="rounded-[22px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4 sm:p-5 space-y-4"
      >
        {/* Top Result / Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {hasKey || evalRes.selfChecked ? (
              <>
                {evalRes.isCorrect ? (
                  <CheckCircle2 className="h-4 w-4 text-[#2E5E3E] dark:text-[#7BB88F]" />
                ) : (
                  <XCircle className="h-4 w-4 text-[#B83227] dark:text-[#F08A80]" />
                )}
                <span
                  className={`text-xs font-bold ${
                    !evalRes.attempted
                      ? 'text-[#61554D] dark:text-[#A99B8E]'
                      : evalRes.isCorrect
                      ? 'text-[#2E5E3E] dark:text-[#7BB88F]'
                      : 'text-[#B83227] dark:text-[#F08A80]'
                  }`}
                >
                  {!evalRes.attempted
                    ? 'Unattempted (0 Marks)'
                    : evalRes.isCorrect
                    ? `Correct · +${evalRes.marksAwarded} Marks`
                    : `Incorrect · ${evalRes.marksAwarded} Marks · Added to Mistake Bucket`}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                <KeyRound className="h-3.5 w-3.5" />
                Verify Answer via GateOverflow, Self-Check, or Free-Tier AI
                {userSel && (
                  <span className="font-mono ml-1 px-2 py-0.5 rounded-full bg-[#EFE9DF] dark:bg-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8]">
                    Your Pick: {userSel}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasKey && (
              <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8]">
                Official Key: {officialKeyLabel}
              </span>
            )}

            {q.sourceUrl && (
              <a
                href={q.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="gateoverflow-solution-link"
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
              >
                Open GateOverflow Solution
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Unverified Question Controls: Self-Check Pills + Save Key + Solve & Verify with AI */}
        {!hasKey && (
          <div className="rounded-[18px] border border-[#EED89A] dark:border-[#5C441B] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* 1. One-Click Self-Check Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E]">
                  Self-Check (Offline):
                </span>
                <button
                  type="button"
                  onClick={() => handleSelfCheck(q, true)}
                  className="inline-flex items-center gap-1 h-8 px-3.5 rounded-full border border-[#2E5E3E] bg-[#EBF5EE] hover:bg-[#DDF0E3] dark:bg-[#152B1D] text-xs font-semibold text-[#2E5E3E] dark:text-[#7BB88F] press-tactile"
                >
                  <Check className="h-3.5 w-3.5" />
                  I Got It Right ✓
                </button>
                <button
                  type="button"
                  onClick={() => handleSelfCheck(q, false)}
                  className="inline-flex items-center gap-1 h-8 px-3.5 rounded-full border border-[#B83227] bg-[#FBEAE8] hover:bg-[#F7DAD6] dark:bg-[#3A1E1B] text-xs font-semibold text-[#B83227] dark:text-[#F08A80] press-tactile"
                >
                  <X className="h-3.5 w-3.5" />
                  I Got It Wrong ✗
                </button>
              </div>

              {/* 2. On-Demand Free-Tier AI Verifier */}
              <button
                type="button"
                disabled={isVerifying}
                onClick={() => void handleAiVerifyQuestion(q)}
                data-testid="solve-verify-ai-btn"
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[#241914] hover:bg-[#33241D] dark:bg-[#E0A92E] dark:text-[#1C1613] text-[#FAF5EB] text-xs font-semibold disabled:opacity-50 press-tactile"
              >
                {isVerifying ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-[#E0A92E] dark:text-[#1C1613]" />
                )}
                {isVerifying ? 'Solving & Caching...' : 'Solve & Verify with AI'}
              </button>
            </div>

            {/* Optional Permanent Official Answer Key Input */}
            <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#EFE9DF] dark:border-[#2E2520]">
              <label
                htmlFor={`save-key-${q.id}`}
                className="text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]"
              >
                Save official key to Firestore for future auto-grading:
              </label>
              <input
                id={`save-key-${q.id}`}
                type="text"
                value={manualKeyDrafts[q.id] ?? ''}
                onChange={(e) =>
                  setManualKeyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                placeholder={
                  q.format === 'MCQ'
                    ? 'e.g. B'
                    : q.format === 'MSQ'
                    ? 'e.g. A, C'
                    : 'e.g. 42.5'
                }
                className="h-8 w-32 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
              />
              <button
                type="button"
                onClick={() => void handleSaveManualKey(q)}
                className="h-8 px-3.5 rounded-full border border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-xs font-semibold text-[#8B6209] dark:text-[#E0A92E] hover:bg-[#F9ECCB] press-tactile"
              >
                Save Key
              </button>
              {manualKeySaved[q.id] && (
                <span className="text-[11px] font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
                  Saved!
                </span>
              )}
            </div>

            {feedback && (
              <p
                className={`text-xs font-medium ${
                  feedback.ok
                    ? 'text-[#2E5E3E] dark:text-[#7BB88F]'
                    : 'text-[#8B6209] dark:text-[#E0A92E]'
                }`}
              >
                {feedback.msg}
              </p>
            )}
          </div>
        )}

        {/* Inline Mistake Bucket Error Tagging whenever marked wrong */}
        {((evalRes.attempted && !evalRes.isCorrect && (hasKey || evalRes.selfChecked)) ||
          (mistakeEntry && !mistakeEntry.resolved)) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-[#B83227] dark:text-[#F08A80] mr-1">
              Tag Mistake Type:
            </span>
            {ERROR_TAGS.map((tag) => {
              const active = (mistakeEntry?.errorTag ?? 'Conceptual Gap') === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onUpdateMistakeTag(q.id, tag)}
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold press-tactile ${
                    active
                      ? 'border-[#B83227] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                      : 'border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#A99B8E]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        {/* Verified First-Principles Proof & Trap Analysis */}
        {q.explanation && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              First-Principles Proof &amp; Step-by-Step Solution
            </h4>
            <RichQuestionContent
              plainText={q.explanation}
              className="text-xs sm:text-sm text-[#61554D] dark:text-[#D8CBB8]"
            />
          </div>
        )}

        {q.wrongOptionAnalysis && (
          <div className="pt-3 border-t border-[#E8E0D5] dark:border-[#352A24] space-y-1">
            <h4 className="text-xs font-bold text-[#B58210] dark:text-[#E0A92E]">
              Exam Trap &amp; Distractor Analysis
            </h4>
            <RichQuestionContent
              plainText={q.wrongOptionAnalysis}
              className="text-xs text-[#61554D] dark:text-[#A99B8E]"
            />
          </div>
        )}
      </div>
    );
  };

  // Palette status counters for GATE CBT Sidebar (must stay above early return to obey Rules of Hooks)
  const paletteStats = useMemo(() => {
    let answered = 0;
    let markedOnly = 0;
    let answeredAndMarked = 0;
    let notAnswered = 0;
    for (const q of liveQuestions) {
      const hasAns = hasAnswerResponse(session.responses[q.id]);
      const marked = Boolean(session.markedForReview[q.id]);
      if (hasAns && marked) answeredAndMarked++;
      else if (hasAns) answered++;
      else if (marked) markedOnly++;
      else notAnswered++;
    }
    return { answered, markedOnly, answeredAndMarked, notAnswered };
  }, [liveQuestions, session.responses, session.markedForReview]);

  // ===================== SUBMIT & SCORE REPORT SCREEN =====================
  if (session.finished) {
    const results = liveQuestions.map((q) => {
      const evalRes = session.checked[q.id] ?? {
        attempted: hasAnswerResponse(session.responses[q.id]),
        isCorrect: false,
        marksAwarded: 0,
        maxMarks: q.marks,
      };
      return { q, res: evalRes };
    });

    const gradedResults = results.filter(
      ({ q, res }) => questionHasKey(q) || res.selfChecked
    );
    const totalMarks = gradedResults.reduce((acc, r) => acc + r.res.marksAwarded, 0);
    const maxMarks = results.reduce((acc, r) => acc + r.q.marks, 0);
    const attemptedCount = results.filter((r) => r.res.attempted).length;
    const correctCount = gradedResults.filter((r) => r.res.isCorrect).length;
    const gradedAttempted = gradedResults.filter((r) => r.res.attempted).length;
    const accuracy =
      gradedAttempted > 0 ? Math.round((correctCount / gradedAttempted) * 100) : 0;
    const pendingVerifyCount = results.length - gradedResults.length;

    const paceAnalytics = computeSprintPaceAnalytics(liveQuestions, session.questionSeconds ?? {});
    const userAnswersMap: Record<string, string> = {};
    for (const q of liveQuestions) {
      const formatted = formatSelectedAnswer(session.responses[q.id]);
      if (formatted) userAnswersMap[q.id] = formatted;
    }

    return (
      <div className="space-y-5" data-testid="cbt-score-report">
        <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E8E0D5] dark:border-[#2E2520]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[#6E261A] dark:text-[#E0A92E]">
                {isTimedMock ? 'CBT Mock Score Report' : 'Practice Sprint Complete'}
              </div>
              <h2 className="mt-0.5 font-display text-xl font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                {session.title}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onRequestPdfExport({
                    kind: 'test-pack',
                    title: session.title,
                    subtitle: `Score: ${totalMarks.toFixed(2)}/${maxMarks} · Accuracy: ${accuracy}%`,
                    questions: liveQuestions,
                    defaultLayout: 'solutions',
                    userAnswers: userAnswersMap,
                    questionSeconds: session.questionSeconds ?? {},
                    mistakeMap: state.mistakes,
                    savedSketches: state.savedSketches,
                    savedTraceTables: state.traceTables,
                  })
                }
                data-testid="score-report-export-pdf-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] press-tactile"
              >
                <FileDown className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                Export Test PDF
              </button>
              <button
                type="button"
                onClick={onExit}
                className="px-5 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
              >
                Back to Test Builder
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-[20px] squircle border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] p-4">
              <div className="text-xs text-[#8B6209] dark:text-[#E0A92E]">Graded Net Score</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#6E261A] dark:text-[#F5F0E8]">
                {totalMarks.toFixed(2)} / {maxMarks}
              </div>
            </div>
            <div className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4">
              <div className="text-xs text-[#61554D] dark:text-[#A99B8E]">Graded Accuracy</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#2E5E3E] dark:text-[#7BB88F]">
                {accuracy}%
              </div>
            </div>
            <div className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4">
              <div className="text-xs text-[#61554D] dark:text-[#A99B8E]">Attempted / Verified</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                {attemptedCount} / {gradedResults.length}
              </div>
              {pendingVerifyCount > 0 && (
                <p className="text-[11px] text-[#8B6209] dark:text-[#E0A92E] mt-0.5">
                  {pendingVerifyCount} awaiting key check below
                </p>
              )}
            </div>
            <div className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4">
              <div className="text-xs text-[#61554D] dark:text-[#A99B8E]">Time Spent</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                {formatTimer(session.elapsedSeconds)}
              </div>
            </div>
          </div>

          {/* Per-Question Pace Summary Strip */}
          <div className="rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
              <Clock className="h-4 w-4 text-[#C89216] dark:text-[#E0A92E]" />
              <span>Exam Pace Diagnostics</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
              <span className="text-[#61554D] dark:text-[#A99B8E]">
                Avg 1M:{' '}
                <strong className="text-[#1C1613] dark:text-[#F5F0E8]">
                  {paceAnalytics.avg1MSeconds !== null
                    ? formatPaceDuration(paceAnalytics.avg1MSeconds)
                    : '—'}
                </strong>
              </span>
              <span className="text-[#61554D] dark:text-[#A99B8E]">
                Avg 2M:{' '}
                <strong className="text-[#1C1613] dark:text-[#F5F0E8]">
                  {paceAnalytics.avg2MSeconds !== null
                    ? formatPaceDuration(paceAnalytics.avg2MSeconds)
                    : '—'}
                </strong>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full font-semibold ${
                  paceAnalytics.slowQuestionIds.length > 0
                    ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[#8E620C] dark:text-[#E0A92E]'
                    : 'bg-[#ECF4EE] dark:bg-[#1C2A21] text-[#2E5E3E] dark:text-[#7AC493]'
                }`}
              >
                {paceAnalytics.slowQuestionIds.length} Slow Pace
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {results.map(({ q, res }, idx) => {
              const qSecs = session.questionSeconds?.[q.id] ?? 0;
              const isSlow = isSlowPaceQuestion(q.marks, qSecs);
              return (
                <div
                  key={q.id}
                  className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 sm:p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                        Q{idx + 1}
                      </span>
                      <span className="font-mono px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-[#6E261A] dark:text-[#E0A92E] font-semibold">
                        {SUBJECT_MAP[q.subjectId].code} · {q.format} · {q.marks}M
                      </span>
                      <span className="text-[#61554D] dark:text-[#D8CBB8]">{q.sourceTag}</span>
                      {qSecs > 0 && (
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] text-[#61554D] dark:text-[#A99B8E] tabular-nums">
                          {formatPaceDuration(qSecs)}
                        </span>
                      )}
                      {isSlow && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[11px] font-semibold text-[#8E620C] dark:text-[#E0A92E]">
                          Slow Pace
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#61554D] dark:text-[#A99B8E]">
                        Your Response: {formatSelectedAnswer(session.responses[q.id]) || 'Unattempted'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onRequestPdfExport({
                            kind: 'single-question',
                            question: q,
                            userAnswerLabel: formatSelectedAnswer(session.responses[q.id]) || 'Unattempted',
                            timeSpentSeconds: qSecs,
                            sketchDataUrl: state.savedSketches[q.id],
                            traceTable: state.traceTables[q.id],
                            mistakeTag: state.mistakes[q.id]?.errorTag,
                            mistakeNote: state.mistakes[q.id]?.userNote,
                          })
                        }
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-[11px] font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216] press-tactile"
                      >
                        <FileDown className="h-3 w-3 text-[#6E261A] dark:text-[#E0A92E]" />
                        PDF
                      </button>
                    </div>
                  </div>

                  <div className="pyq-reading-measure">
                    <RichQuestionContent
                      html={q.bodyHtml}
                      plainText={q.prompt}
                      className="text-sm"
                    />
                  </div>

                  {renderReviewPanel(q, res)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ===================== ACTIVE QUESTION HALL VIEW =====================
  const currentResp = session.responses[currentQ.id] ?? {};
  const currentEval = session.checked[currentQ.id];
  const isBookmarked = state.bookmarkedQuestions.includes(currentQ.id);
  const isMarked = Boolean(session.markedForReview[currentQ.id]);
  const hasVerifiedKey = questionHasKey(currentQ);

  const negText =
    currentQ.format === 'MCQ'
      ? currentQ.marks === 1
        ? '+1 / −0.33'
        : '+2 / −0.67'
      : `+${currentQ.marks} / 0`;

  const showFloatingOptionDock =
    (currentQ.format === 'MCQ' || currentQ.format === 'MSQ') &&
    currentQ.optionsExtracted === false;

  const isLocked = !isTimedMock && Boolean(currentEval);
  const currentQSeconds = session.questionSeconds?.[currentQ.id] ?? 0;
  const isCurrentQSlow = isSlowPaceQuestion(currentQ.marks, currentQSeconds);
  const showPacePill = state.settings.showLivePaceTimer ?? true;

  const handleExportWholeTestPdf = () => {
    const userAnswersMap: Record<string, string> = {};
    for (const q of liveQuestions) {
      const formatted = formatSelectedAnswer(session.responses[q.id]);
      if (formatted) userAnswersMap[q.id] = formatted;
    }
    onRequestPdfExport({
      kind: 'test-pack',
      title: session.title,
      questions: liveQuestions,
      defaultLayout: isTimedMock ? 'worksheet' : 'solutions',
      userAnswers: userAnswersMap,
      questionSeconds: session.questionSeconds ?? {},
      mistakeMap: state.mistakes,
      savedSketches: state.savedSketches,
      savedTraceTables: state.traceTables,
    });
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      {/* CBT Exam Hall Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 sm:px-5 py-3 shadow-warm">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-1 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#61554D] hover:text-[#1C1613] dark:text-[#D8CBB8] dark:hover:text-[#F5F0E8] whitespace-nowrap press-tactile"
          >
            ← Exit
          </button>
          <h2 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] truncate">
            {session.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span
            data-testid="cbt-session-clock"
            className={`font-mono text-xs font-bold tabular-nums px-3 py-1.5 rounded-full ${
              isTimedMock && session.secondsRemaining < 300
                ? 'bg-[#B83227] text-white'
                : 'bg-[#241914] text-[#FAF5EB]'
            }`}
          >
            {isTimedMock
              ? `Left ${formatTimer(session.secondsRemaining)}`
              : `Elapsed ${formatTimer(session.elapsedSeconds)}`}
          </span>

          {showPacePill && (
            <span
              data-testid="live-pace-pill"
              title="Time spent on current question"
              className={`inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums px-2.5 py-1.5 rounded-full border ${
                isCurrentQSlow
                  ? 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8E620C] dark:text-[#E0A92E]'
                  : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
              }`}
            >
              <Clock className="h-3 w-3" />
              {formatPaceDuration(currentQSeconds)}
            </span>
          )}

          <button
            type="button"
            onClick={() => setSketchpadOpen((o) => !o)}
            aria-pressed={sketchpadOpen}
            title="Toggle Split-Pane Rough-Work Sketchpad (S)"
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold press-tactile whitespace-nowrap ${
              sketchpadOpen
                ? 'border-[#6E261A] dark:border-[#E0A92E] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#E0A92E]'
                : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
            }`}
          >
            <PenTool className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sketch (S)</span>
          </button>

          <button
            type="button"
            onClick={onToggleCalculator}
            title="Toggle Virtual Calculator (C)"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] press-tactile whitespace-nowrap"
          >
            <Calculator className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Calc (C)</span>
          </button>

          <button
            type="button"
            onClick={handleExportWholeTestPdf}
            data-testid="cbt-export-test-pdf-btn"
            title="Export Full Test as Crisp Vector PDF"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:text-[#6E261A] dark:hover:text-[#E0A92E] press-tactile whitespace-nowrap"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Test PDF</span>
          </button>

          <button
            type="button"
            onClick={onToggleZenMode}
            data-testid="zen-mode-toggle-btn"
            aria-pressed={zenMode}
            aria-label={zenMode ? 'Exit Zen Fullscreen Mode (F)' : 'Enter Zen Fullscreen Mode (F)'}
            title="Zen Fullscreen Mode (F)"
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold press-tactile whitespace-nowrap ${
              zenMode
                ? 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8E620C] dark:text-[#E0A92E]'
                : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
            }`}
          >
            {zenMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{zenMode ? 'Exit Zen' : 'Zen (F)'}</span>
          </button>

          <button
            type="button"
            onClick={handleFinishSession}
            data-testid="submit-cbt-session-btn"
            className="h-8 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile whitespace-nowrap"
          >
            {isTimedMock ? 'Submit' : 'Finish'}
          </button>
        </div>
      </div>

      {/* Main Responsive Split Grid: Question + Sketchpad / GATE CBT Palette Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left/Center Question Card */}
        <div
          className={`${
            sketchpadOpen ? 'xl:col-span-7' : 'xl:col-span-9'
          } rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 sm:p-6 shadow-warm space-y-5`}
        >
          {/* Question Metadata Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-[#E8E0D5] dark:border-[#2E2520]">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#61554D] dark:text-[#A99B8E]">
              <span className="font-mono font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Q{session.currentIndex + 1}/{liveQuestions.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[#6E261A] dark:text-[#E0A92E]">
                {SUBJECT_MAP[currentQ.subjectId].name}
              </span>
              <span aria-hidden="true">·</span>
              <span>{currentQ.subtopic}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                {currentQ.format} ({negText})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onRequestPdfExport({
                    kind: 'single-question',
                    question: currentQ,
                    userAnswerLabel: formatSelectedAnswer(currentResp) || undefined,
                    timeSpentSeconds: currentQSeconds,
                    sketchDataUrl: state.savedSketches[currentQ.id],
                    traceTable: state.traceTables[currentQ.id],
                    mistakeTag: state.mistakes[currentQ.id]?.errorTag,
                    mistakeNote: state.mistakes[currentQ.id]?.userNote,
                  })
                }
                data-testid="single-question-export-pdf-btn"
                aria-label="Export current question as Vector PDF"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[11px] font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:border-[#C89216] hover:text-[#6E261A] dark:hover:text-[#E0A92E] press-tactile"
              >
                <FileDown className="h-3 w-3" />
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => toggleMarkForReview(currentQ.id, false)}
                aria-label="Mark question for review"
                aria-pressed={isMarked}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-[11px] font-semibold press-tactile ${
                  isMarked
                    ? 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#332714] text-[#8B6209] dark:text-[#E0A92E]'
                    : 'border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <Flag className="h-3 w-3" />
                {isMarked ? 'Marked' : 'Review'}
              </button>
              <button
                type="button"
                onClick={() => onToggleBookmark(currentQ.id)}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark question (B)'}
                aria-pressed={isBookmarked}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-[11px] font-semibold press-tactile ${
                  isBookmarked
                    ? 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#332714] text-[#8B6209] dark:text-[#E0A92E]'
                    : 'border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <Bookmark className={`h-3 w-3 ${isBookmarked ? 'fill-current' : ''}`} />
                {isBookmarked ? 'Saved' : 'Bookmark'}
              </button>
            </div>
          </div>

          {/* Paper Year, Tags, Out-of-2027 Badge & GateOverflow Link */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
            <span className="px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
              {currentQ.sourceTag}
            </span>
            {currentQ.year && (
              <span className="font-mono px-2.5 py-0.5 rounded-full border border-[#E8E0D5] dark:border-[#2E2520]">
                {currentQ.year}
              </span>
            )}
            <span>Difficulty: {currentQ.difficulty}</span>
            {currentQ.isOutOf2027Syllabus && (
              <span
                data-testid="out-of-2027-badge"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-[#D8CBB8] dark:border-[#3D312B] bg-[#EFE9DF] dark:bg-[#2A221E] font-semibold text-[#61554D] dark:text-[#D8CBB8]"
              >
                <AlertTriangle className="h-3 w-3" />
                Out of 2027 Syllabus
              </span>
            )}
            {currentQ.sourceUrl && (
              <a
                href={currentQ.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#6E261A] dark:text-[#E0A92E] hover:underline ml-auto"
              >
                GateOverflow ↗
              </a>
            )}
          </div>

          {/* Sanitized Rich Question Statement (KaTeX + Warm Cocoa Pre/Code + Click-to-Zoom Img) */}
          <div className="space-y-4 pyq-reading-measure">
            <RichQuestionContent
              html={currentQ.bodyHtml}
              plainText={currentQ.prompt}
              className="text-[15px] sm:text-base font-normal"
            />

            {currentQ.codeSnippet && (
              <CodeBlock code={currentQ.codeSnippet} label="Code Snippet" />
            )}
          </div>

          {/* Smart Interactive Options: Extracted Curved Cards OR Floating A/B/C/D Dock OR NAT Box */}
          {currentQ.format === 'MCQ' && !showFloatingOptionDock && currentQ.options && (
            <div className="space-y-2.5" role="radiogroup" aria-label="MCQ Options">
              {currentQ.options.map((opt) => {
                const selected = currentResp.selectedOption === opt.id;
                const isCorrectOpt =
                  !isTimedMock && currentEval && hasVerifiedKey && currentQ.correctOption === opt.id;
                const isWrongSelected =
                  !isTimedMock && currentEval && hasVerifiedKey && selected && !isCorrectOpt;

                let style =
                  'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] dark:hover:border-[#E0A92E]';
                if (isCorrectOpt) {
                  style =
                    'border-[#2E5E3E] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#1D422A] dark:text-[#8FD1A4]';
                } else if (isWrongSelected) {
                  style =
                    'border-[#B83227] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#8E2219] dark:text-[#F08A80]';
                } else if (selected) {
                  style =
                    'border-[#6E261A] dark:border-[#E0A92E] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#FAF5EB]';
                }

                const selectOption = () => {
                  if (!isLocked) {
                    updateResponse(currentQ.id, { selectedOption: opt.id });
                  }
                };

                return (
                  <div
                    key={opt.id}
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={isLocked}
                    tabIndex={isLocked ? -1 : 0}
                    onClick={selectOption}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectOption();
                      }
                    }}
                    className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-[20px] border text-left text-sm press-tactile select-none ${
                      isLocked ? 'cursor-default' : 'cursor-pointer'
                    } ${style}`}
                  >
                    <span className="h-6 w-6 rounded-full border border-current/30 flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5">
                      {opt.id}
                    </span>
                    <RichQuestionContent html={opt.text} inline className="flex-1 text-sm" />
                  </div>
                );
              })}
            </div>
          )}

          {currentQ.format === 'MSQ' && !showFloatingOptionDock && currentQ.options && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
                Multiple Select Question (MSQ) · Select all correct options. Zero negative marking.
              </p>
              {currentQ.options.map((opt) => {
                const selectedList = currentResp.selectedOptions ?? [];
                const selected = selectedList.includes(opt.id);
                const isExpected =
                  !isTimedMock &&
                  currentEval &&
                  hasVerifiedKey &&
                  currentQ.correctOptions?.includes(opt.id);
                const isWrongPick =
                  !isTimedMock && currentEval && hasVerifiedKey && selected && !isExpected;

                let style =
                  'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] dark:hover:border-[#E0A92E]';
                if (isExpected) {
                  style =
                    'border-[#2E5E3E] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#1D422A] dark:text-[#8FD1A4]';
                } else if (isWrongPick) {
                  style =
                    'border-[#B83227] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#8E2219] dark:text-[#F08A80]';
                } else if (selected) {
                  style =
                    'border-[#6E261A] dark:border-[#E0A92E] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#FAF5EB]';
                }

                const toggleOpt = () => {
                  const next = selected
                    ? selectedList.filter((x) => x !== opt.id)
                    : [...selectedList, opt.id];
                  updateResponse(currentQ.id, { selectedOptions: next });
                };

                return (
                  <label
                    key={opt.id}
                    className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-[20px] border text-sm cursor-pointer transition-colors ${style}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={isLocked}
                      onChange={toggleOpt}
                      className="mt-1 h-4 w-4 rounded-full border-[#D8CBB8]"
                    />
                    <span className="font-mono text-xs font-bold mt-0.5 shrink-0">{opt.id}.</span>
                    <RichQuestionContent html={opt.text} inline className="flex-1 text-sm" />
                  </label>
                );
              })}
            </div>
          )}

          {/* Sleek Floating A / B / C / D Answer Selector Dock when complex HTML keeps options inline */}
          {showFloatingOptionDock && (
            <div
              data-testid="floating-option-dock"
              className="rounded-[22px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4 space-y-2.5"
            >
              <div className="text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]">
                {currentQ.format === 'MSQ'
                  ? 'Select all matching options (MSQ):'
                  : 'Select your answer option (MCQ):'}
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {['A', 'B', 'C', 'D'].map((letter) => {
                  const isMsq = currentQ.format === 'MSQ';
                  const selectedList = currentResp.selectedOptions ?? [];
                  const selected = isMsq
                    ? selectedList.includes(letter)
                    : currentResp.selectedOption === letter;

                  const handlePick = () => {
                    if (isMsq) {
                      const next = selected
                        ? selectedList.filter((x) => x !== letter)
                        : [...selectedList, letter];
                      updateResponse(currentQ.id, { selectedOptions: next });
                    } else {
                      updateResponse(currentQ.id, { selectedOption: letter });
                    }
                  };

                  return (
                    <button
                      key={letter}
                      type="button"
                      disabled={isLocked}
                      onClick={handlePick}
                      className={`h-11 rounded-full border font-mono text-sm font-bold press-tactile ${
                        selected
                          ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                          : 'border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216]'
                      }`}
                    >
                      Option {letter}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* NAT Monospace Numeric Input */}
          {currentQ.format === 'NAT' && (
            <div className="space-y-2">
              <label
                htmlFor="nat-answer-input"
                className="block text-xs font-medium text-[#61554D] dark:text-[#A99B8E]"
              >
                Numerical Answer Type (NAT) · Enter exact numerical value{' '}
                {currentQ.natUnit ? `(in ${currentQ.natUnit})` : ''}{' '}
                {currentQ.natTolerance ? `· Tolerance ±${currentQ.natTolerance}` : ''}
              </label>
              <div className="flex items-center gap-2.5 max-w-xs">
                <input
                  id="nat-answer-input"
                  type="text"
                  inputMode="decimal"
                  disabled={isLocked}
                  value={currentResp.natValue ?? ''}
                  onChange={(e) => updateResponse(currentQ.id, { natValue: e.target.value })}
                  placeholder="Type numerical answer..."
                  className="w-full h-11 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-sm tabular-nums text-[#1C1613] dark:text-[#F5F0E8]"
                />
                {currentQ.natUnit && (
                  <span className="font-mono text-xs text-[#61554D] dark:text-[#A99B8E]">
                    {currentQ.natUnit}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action Footer Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-[#E8E0D5] dark:border-[#2E2520]">
            <div className="flex flex-wrap items-center gap-2">
              {isTimedMock ? (
                <>
                  <button
                    type="button"
                    onClick={() => jumpToIndex(session.currentIndex + 1)}
                    className="h-9 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                  >
                    Save &amp; Next
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMarkForReview(currentQ.id, true)}
                    className="h-9 px-4 rounded-full border border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-xs font-semibold text-[#8B6209] dark:text-[#E0A92E] press-tactile"
                  >
                    Mark for Review &amp; Next
                  </button>
                  <button
                    type="button"
                    onClick={() => updateResponse(currentQ.id, {})}
                    className="h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
                  >
                    Clear Response
                  </button>
                </>
              ) : (
                <>
                  {!currentEval && (
                    <button
                      type="button"
                      onClick={() => handleCheckPracticeQuestion(currentQ)}
                      data-testid="check-answer-btn"
                      className="h-9 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold press-tactile"
                    >
                      {hasVerifiedKey ? 'Check Answer' : 'Check & Reveal Solutions'}
                    </button>
                  )}
                  {!currentEval && (
                    <button
                      type="button"
                      onClick={() => updateResponse(currentQ.id, {})}
                      className="h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
                    >
                      Clear
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={session.currentIndex === 0}
                onClick={() => jumpToIndex(session.currentIndex - 1)}
                className="inline-flex items-center gap-1 h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19] disabled:opacity-40 press-tactile"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev (P)
              </button>
              <button
                type="button"
                disabled={session.currentIndex === liveQuestions.length - 1}
                onClick={() => jumpToIndex(session.currentIndex + 1)}
                className="inline-flex items-center gap-1 h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19] disabled:opacity-40 press-tactile"
              >
                Next (N)
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Smooth Accordion Review Panel (Practice Sprint mode) */}
          {!isTimedMock && (
            <div className="accordion-grid" data-open={currentEval ? 'true' : 'false'}>
              <div className="accordion-inner">
                {currentEval && renderReviewPanel(currentQ, currentEval)}
              </div>
            </div>
          )}
        </div>

        {/* Right Rail: Split-Pane Sketchpad + GATE Question Palette Sidebar */}
        <div className={`${sketchpadOpen ? 'xl:col-span-5' : 'xl:col-span-3'} space-y-4`}>
          {sketchpadOpen && (
            <SketchpadStudioPanel
              questionId={currentQ.id}
              activeQuestion={currentQ}
              savedSketchUrl={state.savedSketches[currentQ.id]}
              onSaveSketch={onSaveSketch}
              onDeleteSketch={onDeleteSketch}
              savedTraceTable={state.traceTables[currentQ.id]}
              onSaveTraceTable={onSaveTraceTable}
              onDeleteTraceTable={onDeleteTraceTable}
            />
          )}

          {/* GATE Question Palette Sidebar (Desktop xl+ always visible) */}
          <div
            data-testid="gate-question-palette"
            className="hidden xl:block rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 shadow-warm space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold uppercase tracking-wide text-[#1C1613] dark:text-[#F5F0E8]">
                GATE Question Palette
              </h3>
              <span className="font-mono text-[11px] text-[#61554D] dark:text-[#A99B8E] tabular-nums">
                {paletteStats.answered + paletteStats.answeredAndMarked}/{liveQuestions.length}
              </span>
            </div>

            {/* Curved Status Legend Pills */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <span className="inline-flex items-center justify-between px-2.5 py-1 rounded-full border border-[#B8D7C3] dark:border-[#264D34] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] font-semibold">
                <span>Answered</span>
                <span className="font-mono tabular-nums">{paletteStats.answered}</span>
              </span>
              <span className="inline-flex items-center justify-between px-2.5 py-1 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] font-semibold">
                <span>Not Answered</span>
                <span className="font-mono tabular-nums">{paletteStats.notAnswered}</span>
              </span>
              <span className="inline-flex items-center justify-between px-2.5 py-1 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] font-semibold">
                <span>Marked</span>
                <span className="font-mono tabular-nums">{paletteStats.markedOnly}</span>
              </span>
              <span className="inline-flex items-center justify-between px-2.5 py-1 rounded-full border border-[#6E261A] dark:border-[#E0A92E] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#E59283] font-semibold">
                <span>Ans &amp; Marked</span>
                <span className="font-mono tabular-nums">{paletteStats.answeredAndMarked}</span>
              </span>
            </div>

            {/* Numbered Question Palette Grid */}
            <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto pt-1">
              {liveQuestions.map((q, idx) => {
                const evalItem = !isTimedMock ? session.checked[q.id] : undefined;
                const hasAns = hasAnswerResponse(session.responses[q.id]);
                const marked = Boolean(session.markedForReview[q.id]);
                const isCurr = idx === session.currentIndex;

                let tone =
                  'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E]';
                if (evalItem && (questionHasKey(q) || evalItem.selfChecked)) {
                  tone = evalItem.isCorrect
                    ? 'border-[#2E5E3E] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                    : evalItem.attempted
                    ? 'border-[#B83227] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                    : tone;
                } else if (hasAns && marked) {
                  tone =
                    'border-[#6E261A] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#E59283] ring-1 ring-[#C89216]';
                } else if (marked) {
                  tone =
                    'border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]';
                } else if (hasAns) {
                  tone =
                    'border-[#2E5E3E] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => jumpToIndex(idx)}
                    aria-label={`Go to question ${idx + 1}`}
                    className={`h-8 w-8 rounded-full font-mono text-xs font-bold tabular-nums border press-tactile ${tone} ${
                      isCurr
                        ? 'ring-2 ring-[#6E261A] dark:ring-[#E0A92E] ring-offset-1 ring-offset-[#FFFFFF] dark:ring-offset-[#1C1714]'
                        : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Mobile / Tablet Question Palette Bottom Sheet (< xl) */}
      {mobilePaletteOpen && (
        <div
          className="xl:hidden fixed inset-0 z-50 flex items-end justify-center bg-[#130F0D]/60"
          onClick={() => setMobilePaletteOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Mobile Question Palette"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-[28px] border-t border-x border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-5 pt-5 pb-7 shadow-warm-lg space-y-4 max-h-[75vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Question Palette ({paletteStats.answered + paletteStats.answeredAndMarked}/{liveQuestions.length})
              </h3>
              <button
                type="button"
                onClick={() => setMobilePaletteOpen(false)}
                aria-label="Close palette"
                className="h-8 w-8 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] flex items-center justify-center text-[#61554D] dark:text-[#A99B8E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {liveQuestions.map((q, idx) => {
                const hasAns = hasAnswerResponse(session.responses[q.id]);
                const marked = Boolean(session.markedForReview[q.id]);
                const isCurr = idx === session.currentIndex;
                return (
                  <button
                    key={`mob-${q.id}`}
                    type="button"
                    onClick={() => {
                      jumpToIndex(idx);
                      setMobilePaletteOpen(false);
                    }}
                    className={`h-9 w-9 rounded-full font-mono text-xs font-bold tabular-nums border press-tactile ${
                      hasAns
                        ? 'border-[#2E5E3E] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                        : marked
                        ? 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]'
                        : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E]'
                    } ${isCurr ? 'ring-2 ring-[#6E261A] dark:ring-[#E0A92E]' : ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sticky Thumb-Friendly Mobile Bottom CBT Action Bar (< lg) */}
      <div
        data-testid="mobile-cbt-sticky-bar"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF]/95 dark:bg-[#1C1714]/95 px-3 py-2.5 shadow-warm-lg"
      >
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <button
            type="button"
            disabled={session.currentIndex === 0}
            onClick={() => jumpToIndex(session.currentIndex - 1)}
            aria-label="Previous question"
            className="h-10 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] disabled:opacity-40 inline-flex items-center gap-1 press-tactile"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          <button
            type="button"
            onClick={() => setMobilePaletteOpen(true)}
            data-testid="mobile-palette-trigger"
            className="h-10 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] inline-flex items-center gap-1.5 press-tactile"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
            <span>
              {session.currentIndex + 1}/{liveQuestions.length}
            </span>
          </button>

          {!isTimedMock && !currentEval ? (
            <button
              type="button"
              onClick={() => handleCheckPracticeQuestion(currentQ)}
              className="flex-1 h-10 px-3 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile truncate"
            >
              Check
            </button>
          ) : (
            <button
              type="button"
              onClick={() => jumpToIndex(session.currentIndex + 1)}
              disabled={session.currentIndex === liveQuestions.length - 1}
              className="flex-1 h-10 px-3 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white text-xs font-semibold disabled:opacity-40 press-tactile truncate"
            >
              Save &amp; Next
            </button>
          )}

          <button
            type="button"
            disabled={session.currentIndex === liveQuestions.length - 1}
            onClick={() => jumpToIndex(session.currentIndex + 1)}
            aria-label="Next question"
            className="h-10 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] disabled:opacity-40 inline-flex items-center gap-1 press-tactile"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
