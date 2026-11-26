import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Filter,
  Clock,
  Zap,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  EyeOff,
  Shuffle,
  FileDown,
  RotateCcw,
} from 'lucide-react';
import type {
  GateRSyncStatus,
  PdfExportRequest,
  PyqSourceFilter,
  Question,
  QuestionFormat,
  SubjectId,
  WarRoomState,
} from '../types';
import { GATE_2027_SYLLABUS } from '../data/syllabus';
import {
  extractTopSubtopicTags,
  type StatusFilterMode,
  type YearRangePreset,
} from '../utils/gaterNormalizer';
import {
  buildExactCountTest,
  computeSourceFilterCounts,
  computeSubjectMatchCounts,
  computeUniqueFilteredPool,
  readServedQuestionHistory,
  recordServedQuestions,
  resetServedQuestionHistory,
  type TestBuilderFilterCriteria,
} from '../utils/testBuilder';
import type { GaStreakMetrics } from '../utils/gaStreak';
import { DailyGaLockInCard } from './DailyGaLockInCard';

export type SessionMode = 'cbt_mock' | 'practice_sprint';

interface PyqTestBuilderProps {
  state: WarRoomState;
  allQuestions: Question[];
  gaterSyncStatus: GateRSyncStatus;
  gaterCount: number;
  arshanCount?: number;
  enrichedCount?: number;
  verifiedBankCount?: number;
  syncProgressMsg?: string;
  gaterSyncedAt: string;
  gaterError: string;
  onResyncGateR: () => Promise<{ ok?: boolean; message?: string } | unknown>;
  onStartSession: (
    title: string,
    questions: Question[],
    mode: SessionMode
  ) => void;
  onStartDailyDpp: () => void;
  gaStreakMetrics?: GaStreakMetrics;
  onStartGaSprint?: () => void;
  onRequestPdfExport: (req: PdfExportRequest) => void;
  onNotify?: (msg: string) => void;
}

const YEAR_PRESETS: Array<{ id: YearRangePreset; label: string }> = [
  { id: 'all', label: 'All Years' },
  { id: '2021-2026', label: '2021–2026' },
  { id: '2014-2020', label: '2014–2020' },
  { id: '2008-2013', label: '2008–2013' },
  { id: 'pre-2008', label: 'Pre-2008' },
];

const STATUS_OPTIONS: Array<{ id: StatusFilterMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unattempted', label: 'Unattempted Only' },
  { id: 'mistakes', label: 'Mistake Bucket' },
  { id: 'bookmarked', label: 'Bookmarked' },
];

const SOURCE_FILTERS: Array<{ id: PyqSourceFilter; label: string }> = [
  { id: 'all', label: 'All Questions' },
  { id: 'pyq_only', label: 'PYQs Only' },
  { id: 'extra_predicted', label: 'Extra & Predicted 2027' },
  { id: 'verified_only', label: 'Verified Answer Key Only' },
  { id: 'arshan_bank', label: 'Arshan Bank' },
  { id: 'gater_bank', label: 'GateR Bank' },
];

export const PyqTestBuilder: React.FC<PyqTestBuilderProps> = ({
  state,
  allQuestions,
  gaterSyncStatus,
  gaterCount,
  arshanCount = 0,
  enrichedCount = 0,
  verifiedBankCount,
  syncProgressMsg = '',
  gaterSyncedAt,
  gaterError,
  onResyncGateR,
  onStartSession,
  onStartDailyDpp,
  gaStreakMetrics,
  onStartGaSprint,
  onRequestPdfExport,
  onNotify,
}) => {
  const [selectedSubjects, setSelectedSubjects] = useState<SubjectId[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<PyqSourceFilter>('all');
  const [tagSearch, setTagSearch] = useState<string>('');
  const [yearRange, setYearRange] = useState<YearRangePreset>('all');
  const [specificYear, setSpecificYear] = useState<number | null>(null);
  const [marksFilter, setMarksFilter] = useState<'all' | 1 | 2>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | QuestionFormat>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterMode>('all');
  const [hideRemoved2027, setHideRemoved2027] = useState<boolean>(
    state.settings.autoHideRemoved2027 ?? true
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessionMode, setSessionMode] = useState<SessionMode>('practice_sprint');
  const [questionCount, setQuestionCount] = useState<number>(25);
  const [shuffleOrder, setShuffleOrder] = useState<boolean>(true);
  const [servedHistory, setServedHistory] = useState<Record<string, number>>(() =>
    readServedQuestionHistory()
  );

  useEffect(() => {
    setHideRemoved2027(state.settings.autoHideRemoved2027 ?? true);
  }, [state.settings.autoHideRemoved2027]);

  const criteria: TestBuilderFilterCriteria = useMemo(
    () => ({
      subjects: selectedSubjects,
      tags: selectedTags,
      sourceFilter,
      yearRange,
      specificYear,
      marks: marksFilter,
      format: formatFilter,
      status: statusFilter,
      hideRemoved2027,
      searchQuery,
    }),
    [
      selectedSubjects,
      selectedTags,
      sourceFilter,
      yearRange,
      specificYear,
      marksFilter,
      formatFilter,
      statusFilter,
      hideRemoved2027,
      searchQuery,
    ]
  );

  // Strictly deduplicated filtered pool matching EVERY active filter (never silently drops unverified Qs)
  const matchedQuestions = useMemo(
    () =>
      computeUniqueFilteredPool(
        allQuestions,
        criteria,
        state.attempts,
        state.mistakes,
        state.bookmarkedQuestions
      ),
    [allQuestions, criteria, state.attempts, state.mistakes, state.bookmarkedQuestions]
  );

  // Live accurate matching counts per subject chip under current non-subject filters
  const subjectCounts = useMemo(
    () =>
      computeSubjectMatchCounts(
        allQuestions,
        criteria,
        state.attempts,
        state.mistakes,
        state.bookmarkedQuestions
      ),
    [allQuestions, criteria, state.attempts, state.mistakes, state.bookmarkedQuestions]
  );

  // Live counts per Source filter pill
  const sourceCounts = useMemo(
    () => computeSourceFilterCounts(allQuestions, hideRemoved2027),
    [allQuestions, hideRemoved2027]
  );

  const removed2027Count = useMemo(
    () => allQuestions.filter((q) => q.isOutOf2027Syllabus).length,
    [allQuestions]
  );

  // Available paper years for specific-year picker (includes 2027 for Predicted GATE 2027)
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const q of allQuestions) {
      if (q.year) years.add(q.year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allQuestions]);

  // Searchable subtopic tags scoped to selected subjects
  const topTags = useMemo(
    () => extractTopSubtopicTags(allQuestions, selectedSubjects, 90),
    [allQuestions, selectedSubjects]
  );

  const visibleTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const list = q ? topTags.filter((t) => t.tag.includes(q)) : topTags;
    return list.slice(0, 24);
  }, [topTags, tagSearch]);

  const toggleSubject = (id: SubjectId) => {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const resetFilters = () => {
    setSelectedSubjects([]);
    setSelectedTags([]);
    setSourceFilter('all');
    setTagSearch('');
    setYearRange('all');
    setSpecificYear(null);
    setMarksFilter('all');
    setFormatFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const handleSyncAllReposClick = useCallback(async () => {
    const res = (await onResyncGateR()) as { ok?: boolean; message?: string } | undefined;
    if (res?.message && onNotify) {
      onNotify(res.message);
    }
  }, [onResyncGateR, onNotify]);

  const handleResetSeenHistory = useCallback(() => {
    const empty = resetServedQuestionHistory();
    setServedHistory(empty);
    onNotify?.('Seen question history cleared · Fresh rotation reset.');
  }, [onNotify]);

  const handleLaunch = () => {
    if (matchedQuestions.length === 0) return;

    const selection = buildExactCountTest({
      pool: matchedQuestions,
      requestedCount: questionCount,
      attemptedIds: state.attempts,
      servedHistory,
      shuffleOrder,
    });

    if (selection.questions.length === 0) return;

    // Immediately record selected IDs in servedQuestionHistory so consecutive tests pull completely fresh Qs
    const nextHistory = recordServedQuestions(
      selection.questions.map((q) => q.id),
      Date.now(),
      servedHistory
    );
    setServedHistory(nextHistory);

    const modeLabel = sessionMode === 'cbt_mock' ? 'Timed CBT Mock' : 'Practice Sprint';
    const scopeLabel =
      sourceFilter === 'extra_predicted'
        ? 'Predicted GATE 2027'
        : yearRange === 'specific' && specificYear
        ? specificYear === 2027
          ? 'Predicted GATE 2027'
          : `GATE ${specificYear}`
        : selectedSubjects.length === 1
        ? GATE_2027_SYLLABUS.find((s) => s.id === selectedSubjects[0])?.shortName ?? 'Subject'
        : selectedSubjects.length > 1
        ? `${selectedSubjects.length} Subjects`
        : 'Full GATE CSE Bank';

    onStartSession(
      `${scopeLabel} · ${modeLabel} (${selection.questions.length} Qs)`,
      selection.questions,
      sessionMode
    );
  };

  const handleExportWorksheetPdf = () => {
    if (matchedQuestions.length === 0) return;
    const cap =
      questionCount === 9999
        ? Math.min(65, matchedQuestions.length)
        : Math.min(questionCount, 65);
    const batch = matchedQuestions.slice(0, cap);
    const scopeLabel =
      sourceFilter === 'extra_predicted'
        ? 'Predicted GATE 2027'
        : yearRange === 'specific' && specificYear
        ? `GATE ${specificYear}`
        : selectedSubjects.length === 1
        ? GATE_2027_SYLLABUS.find((s) => s.id === selectedSubjects[0])?.name ?? 'Subject'
        : selectedSubjects.length > 1
        ? `${selectedSubjects.length} Selected Subjects`
        : 'GATE CSE PYQ Bank';
    onRequestPdfExport({
      kind: 'test-pack',
      title: `${scopeLabel} · Practice Sheet (${batch.length} Qs)`,
      questions: batch,
      defaultLayout: 'worksheet',
      savedSketches: state.savedSketches,
      mistakeMap: state.mistakes,
    });
  };

  const totalBankCount = allQuestions.length;
  const totalVerifiedCount =
    verifiedBankCount ?? sourceCounts.verified_only;
  const seenHistoryCount = Object.keys(servedHistory).length;
  const effectiveBatchCount =
    questionCount === 9999
      ? matchedQuestions.length
      : Math.min(matchedQuestions.length, questionCount);
  const hasShortfall =
    questionCount !== 9999 &&
    matchedQuestions.length > 0 &&
    matchedQuestions.length < questionCount;

  return (
    <div className="space-y-5">
      {/* Combined GateR + Arshan Sync Status Banner Pill Bar */}
      <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] px-5 py-4 shadow-warm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {gaterSyncStatus === 'syncing' ? (
            <span
              data-testid="gater-sync-pill"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-xs font-semibold text-[#8B6209] dark:text-[#E0A92E]"
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Syncing GateR + Arshan GitHub Banks into IndexedDB...
            </span>
          ) : gaterSyncStatus === 'synced' ? (
            <span
              data-testid="gater-sync-pill"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#B8D7C3] dark:border-[#264D34] bg-[#EBF5EE] dark:bg-[#152B1D] text-xs font-semibold text-[#2E5E3E] dark:text-[#7BB88F]"
            >
              <span className="h-2 w-2 rounded-full bg-[#2E5E3E] dark:bg-[#7BB88F] shrink-0" />
              Bank Synced · {totalBankCount.toLocaleString()} Qs (GateR + Arshan ·{' '}
              {totalVerifiedCount.toLocaleString()} With Verified Answers)
            </span>
          ) : (
            <span
              data-testid="gater-sync-pill"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-xs font-semibold text-[#8B6209] dark:text-[#E0A92E]"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Local Cache · {totalBankCount.toLocaleString()} Qs Ready ({totalVerifiedCount} Verified)
            </span>
          )}

          <span className="text-[11px] font-mono text-[#61554D] dark:text-[#A99B8E] tabular-nums">
            {gaterCount > 0 ? `${gaterCount.toLocaleString()} GateR` : 'Curated'}
            {arshanCount > 0 ? ` · ${arshanCount} Arshan` : ''}
            {enrichedCount > 0 ? ` (${enrichedCount} Enriched Keys)` : ''}
            {gaterSyncedAt ? ' · Cached Offline' : ''}
          </span>
        </div>

        <div className="flex flex-nowrap md:flex-wrap items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-1 -mx-1 md:mx-0 md:px-0 w-full md:w-auto">
          <button
            type="button"
            data-testid="sync-all-repos-btn"
            onClick={() => void handleSyncAllReposClick()}
            disabled={gaterSyncStatus === 'syncing'}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] dark:hover:border-[#E0A92E] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] disabled:opacity-50 press-tactile"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${gaterSyncStatus === 'syncing' ? 'animate-spin' : ''}`}
            />
            <span>Sync All Repos</span>
          </button>

          <button
            type="button"
            onClick={onStartDailyDpp}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-8 px-3.5 sm:px-4 rounded-full bg-[#241914] hover:bg-[#32241D] dark:bg-[#E0A92E] dark:text-[#1C1613] text-[#FAF5EB] text-xs font-semibold press-tactile"
          >
            <Zap className="h-3.5 w-3.5 text-[#E0A92E] dark:text-[#1C1613]" />
            <span className="sm:hidden">Daily DPP (10 Qs)</span>
            <span className="hidden sm:inline">Daily Mixed DPP (10 Qs)</span>
          </button>
        </div>
      </div>

      {gaterError && (
        <div className="rounded-[20px] border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] px-4 py-2.5 text-xs text-[#8B6209] dark:text-[#E0A92E]">
          {gaterError}
        </div>
      )}

      {!gaterError && syncProgressMsg && gaterSyncStatus === 'syncing' && (
        <div className="rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] px-4 py-2 text-xs text-[#61554D] dark:text-[#A99B8E]">
          {syncProgressMsg}
        </div>
      )}

      {/* Daily 10-Min General Aptitude (GA) Lock-In Streak Banner */}
      {gaStreakMetrics && onStartGaSprint && (
        <DailyGaLockInCard
          metrics={gaStreakMetrics}
          availableGaCount={subjectCounts['ga'] ?? 0}
          onStartGaSprint={onStartGaSprint}
          variant="compact"
        />
      )}

      {/* Main Curved Flexible Test Builder Card */}
      <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E8E0D5] dark:border-[#2E2520]">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6E261A] dark:text-[#E0A92E]">
              <Filter className="h-3.5 w-3.5" />
              Real GATE CBT Test Builder
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Filter by Source, Subject, Subtopic, Paper Year &amp; Format
            </h2>
          </div>

          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-1 -mx-1 sm:mx-0 sm:px-0 w-full sm:w-auto">
            {/* Hide Removed 2027 Topics Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={hideRemoved2027}
              onClick={() => setHideRemoved2027((v) => !v)}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-2 h-8 px-3.5 rounded-full border text-xs font-semibold press-tactile ${
                hideRemoved2027
                  ? 'border-[#6E261A] dark:border-[#E0A92E] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#E0A92E]'
                  : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E]'
              }`}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Hide Removed 2027 Topics
              {removed2027Count > 0 && (
                <span className="font-mono text-[10px] opacity-80">({removed2027Count})</span>
              )}
            </button>

            <button
              type="button"
              data-testid="reset-seen-history-btn"
              onClick={handleResetSeenHistory}
              disabled={seenHistoryCount === 0}
              title="Reset anti-repeat served question history"
              className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] disabled:opacity-45 press-tactile"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Seen History</span>
              {seenHistoryCount > 0 && (
                <span className="font-mono text-[10px] tabular-nums">({seenHistoryCount})</span>
              )}
            </button>

            <button
              type="button"
              onClick={resetFilters}
              className="shrink-0 whitespace-nowrap h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] press-tactile"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* 0. Single-Row Horizontally Scrollable Source Filter Pill Rail */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
            Question Source &amp; Answer Key Filter
          </span>
          <div
            data-testid="source-filter-rail"
            data-no-swipe="true"
            className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1"
          >
            {SOURCE_FILTERS.map((sf) => {
              const active = sourceFilter === sf.id;
              const count = sourceCounts[sf.id] ?? 0;
              return (
                <button
                  key={sf.id}
                  type="button"
                  data-testid={`source-filter-${sf.id}`}
                  aria-pressed={active}
                  onClick={(e) => {
                    setSourceFilter(sf.id);
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      inline: 'center',
                      block: 'nearest',
                    });
                  }}
                  className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold press-tactile ${
                    active
                      ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                      : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216] dark:hover:border-[#E0A92E]'
                  }`}
                >
                  <span>{sf.label}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full tabular-nums ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-[#EFE9DF] dark:bg-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Subject Multi-Select Pills (Live Matching Counts) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
              1. IIT Madras GATE CSE 2027 Subjects{' '}
              <span className="font-normal text-[#61554D] dark:text-[#A99B8E]">
                (
                {selectedSubjects.length === 0
                  ? 'All 11 Selected'
                  : `${selectedSubjects.length} Selected`}
                )
              </span>
            </span>
            {selectedSubjects.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedSubjects([])}
                className="text-[11px] font-semibold text-[#6E261A] dark:text-[#E0A92E] hover:underline"
              >
                Select All 11
              </button>
            )}
          </div>
          <div
            data-no-swipe="true"
            className="flex flex-nowrap md:flex-wrap items-center gap-1.5 md:gap-2 overflow-x-auto no-scrollbar py-1 px-1 -mx-1 md:mx-0 md:px-0"
          >
            {GATE_2027_SYLLABUS.map((subj) => {
              const active = selectedSubjects.includes(subj.id);
              const count = subjectCounts[subj.id] ?? 0;
              const chipLabel =
                subj.shortName.toUpperCase() === subj.code.toUpperCase()
                  ? subj.id === 'coa'
                    ? 'Comp Org'
                    : subj.id === 'toc'
                    ? 'Theory of Comp'
                    : subj.id === 'os'
                    ? 'Operating Sys'
                    : subj.id === 'dbms'
                    ? 'Databases'
                    : subj.name
                  : subj.shortName;
              return (
                <button
                  key={subj.id}
                  type="button"
                  data-testid={`subject-chip-${subj.id}`}
                  onClick={(e) => {
                    toggleSubject(subj.id);
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      inline: 'center',
                      block: 'nearest',
                    });
                  }}
                  aria-pressed={active}
                  className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold press-tactile ${
                    active
                      ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                      : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216] dark:hover:border-[#E0A92E]'
                  }`}
                >
                  <span className="font-mono text-[11px] opacity-85">{subj.code}</span>
                  <span>{chipLabel}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full tabular-nums ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-[#EFE9DF] dark:bg-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Searchable Subtopic Tags Chip Selector + Keyword Search */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="subtopic-tag-search"
                className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]"
              >
                2. Subtopic Tags (Searchable Chips)
              </label>
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-[11px] font-semibold text-[#6E261A] dark:text-[#E0A92E] hover:underline"
                >
                  Clear {selectedTags.length} tag(s)
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 text-[#8C7E75] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="subtopic-tag-search"
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Filter tags (e.g. cache-memory, paging, discrete-mathematics, predicted-2027)..."
                className="w-full h-9 pl-9 pr-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] text-xs text-[#1C1613] dark:text-[#F5F0E8] placeholder:text-[#8C7E75]"
              />
            </div>

            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#C89216] dark:border-[#E0A92E] text-[11px] font-mono font-semibold text-[#8B6209] dark:text-[#E0A92E] press-tactile"
                  >
                    #{tag}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {visibleTags.map(({ tag, count }) => {
                const picked = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-mono press-tactile ${
                      picked
                        ? 'border-[#6E261A] bg-[#6E261A] text-white'
                        : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8] hover:border-[#C89216]'
                    }`}
                  >
                    <span>{tag}</span>
                    <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
              {visibleTags.length === 0 && (
                <span className="text-xs text-[#8C7E75]">
                  No tags match &ldquo;{tagSearch}&rdquo;.
                </span>
              )}
            </div>
          </div>

          {/* 3. Year Range & Keyword Search */}
          <div className="lg:col-span-5 space-y-3">
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                3. Paper Year Range
              </span>
              <div
                data-no-swipe="true"
                className="flex flex-nowrap md:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1 md:mx-0 md:px-0"
              >
                {YEAR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={(e) => {
                      setYearRange(preset.id);
                      if (preset.id !== 'specific') setSpecificYear(null);
                      e.currentTarget.scrollIntoView({
                        behavior: 'smooth',
                        inline: 'center',
                        block: 'nearest',
                      });
                    }}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full border text-xs font-semibold press-tactile ${
                      yearRange === preset.id
                        ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                        : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="specific-year-select"
                  className="text-[11px] text-[#61554D] dark:text-[#A99B8E] whitespace-nowrap"
                >
                  Or exact paper year:
                </label>
                <select
                  id="specific-year-select"
                  value={yearRange === 'specific' && specificYear ? String(specificYear) : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setYearRange('all');
                      setSpecificYear(null);
                    } else {
                      setYearRange('specific');
                      setSpecificYear(Number(val));
                    }
                  }}
                  className="h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  <option value="">Any Year</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y === 2027 ? 'Predicted GATE 2027' : `GATE ${y}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pyq-keyword-search"
                className="block text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]"
              >
                Keyword Search
              </label>
              <input
                id="pyq-keyword-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search question statement or title..."
                className="w-full h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] text-xs text-[#1C1613] dark:text-[#F5F0E8] placeholder:text-[#8C7E75]"
              />
            </div>
          </div>
        </div>

        {/* 4. Marks, Format & Status Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-[#EFE9DF] dark:border-[#2E2520]">
          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#61554D] dark:text-[#A99B8E]">
              Marks
            </span>
            <div className="flex flex-nowrap md:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 -mx-1 md:mx-0 md:px-0">
              {(['all', 1, 2] as const).map((m) => (
                <button
                  key={String(m)}
                  type="button"
                  onClick={() => setMarksFilter(m)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full border text-xs font-mono font-semibold press-tactile ${
                    marksFilter === m
                      ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                      : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
                  }`}
                >
                  {m === 'all' ? 'All' : `${m}M`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#61554D] dark:text-[#A99B8E]">
              Question Type
            </span>
            <div className="flex flex-nowrap md:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 -mx-1 md:mx-0 md:px-0">
              {(['all', 'MCQ', 'MSQ', 'NAT'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormatFilter(fmt)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full border text-xs font-mono font-semibold press-tactile ${
                    formatFilter === fmt
                      ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                      : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
                  }`}
                >
                  {fmt === 'all' ? 'All' : fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#61554D] dark:text-[#A99B8E]">
              Attempt Status
            </span>
            <div className="flex flex-nowrap md:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 -mx-1 md:mx-0 md:px-0">
              {STATUS_OPTIONS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={(e) => {
                    setStatusFilter(st.id);
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      inline: 'center',
                      block: 'nearest',
                    });
                  }}
                  className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full border text-xs font-semibold press-tactile ${
                    statusFilter === st.id
                      ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                      : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Inline Shortfall Amber Notice when narrow filters yield fewer unique Qs than requested */}
        {hasShortfall && (
          <div
            data-testid="test-builder-shortfall-badge"
            className="rounded-[20px] border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] px-4 py-2.5 flex items-center gap-2.5 text-xs font-medium text-[#8B6209] dark:text-[#E0A92E]"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Only <strong className="font-mono">{matchedQuestions.length}</strong> unique question
              {matchedQuestions.length === 1 ? '' : 's'} exist for this exact filter — starting with
              all <strong className="font-mono">{matchedQuestions.length}</strong> or broaden
              filters.
            </span>
          </div>
        )}

        {/* 5. Launch Dock: Mode Toggle, Batch Size, Anti-Repeat Shuffle, Primary CTA */}
        <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Mode Segmented Toggle */}
            <div
              role="radiogroup"
              aria-label="Test mode"
              className="inline-flex items-center p-1 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714]"
            >
              <button
                type="button"
                role="radio"
                aria-checked={sessionMode === 'cbt_mock'}
                onClick={() => setSessionMode('cbt_mock')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold press-tactile ${
                  sessionMode === 'cbt_mock'
                    ? 'bg-[#241914] text-[#FAF5EB] dark:bg-[#E0A92E] dark:text-[#1C1613]'
                    : 'text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Timed CBT Mock
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={sessionMode === 'practice_sprint'}
                onClick={() => setSessionMode('practice_sprint')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold press-tactile ${
                  sessionMode === 'practice_sprint'
                    ? 'bg-[#6E261A] text-white dark:bg-[#9E3E2E]'
                    : 'text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Practice Sprint
              </button>
            </div>

            {/* Batch Size */}
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="batch-size-select"
                className="text-xs text-[#61554D] dark:text-[#A99B8E]"
              >
                Size:
              </label>
              <select
                id="batch-size-select"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
              >
                <option value={10}>10 Qs</option>
                <option value={15}>15 Qs</option>
                <option value={25}>25 Qs</option>
                <option value={65}>65 Qs (Full GATE)</option>
                <option value={9999}>All Matched</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShuffleOrder((s) => !s)}
              aria-pressed={shuffleOrder}
              className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-xs font-semibold press-tactile ${
                shuffleOrder
                  ? 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]'
                  : 'border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#A99B8E]'
              }`}
            >
              <Shuffle className="h-3.5 w-3.5" />
              {shuffleOrder ? 'Anti-Repeat Shuffle' : 'Newest First (Fresh)'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              data-testid="matched-pyq-count"
              className="font-mono text-xs font-semibold text-[#61554D] dark:text-[#D8CBB8] tabular-nums"
            >
              {matchedQuestions.length.toLocaleString()} matching
            </span>
            <button
              type="button"
              onClick={handleExportWorksheetPdf}
              disabled={matchedQuestions.length === 0}
              data-testid="export-worksheet-pdf-btn"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] hover:border-[#C89216] dark:hover:border-[#E0A92E] text-[#1C1613] dark:text-[#F5F0E8] text-xs font-semibold disabled:opacity-45 press-tactile"
            >
              <FileDown className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={handleLaunch}
              disabled={matchedQuestions.length === 0}
              data-testid="launch-pyq-session-btn"
              className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold disabled:opacity-45 press-tactile shadow-warm"
            >
              {sessionMode === 'cbt_mock' ? (
                <Sparkles className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {sessionMode === 'cbt_mock'
                ? `Start ${effectiveBatchCount}-Q CBT Mock (${matchedQuestions.length.toLocaleString()} matching)`
                : `Start ${effectiveBatchCount}-Q Test (${matchedQuestions.length.toLocaleString()} matching)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
