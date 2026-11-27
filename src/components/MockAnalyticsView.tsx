import React, { useState, useMemo, useRef } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  Trash2,
  TrendingUp,
  AlertTriangle,
  SlidersHorizontal,
  PenLine,
  Pencil,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Award,
  Flame,
  Gauge,
  FileDown,
} from 'lucide-react';
import type {
  AccentThemeId,
  MockSubjectId,
  MockTestEntry,
  MockTestType,
  SubtopicProgress,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import { toLocalIsoDate } from '../utils/gateMath';
import { getActiveThemePalette } from '../utils/themeEngine';
import {
  SAMPLE_GO_CLASSES_PASTE,
  computeMockDiagnostics,
  getNormalizedMockPct,
  parseMockResultLocally,
  type ParsedMockDraft,
} from '../utils/mockResultParser';

interface MockAnalyticsViewProps {
  mocks: MockTestEntry[];
  progress: Record<string, SubtopicProgress>;
  theme: 'light' | 'dark';
  accentTheme?: AccentThemeId;
  onAddMock: (mock: Omit<MockTestEntry, 'id'>) => void;
  onUpdateMock?: (mockId: string, mock: Omit<MockTestEntry, 'id'>) => void;
  onDeleteMock: (mockId: string) => void;
  onExportMockPdf?: () => void;
}

type LoggerMode = 'paste' | 'manual';
type TypeFilter = 'all' | MockTestType;

function createEmptyManualDraft(): ParsedMockDraft {
  return {
    name: '',
    source: 'GO Classes',
    subjectId: 'all',
    date: toLocalIsoDate(),
    type: 'Full-Length Mock',
    score: 0,
    maxScore: 100,
    normalizedScore: 0,
    percentage: 0,
    accuracy: 80,
    totalQuestions: 65,
    attempted: undefined,
    correct: undefined,
    wrong: undefined,
    unattempted: 0,
    positiveMarks: undefined,
    penaltyMarks: 0,
    durationMinutes: 180,
    timeTakenMinutes: undefined,
    rank: undefined,
    totalCandidates: undefined,
    percentile: undefined,
    parseSource: 'manual',
    notes: '',
  };
}

function parseOptionalInput(val: string): number | undefined {
  if (val.trim() === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

export const MockAnalyticsView: React.FC<MockAnalyticsViewProps> = ({
  mocks,
  progress,
  theme,
  accentTheme = 'brown',
  onAddMock,
  onUpdateMock,
  onDeleteMock,
  onExportMockPdf,
}) => {
  const loggerSectionRef = useRef<HTMLElement | null>(null);
  const [loggerMode, setLoggerMode] = useState<LoggerMode>('paste');
  const [rawPaste, setRawPaste] = useState('');
  const [previewDraft, setPreviewDraft] = useState<ParsedMockDraft | null>(null);
  const [editingMockId, setEditingMockId] = useState<string | null>(null);
  const [parseMeta, setParseMeta] = useState<{
    confidence: 'high' | 'medium' | 'low';
    matchedFormat: string;
    parseMs: number;
    warnings: string[];
    aiStatusMessage?: string;
    isAiRefining?: boolean;
  } | null>(null);
  const [showAdvancedSplit, setShowAdvancedSplit] = useState(false);
  const [formError, setFormError] = useState('');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Live 8-Theme Recharts Palette (defaults to IIT Madras Heritage Brown & Gold)
  const isDark = theme === 'dark';
  const palette = getActiveThemePalette(accentTheme, isDark);
  const gridStroke = palette.chartGrid;
  const axisTick = palette.chartAxis;
  const maroonColor = palette.chartPrimary;
  const goldColor = palette.chartSecondary;
  const oliveColor = palette.semanticOlive;
  const crimsonColor = palette.semanticCrimson;
  const stoneColor = palette.chartMuted;

  const tooltipStyle = {
    backgroundColor: palette.surfaceCard,
    border: `1px solid ${palette.borderHairline}`,
    borderRadius: '18px',
    fontSize: '12px',
    color: palette.inkPrimary,
    boxShadow: '0 12px 32px -12px rgba(45, 28, 18, 0.18)',
  };

  // Filtered mocks for diagnostics
  const filteredMocks = useMemo(() => {
    if (typeFilter === 'all') return mocks;
    return mocks.filter((m) => m.type === typeFilter);
  }, [mocks, typeFilter]);

  const diagnostics = useMemo(
    () => computeMockDiagnostics(filteredMocks, progress),
    [filteredMocks, progress]
  );

  // Global counts for filter pills (always across all mocks)
  const allCounts = useMemo(() => {
    let full = 0;
    let subject = 0;
    let topic = 0;
    for (const m of mocks) {
      if (m.type === 'Full-Length Mock') full++;
      else if (m.type === 'Topic-Wise Test') topic++;
      else subject++;
    }
    return { all: mocks.length, full, subject, topic };
  }, [mocks]);

  const topRoiTargets = useMemo(() => {
    return [...diagnostics.subjectMatrix]
      .sort((a, b) => b.unrealizedMarks - a.unrealizedMarks)
      .slice(0, 3);
  }, [diagnostics.subjectMatrix]);

  const hasAttemptBreakdown = useMemo(
    () =>
      diagnostics.progressionSeries.some(
        (d) => d.correct > 0 || d.wrong > 0 || d.unattempted > 0
      ),
    [diagnostics.progressionSeries]
  );

  // Layer 2 AI Refinement
  const triggerAiRefinement = async (sourceText: string, baseDraft?: ParsedMockDraft) => {
    const trimmed = sourceText.trim();
    if (trimmed.length < 10) return;

    setParseMeta((prev) => ({
      confidence: prev?.confidence ?? 'low',
      matchedFormat: prev?.matchedFormat ?? 'Universal GATE Summary',
      parseMs: prev?.parseMs ?? 0,
      warnings: prev?.warnings ?? [],
      isAiRefining: true,
      aiStatusMessage: 'Refining extracted fields with AI...',
    }));

    try {
      const resp = await fetch('/api/parse-mock-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: trimmed }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        quotaExceeded?: boolean;
        message?: string;
        draft?: Partial<ParsedMockDraft>;
      };

      if (data.ok && data.draft) {
        const merged: ParsedMockDraft = {
          ...(baseDraft ?? createEmptyManualDraft()),
          ...data.draft,
          date: baseDraft?.date ?? toLocalIsoDate(),
          notes: baseDraft?.notes ?? '',
          parseSource: 'ai_free_tier',
        };
        setPreviewDraft(merged);
        setShowAdvancedSplit(
          merged.q1Attempted !== undefined || merged.q2Attempted !== undefined
        );
        setParseMeta({
          confidence: 'high',
          matchedFormat: 'AI Extraction',
          parseMs: 0,
          warnings: [],
          isAiRefining: false,
          aiStatusMessage: 'Parsed with AI · Review and confirm below.',
        });
      } else {
        setParseMeta((prev) => ({
          confidence: prev?.confidence ?? 'medium',
          matchedFormat: prev?.matchedFormat ?? 'Smart Parser',
          parseMs: prev?.parseMs ?? 0,
          warnings: prev?.warnings ?? [],
          isAiRefining: false,
          aiStatusMessage:
            data.message ?? 'AI refinement unavailable · Using instant preview (editable below).',
        }));
      }
    } catch {
      setParseMeta((prev) => ({
        confidence: prev?.confidence ?? 'medium',
        matchedFormat: prev?.matchedFormat ?? 'Smart Parser',
        parseMs: prev?.parseMs ?? 0,
        warnings: prev?.warnings ?? [],
        isAiRefining: false,
        aiStatusMessage: 'Could not reach AI refinement · Edit preview fields manually.',
      }));
    }
  };

  // Layer 1 Instant Local Parse
  const handleParsePaste = () => {
    setFormError('');
    setSavedBanner(null);
    const trimmed = rawPaste.trim();
    if (trimmed.length < 6) {
      setFormError('Paste your GO Classes, Made Easy, ACE, or GateOverflow exam summary first.');
      return;
    }

    const t0 = performance.now();
    const result = parseMockResultLocally(trimmed);
    const elapsedMs = Math.max(0, Math.round(performance.now() - t0));

    setPreviewDraft(result.draft);
    setShowAdvancedSplit(
      result.draft.q1Attempted !== undefined ||
        result.draft.q2Attempted !== undefined ||
        result.draft.q1PenaltyMarks !== undefined ||
        result.draft.q2PenaltyMarks !== undefined
    );
    setParseMeta({
      confidence: result.confidence,
      matchedFormat: result.matchedFormat,
      parseMs: elapsedMs,
      warnings: result.warnings,
      isAiRefining: false,
    });

    // Layer 2 auto-fallback ONLY when Layer 1 confidence is low
    if (result.confidence === 'low' && trimmed.length >= 15) {
      void triggerAiRefinement(trimmed, result.draft);
    }
  };

  const handleLoadSample = () => {
    setLoggerMode('paste');
    setRawPaste(SAMPLE_GO_CLASSES_PASTE);
    setFormError('');
    setSavedBanner(null);
  };

  const handleSwitchMode = (mode: LoggerMode) => {
    setLoggerMode(mode);
    setEditingMockId(null);
    setFormError('');
    if (mode === 'manual') {
      if (!previewDraft || previewDraft.parseSource !== 'manual') {
        setPreviewDraft(createEmptyManualDraft());
      }
      setParseMeta(null);
    } else if (previewDraft?.parseSource === 'manual' && !rawPaste.trim()) {
      setPreviewDraft(null);
    }
  };

  const handleStartEditMock = (mock: MockTestEntry) => {
    setEditingMockId(mock.id);
    setLoggerMode('manual');
    setParseMeta(null);
    setFormError('');
    setSavedBanner(null);
    setPreviewDraft({
      name: mock.name,
      source: mock.source || 'GATE Test Series',
      subjectId: mock.subjectId ?? 'all',
      date: mock.date,
      type: mock.type,
      score: mock.score,
      maxScore: mock.maxScore,
      normalizedScore: mock.normalizedScore ?? getNormalizedMockPct(mock),
      percentage: mock.percentage ?? getNormalizedMockPct(mock),
      accuracy: mock.accuracy,
      totalQuestions: mock.totalQuestions,
      attempted: mock.attempted,
      correct: mock.correct,
      wrong: mock.wrong,
      unattempted: mock.unattempted,
      q1Attempted: mock.q1Attempted,
      q2Attempted: mock.q2Attempted,
      q1Correct: mock.q1Correct,
      q2Correct: mock.q2Correct,
      q1Wrong: mock.q1Wrong,
      q2Wrong: mock.q2Wrong,
      q1Total: mock.q1Total,
      q2Total: mock.q2Total,
      positiveMarks: mock.positiveMarks,
      penaltyMarks: mock.penaltyMarks,
      q1PositiveMarks: mock.q1PositiveMarks,
      q2PositiveMarks: mock.q2PositiveMarks,
      q1PenaltyMarks: mock.q1PenaltyMarks,
      q2PenaltyMarks: mock.q2PenaltyMarks,
      durationMinutes: mock.durationMinutes,
      timeTakenMinutes: mock.timeTakenMinutes,
      rank: mock.rank,
      totalCandidates: mock.totalCandidates,
      percentile: mock.percentile,
      parseSource: mock.parseSource ?? 'manual',
      notes: mock.notes ?? '',
    });
    setShowAdvancedSplit(
      mock.penaltyMarks !== undefined ||
        mock.q1Attempted !== undefined ||
        mock.q2Attempted !== undefined ||
        mock.timeTakenMinutes !== undefined ||
        mock.rank !== undefined
    );
    loggerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateDraftField = <K extends keyof ParsedMockDraft>(
    key: K,
    value: ParsedMockDraft[K]
  ) => {
    setPreviewDraft((prev) => {
      if (!prev) return prev;
      const next: ParsedMockDraft = { ...prev, [key]: value };
      // Recompute normalizedScore when score or maxScore changes
      if (key === 'score' || key === 'maxScore') {
        const ms = Number(next.maxScore);
        const sc = Number(next.score);
        if (Number.isFinite(ms) && ms > 0 && Number.isFinite(sc)) {
          const norm = Math.round((sc / ms) * 10000) / 100;
          next.normalizedScore = Math.max(-100, Math.min(100, norm));
          next.percentage = next.normalizedScore;
        }
      }
      // Recompute accuracy when correct / wrong edited cleanly
      if (key === 'correct' || key === 'wrong') {
        const c = next.correct;
        const w = next.wrong;
        if (typeof c === 'number' && typeof w === 'number' && c + w > 0) {
          next.attempted = c + w;
          next.accuracy = Math.round((c / (c + w)) * 100);
        }
      }
      return next;
    });
  };

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewDraft) return;
    setFormError('');

    const trimmedName = previewDraft.name.trim();
    if (trimmedName.length < 3) {
      setFormError('Test name must be at least 3 characters.');
      return;
    }
    if (
      !Number.isFinite(previewDraft.score) ||
      previewDraft.score < -100 ||
      previewDraft.score > 300
    ) {
      setFormError('Resultant score must be between -100 and 300.');
      return;
    }
    if (
      !Number.isFinite(previewDraft.maxScore) ||
      previewDraft.maxScore < 1 ||
      previewDraft.maxScore > 300
    ) {
      setFormError('Max marks must be between 1 and 300.');
      return;
    }
    if (
      !Number.isFinite(previewDraft.accuracy) ||
      previewDraft.accuracy < 0 ||
      previewDraft.accuracy > 100
    ) {
      setFormError('Accuracy must be between 0% and 100%.');
      return;
    }

    const normalizedScore =
      previewDraft.maxScore > 0
        ? Math.max(
            -100,
            Math.min(100, Math.round((previewDraft.score / previewDraft.maxScore) * 10000) / 100)
          )
        : 0;

    const payload: Omit<MockTestEntry, 'id'> = {
      name: trimmedName,
      source: previewDraft.source.trim() || 'GATE Test Series',
      subjectId: previewDraft.type === 'Full-Length Mock' ? 'all' : previewDraft.subjectId,
      date: /^\d{4}-\d{2}-\d{2}$/.test(previewDraft.date) ? previewDraft.date : toLocalIsoDate(),
      type: previewDraft.type,
      score: Math.round(previewDraft.score * 100) / 100,
      maxScore: Math.round(previewDraft.maxScore * 100) / 100,
      normalizedScore,
      percentage: previewDraft.percentage ?? normalizedScore,
      accuracy: Math.max(0, Math.min(100, Math.round(previewDraft.accuracy))),
      totalQuestions: previewDraft.totalQuestions,
      attempted: previewDraft.attempted,
      correct: previewDraft.correct,
      wrong: previewDraft.wrong,
      unattempted: Math.max(0, Math.min(300, Math.round(previewDraft.unattempted ?? 0))),
      q1Attempted: previewDraft.q1Attempted,
      q2Attempted: previewDraft.q2Attempted,
      q1Correct: previewDraft.q1Correct,
      q2Correct: previewDraft.q2Correct,
      q1Wrong: previewDraft.q1Wrong,
      q2Wrong: previewDraft.q2Wrong,
      q1Total: previewDraft.q1Total,
      q2Total: previewDraft.q2Total,
      positiveMarks: previewDraft.positiveMarks,
      penaltyMarks: previewDraft.penaltyMarks,
      q1PositiveMarks: previewDraft.q1PositiveMarks,
      q2PositiveMarks: previewDraft.q2PositiveMarks,
      q1PenaltyMarks: previewDraft.q1PenaltyMarks,
      q2PenaltyMarks: previewDraft.q2PenaltyMarks,
      durationMinutes: previewDraft.durationMinutes,
      timeTakenMinutes: previewDraft.timeTakenMinutes,
      rank: previewDraft.rank && previewDraft.rank >= 1 ? Math.round(previewDraft.rank) : undefined,
      totalCandidates:
        previewDraft.totalCandidates && previewDraft.totalCandidates >= 1
          ? Math.round(previewDraft.totalCandidates)
          : undefined,
      percentile: previewDraft.percentile,
      parseSource: previewDraft.parseSource,
      notes: previewDraft.notes.trim(),
    };

    if (editingMockId && onUpdateMock) {
      onUpdateMock(editingMockId, payload);
      setSavedBanner(
        `Updated "${trimmedName}" (${previewDraft.score}/${previewDraft.maxScore} · ${normalizedScore.toFixed(1)}%).`
      );
      setEditingMockId(null);
      setPreviewDraft(null);
    } else {
      onAddMock(payload);
      setSavedBanner(
        `Logged "${trimmedName}" (${previewDraft.score}/${previewDraft.maxScore} · ${normalizedScore.toFixed(1)}%).`
      );
      setPreviewDraft(loggerMode === 'manual' ? createEmptyManualDraft() : null);
    }
    setRawPaste('');
    setParseMeta(null);
    setShowAdvancedSplit(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. SMART PASTE AUTO-LOGGER CARD */}
      <section
        ref={loggerSectionRef}
        className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 rounded-[16px] bg-[#6E261A] dark:bg-[#9E3E2E] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ClipboardPaste className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Quick Paste Test Result
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF6E3] dark:bg-[#2A2016] border border-[#EED89A] dark:border-[#4A381C] px-2.5 py-0.5 text-[10px] font-bold text-[#9C6E0E] dark:text-[#E0A92E]">
                  GO Classes + Any GATE Series
                </span>
              </div>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                Copy-paste your raw Exam Summary directly — parsed instantly with optional AI refinement.
              </p>
            </div>
          </div>

          {/* Mode Toggle Pills */}
          <div className="flex flex-nowrap items-center rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] p-1 self-start md:self-auto shrink-0 max-w-full overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => handleSwitchMode('paste')}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                loggerMode === 'paste'
                  ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white shadow-sm'
                  : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
              }`}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Smart Paste
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('manual')}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                loggerMode === 'manual'
                  ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white shadow-sm'
                  : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
              }`}
            >
              <PenLine className="h-3.5 w-3.5" />
              Manual Entry
            </button>
          </div>
        </div>

        {savedBanner && (
          <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[#C6DEC9] dark:border-[#2A4A35] bg-[#F2F8F3] dark:bg-[#18261D] px-4 py-3 text-xs font-semibold text-[#2E5E3E] dark:text-[#86C499]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{savedBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setSavedBanner(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Smart Paste Input Box */}
        {loggerMode === 'paste' && (
          <div className="space-y-3">
            <textarea
              id="smart-paste-textarea"
              rows={5}
              value={rawPaste}
              onChange={(e) => setRawPaste(e.target.value)}
              placeholder="Paste your GO Classes, Made Easy, ACE, or GateOverflow Exam Summary directly here..."
              className="w-full rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] p-4 font-mono text-xs leading-relaxed text-[#1C1613] dark:text-[#F5F0E8] placeholder:font-sans placeholder:text-[#8C7E75] focus:outline-none focus:ring-2 focus:ring-[#6E261A]/30 dark:focus:ring-[#E0A92E]/30"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[11px] font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:border-[#C89216] transition-colors"
                >
                  Load GO Classes Sample
                </button>
                {rawPaste && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawPaste('');
                      setPreviewDraft(null);
                      setParseMeta(null);
                      setFormError('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-semibold text-[#8C7E75] hover:text-[#B83227]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleParsePaste}
                className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B24735] text-white text-xs font-semibold press-tactile shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Parse &amp; Preview
              </button>
            </div>
          </div>
        )}

        {formError && !previewDraft && (
          <p className="text-xs font-semibold text-[#B83227] dark:text-[#F08A80]">{formError}</p>
        )}

        {/* Editable Preview & Confirm Drawer (shown after Smart Paste OR in Manual Entry) */}
        {previewDraft && (
          <form
            onSubmit={handleConfirmSave}
            className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#342A24] bg-[#FAF8F4] dark:bg-[#16110F] p-5 space-y-5"
          >
            {/* Preview Header + Provenance Pill */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#E8E0D5] dark:border-[#2E2520]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  {editingMockId
                    ? `Editing: ${previewDraft.name || 'Logged Test'}`
                    : loggerMode === 'manual'
                    ? 'Manual Test Entry'
                    : 'Parsed Result Preview'}
                </span>
                {parseMeta && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-bold ${
                      previewDraft.parseSource === 'ai_free_tier'
                        ? 'bg-[#FDF6E3] dark:bg-[#2E2414] border border-[#EED89A] dark:border-[#4A381C] text-[#9C6E0E] dark:text-[#E0A92E]'
                        : 'bg-[#EEF5F0] dark:bg-[#19281E] border border-[#C6DEC9] dark:border-[#2A4A35] text-[#2E5E3E] dark:text-[#86C499]'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {previewDraft.parseSource === 'ai_free_tier'
                      ? 'Parsed with AI'
                      : `Parsed Instantly · ${parseMeta.parseMs}ms`}
                  </span>
                )}
                {parseMeta && (
                  <span className="rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-2.5 py-0.5 text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E]">
                    {parseMeta.matchedFormat}
                  </span>
                )}
              </div>

              {loggerMode === 'paste' && rawPaste.trim().length >= 10 && (
                <button
                  type="button"
                  disabled={Boolean(parseMeta?.isAiRefining)}
                  onClick={() => void triggerAiRefinement(rawPaste, previewDraft)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#EED89A] dark:border-[#4A381C] bg-[#FDF6E3] dark:bg-[#2A2016] text-[11px] font-bold text-[#9C6E0E] dark:text-[#E0A92E] hover:opacity-90 disabled:opacity-50"
                >
                  {parseMeta?.isAiRefining ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {parseMeta?.isAiRefining ? 'Refining...' : 'Refine with AI'}
                </button>
              )}
            </div>

            {parseMeta?.aiStatusMessage && (
              <div className="rounded-[14px] border border-[#EED89A] dark:border-[#4A381C] bg-[#FDF6E3]/80 dark:bg-[#2A2016]/70 px-3.5 py-2 text-[11px] font-medium text-[#7A5409] dark:text-[#E8BF5A]">
                {parseMeta.aiStatusMessage}
              </div>
            )}

            {parseMeta && parseMeta.warnings.length > 0 && (
              <div className="rounded-[14px] border border-[#ECC8C3] dark:border-[#4F2520] bg-[#FDF2F0] dark:bg-[#2A1715] px-3.5 py-2 text-[11px] text-[#9A2A20] dark:text-[#F09A91] flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>{parseMeta.warnings.join(' ')}</div>
              </div>
            )}

            {/* Instant Telemetry Preview Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-[18px] bg-[#241914] text-[#FAF5EB] p-3.5 ring-1 ring-inset ring-amber-100/10">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#B8A99A]">
                  Raw / Normalized
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#E0A92E]">
                  {previewDraft.score}
                  <span className="text-xs text-[#C7B8A8]">/{previewDraft.maxScore}</span>
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[#D8CBB8]">
                  {previewDraft.normalizedScore.toFixed(1)}% normalized
                </div>
              </div>

              <div className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  Attempt Split
                </div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                  <span className="text-[#2E5E3E] dark:text-[#7BB88F]">
                    {previewDraft.correct ?? '—'}✓
                  </span>{' '}
                  ·{' '}
                  <span className="text-[#B83227] dark:text-[#E87A70]">
                    {previewDraft.wrong ?? '—'}✗
                  </span>{' '}
                  ·{' '}
                  <span className="text-[#8C7E75]">{previewDraft.unattempted} skip</span>
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                  Accuracy: {previewDraft.accuracy}%
                </div>
              </div>

              <div className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  Marks Bleed
                </div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums">
                  <span className="text-[#2E5E3E] dark:text-[#7BB88F]">
                    +{previewDraft.positiveMarks ?? Math.max(0, previewDraft.score)}
                  </span>{' '}
                  /{' '}
                  <span className="text-[#B83227] dark:text-[#E87A70]">
                    −{previewDraft.penaltyMarks ?? 0}M
                  </span>
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                  1M/2M:{' '}
                  {previewDraft.q1Attempted !== undefined || previewDraft.q2Attempted !== undefined
                    ? `${previewDraft.q1Correct ?? 0}/${previewDraft.q1Attempted ?? 0} · ${previewDraft.q2Correct ?? 0}/${previewDraft.q2Attempted ?? 0}`
                    : 'Not split'}
                </div>
              </div>

              <div className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  Time &amp; Classification
                </div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                  {previewDraft.timeTakenMinutes !== undefined ? `${previewDraft.timeTakenMinutes}m` : '—'}
                  <span className="text-xs font-normal text-[#8C7E75]">
                    {' '}
                    / {previewDraft.durationMinutes !== undefined ? `${previewDraft.durationMinutes}m` : '—'}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-[#6E261A] dark:text-[#E0A92E] mt-0.5 truncate">
                  {previewDraft.type}
                  {previewDraft.subjectId !== 'all'
                    ? ` · ${SUBJECT_MAP[previewDraft.subjectId]?.code ?? previewDraft.subjectId.toUpperCase()}`
                    : ''}
                </div>
              </div>
            </div>

            {/* Editable Core Form Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="sm:col-span-2">
                <label
                  htmlFor="preview-name"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Test Name *
                </label>
                <input
                  id="preview-name"
                  type="text"
                  value={previewDraft.name}
                  onChange={(e) => updateDraftField('name', e.target.value)}
                  placeholder="e.g. Discrete Mathematics · Topic Wise Test 2"
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-source"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Test Series Provider
                </label>
                <input
                  id="preview-source"
                  type="text"
                  value={previewDraft.source}
                  onChange={(e) => updateDraftField('source', e.target.value)}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-date"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Date
                </label>
                <input
                  id="preview-date"
                  type="date"
                  value={previewDraft.date}
                  onChange={(e) => updateDraftField('date', e.target.value)}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-type"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Test Type
                </label>
                <select
                  id="preview-type"
                  value={previewDraft.type}
                  onChange={(e) => {
                    const nextType = e.target.value as MockTestType;
                    updateDraftField('type', nextType);
                    if (nextType === 'Full-Length Mock') {
                      updateDraftField('subjectId', 'all');
                    }
                  }}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  <option value="Full-Length Mock">Full-Length Mock</option>
                  <option value="Subject Test">Subject Test</option>
                  <option value="Topic-Wise Test">Topic-Wise Test</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="preview-subject"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  GATE Subject Tag
                </label>
                <select
                  id="preview-subject"
                  value={previewDraft.subjectId}
                  onChange={(e) => updateDraftField('subjectId', e.target.value as MockSubjectId)}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  <option value="all">Full Syllabus (All 12 Subjects)</option>
                  {GATE_2027_SYLLABUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="preview-score"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Net Score *
                </label>
                <input
                  id="preview-score"
                  type="number"
                  step="0.01"
                  value={previewDraft.score}
                  onChange={(e) => updateDraftField('score', Number(e.target.value))}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-maxscore"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Max Marks *
                </label>
                <input
                  id="preview-maxscore"
                  type="number"
                  step="0.5"
                  min="1"
                  max="300"
                  value={previewDraft.maxScore}
                  onChange={(e) => updateDraftField('maxScore', Number(e.target.value))}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-accuracy"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Accuracy (%) *
                </label>
                <input
                  id="preview-accuracy"
                  type="number"
                  min="0"
                  max="100"
                  value={previewDraft.accuracy}
                  onChange={(e) => updateDraftField('accuracy', Number(e.target.value))}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-correct"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Correct Qs
                </label>
                <input
                  id="preview-correct"
                  type="number"
                  min="0"
                  max="300"
                  value={previewDraft.correct ?? ''}
                  onChange={(e) => updateDraftField('correct', parseOptionalInput(e.target.value))}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-wrong"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Wrong Qs
                </label>
                <input
                  id="preview-wrong"
                  type="number"
                  min="0"
                  max="300"
                  value={previewDraft.wrong ?? ''}
                  onChange={(e) => updateDraftField('wrong', parseOptionalInput(e.target.value))}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <div>
                <label
                  htmlFor="preview-skipped"
                  className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
                >
                  Skipped / Unattempted
                </label>
                <input
                  id="preview-skipped"
                  type="number"
                  min="0"
                  max="300"
                  value={previewDraft.unattempted}
                  onChange={(e) => updateDraftField('unattempted', Number(e.target.value))}
                  className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>
            </div>

            {/* Collapsible Advanced Breakdown (Penalty, 1M/2M Split, Time, Rank) */}
            <div className="border-t border-[#E8E0D5] dark:border-[#2E2520] pt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedSplit((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6E261A] dark:text-[#E0A92E]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {showAdvancedSplit ? 'Hide' : 'Show'} Penalty, 1M/2M Split, Timing &amp; Rank Fields
                {showAdvancedSplit ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {showAdvancedSplit && (
                <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      Positive Marks
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={previewDraft.positiveMarks ?? ''}
                      onChange={(e) =>
                        updateDraftField('positiveMarks', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      Penalty Marks
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={previewDraft.penaltyMarks ?? ''}
                      onChange={(e) =>
                        updateDraftField('penaltyMarks', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      Time Taken (m)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={previewDraft.timeTakenMinutes ?? ''}
                      onChange={(e) =>
                        updateDraftField('timeTakenMinutes', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      Duration (m)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={previewDraft.durationMinutes ?? ''}
                      onChange={(e) =>
                        updateDraftField('durationMinutes', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      AIR / Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={previewDraft.rank ?? ''}
                      onChange={(e) => updateDraftField('rank', parseOptionalInput(e.target.value))}
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      Percentile
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={previewDraft.percentile ?? ''}
                      onChange={(e) =>
                        updateDraftField('percentile', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>

                  {/* 1M / 2M split row */}
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      1M Correct
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={previewDraft.q1Correct ?? ''}
                      onChange={(e) =>
                        updateDraftField('q1Correct', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      1M Wrong
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={previewDraft.q1Wrong ?? ''}
                      onChange={(e) =>
                        updateDraftField('q1Wrong', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      1M Penalty
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={previewDraft.q1PenaltyMarks ?? ''}
                      onChange={(e) =>
                        updateDraftField('q1PenaltyMarks', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      2M Correct
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={previewDraft.q2Correct ?? ''}
                      onChange={(e) =>
                        updateDraftField('q2Correct', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      2M Wrong
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={previewDraft.q2Wrong ?? ''}
                      onChange={(e) =>
                        updateDraftField('q2Wrong', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                      2M Penalty
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={previewDraft.q2PenaltyMarks ?? ''}
                      onChange={(e) =>
                        updateDraftField('q2PenaltyMarks', parseOptionalInput(e.target.value))
                      }
                      className="w-full h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-3 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Post-Test Reflection Notes */}
            <div>
              <label
                htmlFor="preview-notes"
                className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1"
              >
                Mistake Notes &amp; Next-Test Action Items (Optional)
              </label>
              <textarea
                id="preview-notes"
                rows={2}
                value={previewDraft.notes}
                onChange={(e) => updateDraftField('notes', e.target.value)}
                placeholder="e.g. Lost 1.33M on 2-mark predicate logic quantifiers; revise negation rules before TWT 3."
                className="w-full rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
              />
            </div>

            {formError && (
              <p className="text-xs font-semibold text-[#B83227] dark:text-[#F08A80]">{formError}</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPreviewDraft(null);
                  setEditingMockId(null);
                  setParseMeta(null);
                  setFormError('');
                }}
                className="px-4 py-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] hover:bg-[#FFFFFF] dark:hover:bg-[#1C1714]"
              >
                {editingMockId ? 'Cancel Edit' : 'Discard'}
              </button>
              <button
                type="submit"
                data-testid="mock-confirm-save-btn"
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B24735] text-white text-xs font-semibold press-tactile shadow-sm"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {editingMockId ? 'Save Changes' : 'Confirm & Save'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 2. FILTER PILLS + 5-KPI EXECUTIVE TELEMETRY STRIP */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div
            role="tablist"
            aria-label="Filter mock tests by type"
            className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1"
          >
            {(
              [
                { id: 'all', label: 'All Tests', count: allCounts.all },
                { id: 'Full-Length Mock', label: 'Full-Length Mocks', count: allCounts.full },
                { id: 'Subject Test', label: 'Subject Tests', count: allCounts.subject },
                { id: 'Topic-Wise Test', label: 'Topic-Wise Tests', count: allCounts.topic },
              ] as const
            ).map((pill) => {
              const active = typeFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={(e) => {
                    setTypeFilter(pill.id);
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      inline: 'center',
                      block: 'nearest',
                    });
                  }}
                  className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    active
                      ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white shadow-sm'
                      : 'border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#A99B8E] hover:border-[#C89216]'
                  }`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
            <span className="text-[11px] font-mono text-[#8C7E75] dark:text-[#A99B8E] truncate">
              Scores normalized to 100%
            </span>
            {onExportMockPdf && (
              <button
                type="button"
                onClick={onExportMockPdf}
                data-testid="mock-export-pdf-btn"
                className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[#6E261A] dark:text-[#E0A92E] text-xs font-bold hover:border-[#C89216] press-tactile"
              >
                <FileDown className="h-3.5 w-3.5" />
                Export PDF
              </button>
            )}
          </div>
        </div>

        {/* 5-KPI Bento Telemetry Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm">
            <div className="text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E]">
              Tests Logged
            </div>
            <div className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
              {diagnostics.totalTests}
            </div>
            <div className="mt-1 text-[11px] text-[#8C7E75] dark:text-[#A99B8E]">
              {diagnostics.fullLengthCount} FLT · {diagnostics.subjectTestCount} SWT ·{' '}
              {diagnostics.topicTestCount} TWT
            </div>
          </div>

          <div className="rounded-[24px] squircle bg-[#241914] p-5 shadow-warm ring-1 ring-inset ring-amber-100/10">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#C7B8A8]">
              <span>Avg / Peak Norm %</span>
              <Award className="h-3.5 w-3.5 text-[#E0A92E]" />
            </div>
            <div className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#E0A92E]">
              {diagnostics.avgNormalizedPct.toFixed(1)}%
            </div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-[#D8CBB8]">
              Peak: {diagnostics.peakNormalizedPct.toFixed(1)}%
            </div>
          </div>

          <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm">
            <div className="text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E]">
              Mean Accuracy
            </div>
            <div className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#2E5E3E] dark:text-[#7BB88F]">
              {diagnostics.meanAccuracy}%
            </div>
            <div className="mt-1 text-[11px] text-[#8C7E75] dark:text-[#A99B8E]">
              AIR &lt; 500 benchmark: ≥80%
            </div>
          </div>

          <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E]">
              <span>Negative Bleed</span>
              <Flame className="h-3.5 w-3.5 text-[#B83227] dark:text-[#E06B60]" />
            </div>
            <div className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#B83227] dark:text-[#E87A70]">
              −{diagnostics.totalPenaltyBleed.toFixed(2)}
            </div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-[#8C7E75] dark:text-[#A99B8E]">
              Avg −{diagnostics.avgPenaltyPerTest.toFixed(2)}M / test
            </div>
          </div>

          <div className="col-span-2 md:col-span-1 rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E]">
              <span>Avg Pace</span>
              <Gauge className="h-3.5 w-3.5 text-[#C89216] dark:text-[#E0A92E]" />
            </div>
            <div className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#6E261A] dark:text-[#F5F0E8]">
              {diagnostics.avgMinutesPerQuestion !== null
                ? `${diagnostics.avgMinutesPerQuestion.toFixed(1)}m`
                : '—'}
            </div>
            <div className="mt-1 text-[11px] text-[#8C7E75] dark:text-[#A99B8E]">
              {diagnostics.avgMinutesPerQuestion !== null
                ? 'min / attempted Q (GATE: 2.7m)'
                : 'Log timed tests to track pace'}
            </div>
          </div>
        </div>
      </section>

      {/* 3. AUTOMATED DIAGNOSTIC INSIGHTS BANNER */}
      {diagnostics.insights.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {diagnostics.insights.map((insight, idx) => {
            const toneStyles =
              insight.tone === 'alert'
                ? 'border-[#ECC8C3] dark:border-[#522722] bg-[#FDF4F2] dark:bg-[#261614] text-[#8C241B] dark:text-[#F29B92]'
                : insight.tone === 'gold'
                ? 'border-[#EED89A] dark:border-[#4A381C] bg-[#FDF8EA] dark:bg-[#261E13] text-[#845C0A] dark:text-[#E8BF5A]'
                : 'border-[#C6DEC9] dark:border-[#2A4A35] bg-[#F3F9F4] dark:bg-[#16251B] text-[#244E33] dark:text-[#86C499]';
            return (
              <div
                key={`${insight.title}-${idx}`}
                className={`rounded-[22px] squircle border p-4 space-y-1 ${toneStyles}`}
              >
                <div className="text-xs font-bold">{insight.title}</div>
                <p className="text-[11px] leading-relaxed opacity-90">{insight.detail}</p>
              </div>
            );
          })}
        </section>
      )}

      {/* 4. MULTI-CHART DIAGNOSTICS ENGINE (ROW 1: PROGRESSION + MARKS BLEED) */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Chart 1: Normalized Score (%) & Accuracy (%) Progression */}
        <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm">
          <div className="mb-4">
            <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Normalized Score (%) &amp; Accuracy Trajectory
            </h3>
            <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
              Compares 25M topic tests, 50M subject tests, and 100M full mocks on a unified 0–100% scale
            </p>
          </div>

          {diagnostics.progressionSeries.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#61554D] dark:text-[#A99B8E] border border-dashed border-[#E8E0D5] dark:border-[#2E2520] rounded-[20px]">
              Paste or log your first test above to chart your score &amp; accuracy curve.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={diagnostics.progressionSeries}
                  margin={{ top: 10, right: 12, left: -12, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="iitmMaroonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={maroonColor} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={maroonColor} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="iitmOliveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={oliveColor} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={oliveColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
                  <ReferenceLine
                    y={65}
                    stroke={goldColor}
                    strokeDasharray="4 4"
                    label={{
                      value: 'AIR < 500 Target (65%)',
                      position: 'insideTopLeft',
                      fill: goldColor,
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val: unknown, name: unknown) => [
                      `${Number(val).toFixed(1)}%`,
                      String(name),
                    ]}
                    labelFormatter={(_label, payload) => {
                      const item = payload?.[0]?.payload as
                        | { fullName?: string; rawScoreText?: string }
                        | undefined;
                      return item?.fullName
                        ? `${item.fullName} (${item.rawScoreText})`
                        : String(_label);
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="normalizedPct"
                    name="Normalized Score (%)"
                    stroke={maroonColor}
                    fill="url(#iitmMaroonGrad)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: maroonColor }}
                  />
                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    name="Accuracy (%)"
                    stroke={oliveColor}
                    fill="url(#iitmOliveGrad)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: oliveColor }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Marks Bleed Breakdown (Positive vs Negative Penalty vs Net) */}
        <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm">
          <div className="mb-4">
            <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Marks Bleed Breakdown (Positive vs. Negative Penalty)
            </h3>
            <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
              Pinpoints exactly how many earned marks are eroded by negative marking per test
            </p>
          </div>

          {diagnostics.progressionSeries.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#61554D] dark:text-[#A99B8E] border border-dashed border-[#E8E0D5] dark:border-[#2E2520] rounded-[20px]">
              Log tests with penalty data (GO Classes auto-parsed!) to inspect negative marks bleed.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={diagnostics.progressionSeries}
                  margin={{ top: 10, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
                  <YAxis tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_label, payload) => {
                      const item = payload?.[0]?.payload as { fullName?: string } | undefined;
                      return item?.fullName ?? String(_label);
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey="positiveMarks"
                    name="Positive Marks"
                    fill={oliveColor}
                    radius={[7, 7, 0, 0]}
                  />
                  <Bar
                    dataKey="penaltyMarks"
                    name="Penalty Bleed"
                    fill={crimsonColor}
                    radius={[7, 7, 0, 0]}
                  />
                  <Bar
                    dataKey="netScore"
                    name="Net Resultant"
                    fill={goldColor}
                    radius={[7, 7, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* 5. MULTI-CHART DIAGNOSTICS ENGINE (ROW 2: ATTEMPT COMPOSITION + 1M VS 2M SPLIT) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Chart 3: Attempt Composition Stacked Bar */}
        <div className="xl:col-span-7 rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm">
          <div className="mb-4">
            <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Attempt Composition (Correct · Wrong · Skipped)
            </h3>
            <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
              Track question selection discipline and skipped-question ratio across tests
            </p>
          </div>

          {!hasAttemptBreakdown ? (
            <div className="h-60 flex items-center justify-center text-xs text-[#61554D] dark:text-[#A99B8E] border border-dashed border-[#E8E0D5] dark:border-[#2E2520] rounded-[20px]">
              Paste a test summary with Correct / Wrong / Skipped counts to visualize attempt composition.
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={diagnostics.progressionSeries}
                  margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
                  <YAxis tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_label, payload) => {
                      const item = payload?.[0]?.payload as { fullName?: string } | undefined;
                      return item?.fullName ?? String(_label);
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="correct" stackId="q" name="Correct" fill={oliveColor} />
                  <Bar dataKey="wrong" stackId="q" name="Wrong" fill={crimsonColor} />
                  <Bar
                    dataKey="unattempted"
                    stackId="q"
                    name="Skipped"
                    fill={stoneColor}
                    radius={[7, 7, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Dedicated 1-Mark vs 2-Mark Accuracy & Penalty Split Card */}
        <div className="xl:col-span-5 rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                1-Mark vs. 2-Mark Split
              </h3>
              <span className="rounded-full bg-[#FDF6E3] dark:bg-[#2A2016] border border-[#EED89A] dark:border-[#4A381C] px-2.5 py-0.5 text-[10px] font-bold text-[#9C6E0E] dark:text-[#E0A92E]">
                GO Classes Telemetry
              </span>
            </div>
            <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
              2-mark MCQs carry −0.67 penalty — track accuracy &amp; bleed separately for 1M vs 2M.
            </p>
          </div>

          {diagnostics.q1Stats.attempted === 0 && diagnostics.q2Stats.attempted === 0 ? (
            <div className="mt-4 h-44 flex items-center justify-center text-center px-4 text-xs text-[#61554D] dark:text-[#A99B8E] border border-dashed border-[#E8E0D5] dark:border-[#2E2520] rounded-[20px]">
              Paste a GO Classes summary (with <code className="font-mono mx-1">(1M + 2M)</code> splits) to unlock 1-mark vs 2-mark diagnostics.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {/* 1-Mark Card */}
              <div className="rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    1-Mark Questions <span className="font-normal text-[#8C7E75]">(−0.33 MCQ)</span>
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#6E261A] dark:text-[#E0A92E]">
                    {diagnostics.q1Stats.accuracy}% acc
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#E8E0D5] dark:bg-[#352B25] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#C89216] dark:bg-[#E0A92E] transition-all duration-500"
                    style={{ width: `${Math.min(100, diagnostics.q1Stats.accuracy)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E]">
                  <span>
                    {diagnostics.q1Stats.correct}✓ / {diagnostics.q1Stats.wrong}✗ of{' '}
                    {diagnostics.q1Stats.attempted} attempted
                  </span>
                  <span className="font-bold text-[#B83227] dark:text-[#E87A70]">
                    −{diagnostics.q1Stats.penaltyMarks.toFixed(2)}M bleed
                  </span>
                </div>
              </div>

              {/* 2-Mark Card */}
              <div className="rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    2-Mark Questions <span className="font-normal text-[#8C7E75]">(−0.67 MCQ)</span>
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[#2E5E3E] dark:text-[#7BB88F]">
                    {diagnostics.q2Stats.accuracy}% acc
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#E8E0D5] dark:bg-[#352B25] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#6E261A] dark:bg-[#D4624E] transition-all duration-500"
                    style={{ width: `${Math.min(100, diagnostics.q2Stats.accuracy)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E]">
                  <span>
                    {diagnostics.q2Stats.correct}✓ / {diagnostics.q2Stats.wrong}✗ of{' '}
                    {diagnostics.q2Stats.attempted} attempted
                  </span>
                  <span className="font-bold text-[#B83227] dark:text-[#E87A70]">
                    −{diagnostics.q2Stats.penaltyMarks.toFixed(2)}M bleed
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 6. CHART 4: SUBJECT MASTERY + MOCK AVG % VS GATE WEIGHTAGE ROI MATRIX */}
      <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-5">
        <div>
          <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
            Subject Mastery &amp; Mock Performance vs. GATE Weightage (ROI Matrix)
          </h3>
          <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
            Compare syllabus mastery (%), subject/topic mock average (%), and official IITM GATE weightage across all 12 subjects
          </p>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={diagnostics.subjectMatrix}
              margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="code" tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: axisTick }} stroke={gridStroke} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar
                dataKey="mastery"
                name="Syllabus Mastery (%)"
                fill={maroonColor}
                radius={[7, 7, 0, 0]}
              />
              <Bar
                dataKey="mockAvgPct"
                name="Subject Mock Avg (%)"
                fill={oliveColor}
                radius={[7, 7, 0, 0]}
              />
              <Bar
                dataKey="weightage"
                name="GATE Weight (Marks)"
                fill={goldColor}
                radius={[7, 7, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Highest-ROI Next Study Targets */}
        <div className="pt-2 border-t border-[#EFE9DF] dark:border-[#2E2520]">
          <div className="flex items-center gap-2 mb-3.5">
            <TrendingUp className="h-4 w-4 text-[#C89216] dark:text-[#E0A92E]" />
            <h4 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Highest-ROI Subjects to Study Next
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topRoiTargets.map((item, idx) => (
              <div
                key={item.code}
                className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-[#B58210] dark:text-[#E0A92E]">
                    Priority #{idx + 1} · {item.code}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#6E261A] dark:text-[#FAF5EB]">
                    +{item.unrealizedMarks} marks
                  </span>
                </div>
                <div className="mt-1.5 font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  {item.name}
                </div>
                <div className="mt-1 font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E]">
                  Weightage: {item.weightage}M · Mastery: {item.mastery}%
                  {item.mockAvgPct !== null ? ` · Mock Avg: ${item.mockAvgPct}%` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. UPGRADED LOGGED TESTS ARCHIVE TABLE */}
      <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] shadow-warm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8E0D5] dark:border-[#2E2520] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Logged Tests Archive
            </h3>
            <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
              Auto-synced · Showing {filteredMocks.length} of {mocks.length} logged test
              {mocks.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {filteredMocks.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#61554D] dark:text-[#A99B8E]">
            {mocks.length === 0
              ? 'No tests logged yet. Paste a GO Classes or GATE Test Series summary above to log your first test in one click.'
              : 'No tests match this filter. Switch to "All Tests" to view your complete log.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[11px] font-bold text-[#61554D] dark:text-[#A99B8E]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Test Name &amp; Subject</th>
                  <th className="py-3 px-4">Series / Type</th>
                  <th className="py-3 px-4 text-right">Score / Norm %</th>
                  <th className="py-3 px-4 text-right">Accuracy</th>
                  <th className="py-3 px-4 text-right">C / W / S</th>
                  <th className="py-3 px-4 text-right">Penalty &amp; 1M/2M</th>
                  <th className="py-3 px-4 text-right">Time / Rank</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE9DF] dark:divide-[#2E2520] text-xs">
                {[...filteredMocks].reverse().map((m) => {
                  const normPct = getNormalizedMockPct(m);
                  const subjCode =
                    m.subjectId && m.subjectId !== 'all'
                      ? SUBJECT_MAP[m.subjectId]?.code ?? m.subjectId.toUpperCase()
                      : null;
                  const hasSplit =
                    m.q1Attempted !== undefined || m.q2Attempted !== undefined;
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-[#FAF8F4] dark:hover:bg-[#221B17] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#61554D] dark:text-[#A99B8E] whitespace-nowrap">
                        {m.date}
                      </td>
                      <td className="py-3.5 px-4 min-w-[230px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                            {m.name}
                          </span>
                          {subjCode && (
                            <span className="rounded-full bg-[#FDF6E3] dark:bg-[#2A2016] border border-[#EED89A] dark:border-[#4A381C] px-2 py-0.5 font-mono text-[10px] font-bold text-[#9C6E0E] dark:text-[#E0A92E]">
                              {subjCode}
                            </span>
                          )}
                        </div>
                        {m.notes && (
                          <div className="mt-0.5 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                            {m.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-[#61554D] dark:text-[#D8CBB8]">
                        <div className="font-medium">{m.source}</div>
                        <div className="text-[11px] text-[#8C7E75] dark:text-[#A99B8E]">
                          {m.type}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-bold text-[#6E261A] dark:text-[#E0A92E]">
                          {m.score.toFixed(2)} / {m.maxScore}
                        </div>
                        <div className="text-[11px] text-[#8C7E75] dark:text-[#A99B8E]">
                          {normPct.toFixed(1)}%
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#2E5E3E] dark:text-[#7BB88F] whitespace-nowrap">
                        {m.accuracy}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        {m.correct !== undefined || m.wrong !== undefined ? (
                          <span>
                            <span className="text-[#2E5E3E] dark:text-[#7BB88F] font-semibold">
                              {m.correct ?? 0}
                            </span>
                            <span className="text-[#8C7E75]"> / </span>
                            <span className="text-[#B83227] dark:text-[#E87A70] font-semibold">
                              {m.wrong ?? 0}
                            </span>
                            <span className="text-[#8C7E75]"> / {m.unattempted}</span>
                          </span>
                        ) : (
                          <span className="text-[#8C7E75]">{m.unattempted} skip</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div
                          className={
                            (m.penaltyMarks ?? 0) > 0
                              ? 'font-bold text-[#B83227] dark:text-[#E87A70]'
                              : 'text-[#8C7E75]'
                          }
                        >
                          {(m.penaltyMarks ?? 0) > 0
                            ? `−${Number(m.penaltyMarks).toFixed(2)}M`
                            : '0.00M'}
                        </div>
                        {hasSplit && (
                          <div className="text-[10px] text-[#8C7E75] dark:text-[#A99B8E]">
                            1M:{m.q1Correct ?? 0}/{m.q1Attempted ?? 0} · 2M:{m.q2Correct ?? 0}/
                            {m.q2Attempted ?? 0}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-[#61554D] dark:text-[#D8CBB8]">
                        <div>
                          {m.timeTakenMinutes !== undefined ? `${m.timeTakenMinutes}m` : '—'}
                          {m.durationMinutes !== undefined ? ` / ${m.durationMinutes}m` : ''}
                        </div>
                        {(m.rank || m.percentile !== undefined) && (
                          <div className="text-[10px] text-[#B58210] dark:text-[#E0A92E]">
                            {m.rank ? `AIR ${m.rank}` : ''}
                            {m.rank && m.percentile !== undefined ? ' · ' : ''}
                            {m.percentile !== undefined ? `${m.percentile}%ile` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {onUpdateMock && (
                            <button
                              type="button"
                              onClick={() => handleStartEditMock(m)}
                              data-testid={`edit-mock-btn-${m.id}`}
                              aria-label={`Edit mock test ${m.name}`}
                              className="p-1.5 rounded-full text-[#8C7E75] hover:text-[#6E261A] dark:hover:text-[#E0A92E] hover:bg-[#FAF8F4] dark:hover:bg-[#2A201B]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteMock(m.id)}
                            aria-label={`Delete mock test ${m.name}`}
                            className="p-1.5 rounded-full text-[#8C7E75] hover:text-[#B83227] hover:bg-[#FBEAE8] dark:hover:bg-[#3A1E1B]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
