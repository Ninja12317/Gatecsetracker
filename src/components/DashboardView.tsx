import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Flame,
  Zap,
  RefreshCw,
  BookOpen,
  PenTool,
  Link2,
  CheckCircle2,
  Clock,
  Eye,
  Play,
  Layers,
} from 'lucide-react';
import type {
  NavView,
  Question,
  SubjectId,
  SyncStatus,
  TipItem,
  WarRoomState,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import {
  computeOverallMastery,
  computeSubjectMastery,
  computePyqAccuracy,
  computeEstimatedGateMarks,
  computeStudyStreak,
  needsSpacedRevision,
  toLocalIsoDate,
} from '../utils/gateMath';
import { computeGaStreakMetrics } from '../utils/gaStreak';
import { getIstDateString } from '../utils/pyqServerHelpers';
import {
  computeDailyPoolStats,
  computeThreePhaseRoadmap,
} from '../utils/dailyTestEngine';
import type { AutopilotRunResult, UrlIngestResult } from '../hooks/useWarRoomStore';
import { DaysLeftPill, LiveCountdownTile } from './LiveCountdown';
import { FocusQuickLaunchTile } from './FocusQuickLaunchTile';
import { DailyGaLockInCard } from './DailyGaLockInCard';
import { FormulaBlock, MathText } from './MathText';

interface DashboardViewProps {
  state: WarRoomState;
  allQuestions: Question[];
  syncStatus: SyncStatus;
  allTips: TipItem[];
  totalPyqCount: number;
  simpleMode: boolean;
  autopilotLoading: boolean;
  autopilotStatusMsg: string;
  urlIngestLoading: boolean;
  onRunDailyAutopilot: (manual?: boolean) => Promise<AutopilotRunResult>;
  onIngestPublicUrl: (url: string, subjectHint?: SubjectId) => Promise<UrlIngestResult>;
  onNavigate: (view: NavView) => void;
  onJumpToSubject: (subjectId: SubjectId) => void;
  onLaunchDailyDpp: () => void;
  onReviewDailyDpp: () => void;
  onLaunchGaSprint: () => void;
  onReviewGaSprint: () => void;
  onOpenStandaloneSketchpad: () => void;
  onOpenCommandPalette: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  allQuestions,
  syncStatus,
  allTips,
  totalPyqCount,
  simpleMode,
  autopilotLoading,
  autopilotStatusMsg,
  urlIngestLoading,
  onRunDailyAutopilot,
  onIngestPublicUrl,
  onNavigate,
  onJumpToSubject,
  onLaunchDailyDpp,
  onReviewDailyDpp,
  onLaunchGaSprint,
  onReviewGaSprint,
  onOpenStandaloneSketchpad,
  onOpenCommandPalette,
}) => {
  // Quick-URL / Search capsule bar state
  const [heroInput, setHeroInput] = useState('');
  const [heroFeedback, setHeroFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Rotating Trap of the Day index (deterministic day-of-year seed + manual cycle)
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const [tipOffset, setTipOffset] = useState<number>(0);
  const currentTip = allTips[(dayOfYear + tipOffset) % allTips.length];

  // Readiness & Metrics
  const todayStr = toLocalIsoDate();
  const todayIst = getIstDateString();
  const hideRemoved = state.settings.autoHideRemoved2027 ?? true;

  const todayDppRecord = state.dailyProgress?.dailyDppByDate?.[todayIst];
  const todayGaRecord = state.dailyProgress?.dailyGaByDate?.[todayIst];

  const dppPoolStats = useMemo(
    () => computeDailyPoolStats('dpp', allQuestions, state.dailyProgress, hideRemoved),
    [allQuestions, state.dailyProgress, hideRemoved]
  );
  const gaPoolStats = useMemo(
    () => computeDailyPoolStats('ga', allQuestions, state.dailyProgress, hideRemoved),
    [allQuestions, state.dailyProgress, hideRemoved]
  );

  const daysLeft = useMemo(() => {
    const targetMs = new Date(state.settings.targetDateIso).getTime();
    if (!Number.isFinite(targetMs)) return 70;
    return Math.max(0, Math.floor((targetMs - Date.now()) / 86400000));
  }, [state.settings.targetDateIso]);

  const roadmap = useMemo(() => computeThreePhaseRoadmap(daysLeft), [daysLeft]);

  const overallMastery = useMemo(
    () => computeOverallMastery(GATE_2027_SYLLABUS, state.progress),
    [state.progress]
  );
  const pyqStats = useMemo(() => computePyqAccuracy(state.attempts), [state.attempts]);
  const estimatedScore = useMemo(
    () => computeEstimatedGateMarks(GATE_2027_SYLLABUS, state.progress, state.attempts),
    [state.progress, state.attempts]
  );
  const activeStreak = useMemo(
    () => computeStudyStreak(state.studyLogs, todayStr),
    [state.studyLogs, todayStr]
  );
  const gaStreakMetrics = useMemo(
    () => computeGaStreakMetrics(state.gaStreakLogs, state.attempts, allQuestions),
    [state.gaStreakLogs, state.attempts, allQuestions]
  );
  const availableGaCount = useMemo(
    () => allQuestions.filter((q) => q.subjectId === 'ga' && !q.isOutOf2027Syllabus).length,
    [allQuestions]
  );

  // Subject cards summary (memoized across all 11 subjects)
  const subjectSummaries = useMemo(() => {
    return GATE_2027_SYLLABUS.map((subj) => {
      const mastery = computeSubjectMastery(subj, state.progress);
      const dueCount = subj.subtopics.filter((sub) =>
        needsSpacedRevision(state.progress[sub.id])
      ).length;
      const solvedCount = subj.subtopics.filter((sub) => {
        const st = state.progress[sub.id]?.status;
        return st === 'mastered' || st === 'pyqs_done';
      }).length;
      return {
        subject: subj,
        mastery,
        dueCount,
        solvedCount,
        totalTopics: subj.subtopics.length,
      };
    });
  }, [state.progress]);

  // Today's study tally & sessions count for Overview quick-launch summary
  const { todayMinutes, todaySessionsCount } = useMemo(() => {
    let mins = 0;
    let count = 0;
    for (const log of state.studyLogs) {
      if (log.date === todayStr) {
        mins += log.minutes;
        count += 1;
      }
    }
    return { todayMinutes: mins, todaySessionsCount: count };
  }, [state.studyLogs, todayStr]);

  const handleHeroSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = heroInput.trim();
    if (!trimmed) {
      onOpenCommandPalette();
      return;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      setHeroFeedback(null);
      const res = await onIngestPublicUrl(trimmed);
      setHeroFeedback({ ok: res.ok, msg: res.message });
      if (res.ok) setHeroInput('');
    } else {
      onOpenCommandPalette();
    }
  };

  const isConnecting = syncStatus === 'connecting';
  const dppCompletedToday = Boolean(todayDppRecord?.completed);

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* HERO 2-COLUMN SPLIT (Reference Calm Editorial Framing + Curved Bento Command Card) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center pt-2">
        {/* Left Column: Scholarly Hero Typography + Capsule CTAs (+ Quick URL Ingest in Full Mode) */}
        <div className="lg:col-span-6 space-y-6">
          <DaysLeftPill targetDateIso={state.settings.targetDateIso} />

          <div className="space-y-3">
            <h1 className="fluid-hero font-display font-bold tracking-[-0.03em] leading-[1.06]">
              <span className="block text-[#1C1613] dark:text-[#F5F0E8]">
                Your GATE &apos;27 prep,
              </span>
              <span className="block text-[#6E261A] dark:text-[#E0A92E]">
                one sprint away.
              </span>
            </h1>
            <p className="text-[15px] sm:text-[16px] leading-[1.6] text-[#61554D] dark:text-[#B8A99A] max-w-[500px]">
              Track every CSE subtopic, drill unseen daily PYQs with rough-work sheets, and turn mock
              mistakes into high-ROI marks before exam morning.
            </p>
          </div>

          {/* Primary & Secondary Curved Pill CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            {dppCompletedToday && todayDppRecord ? (
              <button
                type="button"
                onClick={onReviewDailyDpp}
                data-testid="hero-dpp-completed-btn"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#2E5E3E] hover:bg-[#234A30] dark:bg-[#245034] dark:hover:bg-[#2E6441] text-[#FAF8F4] text-sm font-semibold shadow-warm press-tactile"
              >
                <CheckCircle2 className="h-4 w-4 text-[#B7E3C6]" />
                DPP Completed ✓ · {todayDppRecord.score}/{todayDppRecord.maxMarks}
              </button>
            ) : (
              <button
                type="button"
                onClick={onLaunchDailyDpp}
                data-testid="hero-start-dpp-btn"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-[#FAF8F4] text-sm font-semibold shadow-warm press-tactile"
              >
                <Zap className="h-4 w-4 text-[#F3DCA0]" />
                Start Daily DPP (10 Qs)
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('syllabus')}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] hover:bg-[#F4EFE6] dark:hover:bg-[#261E1A] text-[#1C1613] dark:text-[#F5F0E8] text-sm font-semibold press-tactile"
            >
              <BookOpen className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
              Open Syllabus
            </button>
          </div>

          {/* Capsule Quick-URL Ingest / Command Search Input (hidden in Simple Mode) */}
          {!simpleMode && (
            <div className="max-w-[520px] space-y-2 pt-1" data-testid="hero-url-ingest-bar">
              <form
                onSubmit={handleHeroSubmit}
                className="flex items-center gap-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] pl-4 pr-1.5 py-1.5 shadow-warm focus-within:border-[#C89216] dark:focus-within:border-[#E0A92E] transition-colors"
              >
                <Link2 className="h-4 w-4 text-[#8C7E75] dark:text-[#A99B8E] shrink-0" />
                <input
                  type="text"
                  value={heroInput}
                  onChange={(e) => setHeroInput(e.target.value)}
                  placeholder="Paste GATE Overflow / GO Classes URL or jump to topic..."
                  aria-label="Paste public GATE PYQ URL to ingest or press Enter to search"
                  className="flex-1 min-w-0 bg-transparent text-xs sm:text-[13px] text-[#1C1613] dark:text-[#F5F0E8] placeholder:text-[#8C7E75] dark:placeholder:text-[#7E7065] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={urlIngestLoading}
                  className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[#F4EFE6] dark:bg-[#261E1A] hover:bg-[#E8DEC8] dark:hover:bg-[#332721] text-[#6E261A] dark:text-[#E0A92E] text-xs font-semibold press-tactile disabled:opacity-50 shrink-0"
                >
                  <span>{urlIngestLoading ? 'Fetching...' : 'Fetch'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>
              {heroFeedback && (
                <p
                  className={`text-xs font-mono pl-4 ${
                    heroFeedback.ok
                      ? 'text-[#2E5E3E] dark:text-[#7BB88F]'
                      : 'text-[#B83227] dark:text-[#F08A80]'
                  }`}
                >
                  {heroFeedback.msg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Elevated Curved Bento Command Card (Concentric Radius Geometry) */}
        <div className="lg:col-span-6">
          <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 shadow-warm space-y-3">
            {/* Top Concentric Dark Roasted Cocoa Countdown Tile (isolated 1s tick leaf) */}
            <LiveCountdownTile
              targetDateIso={state.settings.targetDateIso}
              shift={state.settings.shift}
            />

            {/* Middle Stacked KPI Bento Tiles */}
            <div className="grid grid-cols-2 gap-3" aria-label="Readiness metrics">
              {/* Mastery Tile */}
              <div className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
                  <span>Syllabus Mastery</span>
                  <span className="font-mono text-[#B58210] dark:text-[#E0A92E]">11 Subj</span>
                </div>
                {isConnecting ? (
                  <div className="mt-2.5 h-8 w-20 rounded-full shimmer-sand" />
                ) : (
                  <div
                    data-testid="metric-mastery"
                    className="mt-2 font-mono text-2xl sm:text-[28px] font-bold tabular-nums leading-none text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    {overallMastery}%
                  </div>
                )}
                <div className="mt-3 h-1.5 w-full rounded-full bg-[#E8E0D5] dark:bg-[#352A24] overflow-hidden">
                  <div
                    className="h-full w-full origin-left rounded-full bg-[#C89216] dark:bg-[#E0A92E] transition-transform duration-300 ease-apple"
                    style={{ transform: `scaleX(${Math.max(0.02, overallMastery / 100)})` }}
                  />
                </div>
              </div>

              {/* PYQ Accuracy Tile */}
              <div className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
                  <span>PYQ Accuracy</span>
                  <span className="font-mono tabular-nums text-[#2E5E3E] dark:text-[#7BB88F]">
                    {pyqStats.correctCount}/{pyqStats.attemptedCount}
                  </span>
                </div>
                {isConnecting ? (
                  <div className="mt-2.5 h-8 w-20 rounded-full shimmer-sand" />
                ) : (
                  <div className="mt-2 font-mono text-2xl sm:text-[28px] font-bold tabular-nums leading-none text-[#2E5E3E] dark:text-[#7BB88F]">
                    {pyqStats.accuracyPct}%
                  </div>
                )}
                <p className="mt-2.5 text-[11px] text-[#61554D] dark:text-[#A99B8E] truncate">
                  {totalPyqCount.toLocaleString()} cached PYQs ready
                </p>
              </div>

              {/* Study Streak Tile */}
              <div className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-4">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
                  <span>Active Streak</span>
                  <Flame className="h-3.5 w-3.5 text-[#C89216] dark:text-[#E0A92E]" aria-hidden="true" />
                </div>
                {isConnecting ? (
                  <div className="mt-2.5 h-8 w-16 rounded-full shimmer-sand" />
                ) : (
                  <div className="mt-2 font-mono text-2xl sm:text-[28px] font-bold tabular-nums leading-none text-[#1C1613] dark:text-[#F5F0E8]">
                    {activeStreak}d
                  </div>
                )}
                <p className="mt-2.5 font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E]">
                  Today: {todayMinutes}/{state.settings.dailyGoalMinutes}m
                </p>
              </div>

              {/* Estimated GATE Marks Tile */}
              <div className="rounded-[20px] squircle border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2B2114] p-4">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#8B6209] dark:text-[#E0A92E]">
                  <span>Est. GATE Score</span>
                  <span className="font-mono">/ 100</span>
                </div>
                {isConnecting ? (
                  <div className="mt-2.5 h-8 w-20 rounded-full shimmer-sand" />
                ) : (
                  <div className="mt-2 font-mono text-2xl sm:text-[28px] font-bold tabular-nums leading-none text-[#6E261A] dark:text-[#F5F0E8]">
                    {estimatedScore}
                  </div>
                )}
                <p className="mt-2.5 text-[11px] text-[#8B6209] dark:text-[#D9B664] truncate">
                  Weighted across 11 subjects
                </p>
              </div>
            </div>

            {/* Clean Single-Button Bento Dock: ONLY Open Rough-Work Sketchpad */}
            <div className="pt-1" data-testid="overview-bento-dock">
              <button
                type="button"
                onClick={onOpenStandaloneSketchpad}
                data-testid="open-standalone-sketchpad-btn"
                className="w-full flex items-center justify-between gap-3 h-11 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] hover:bg-[#EFE9DF] dark:hover:bg-[#312722] hover:border-[#C89216] text-[#1C1613] dark:text-[#F5F0E8] text-xs font-semibold press-tactile transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <PenTool className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                  <span>Open Rough-Work Sketchpad</span>
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-[#61554D] dark:text-[#A99B8E]">
                  <Layers className="h-3 w-3 text-[#C89216] dark:text-[#E0A92E]" />
                  Standalone Sheets
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3-PHASE 70-DAY ROADMAP PROGRESS BAR */}
      <section
        data-testid="three-phase-roadmap"
        className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 sm:p-5 shadow-warm space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] font-mono text-[11px] font-bold text-[#8B6209] dark:text-[#E0A92E]">
              Phase {roadmap.activePhase} Active
            </span>
            <h2 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              70-Day Sprint Roadmap
            </h2>
          </div>
          <span className="font-mono text-xs tabular-nums text-[#61554D] dark:text-[#A99B8E]">
            Day {roadmap.dayNumber}/70 · {roadmap.daysLeft}d left
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {roadmap.phases.map((p) => {
            const isActive = p.status === 'active';
            const isDone = p.status === 'completed';
            return (
              <div
                key={p.phase}
                className={`rounded-[18px] border p-3 space-y-2 ${
                  isActive
                    ? 'border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3]/70 dark:bg-[#2C2215]/70'
                    : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    {p.title}
                  </span>
                  <span className="font-mono text-[10px] text-[#61554D] dark:text-[#A99B8E]">
                    {p.rangeLabel}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#E8E0D5] dark:bg-[#352A24] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isDone
                        ? 'bg-[#2E5E3E] dark:bg-[#7BB88F]'
                        : isActive
                        ? 'bg-[#6E261A] dark:bg-[#E0A92E]'
                        : 'bg-[#C89216]/35'
                    }`}
                    style={{ width: `${Math.max(isActive ? 6 : 0, p.progressPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                  <span>{p.subtitle}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {isDone ? 'Done ✓' : `${p.progressPct}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* DAILY NEVER-REPEATING TESTS PAIR: DAILY MIXED DPP (10 Qs) + DAILY 10-MIN GA (5 Qs) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Daily Mixed DPP Card */}
        <div
          data-testid="daily-dpp-card"
          className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm flex flex-col justify-between gap-4"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E261A] dark:text-[#E0A92E]">
                  <Zap className="h-3.5 w-3.5" />
                  Daily Mixed DPP · {todayIst} IST
                </div>
                <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  10 Unseen Core CSE PYQs
                </h3>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                  Balanced across weak &amp; unrevised subjects from the full GateR bank — never repeats prior days.
                </p>
              </div>

              <span
                data-testid="dpp-today-status-pill"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shrink-0 ${
                  dppCompletedToday
                    ? 'border-[#B8D7C3] dark:border-[#264D34] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                    : 'border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]'
                }`}
              >
                {dppCompletedToday && todayDppRecord ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    DPP Completed ✓ · {todayDppRecord.score}/{todayDppRecord.maxMarks}
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5" />
                    Pending Today
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  Unseen Pool
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                  {dppPoolStats.remainingUnseen.toLocaleString()}
                </div>
              </div>

              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  Completed
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#6E261A] dark:text-[#E0A92E]">
                  {dppPoolStats.usedCount} Qs
                </div>
              </div>

              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  {dppCompletedToday ? 'Today Acc' : 'Set Size'}
                </div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#2E5E3E] dark:text-[#7BB88F]">
                  {dppCompletedToday && todayDppRecord ? `${todayDppRecord.accuracy}%` : '10 Qs'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="font-mono text-[11px] text-[#61554D] dark:text-[#A99B8E]">
              {dppCompletedToday && todayDppRecord
                ? `Solved ${todayDppRecord.correctCount}/${todayDppRecord.questionIds.length} · Next fresh set tomorrow 00:00 IST`
                : `Cycle #${dppPoolStats.cycleCount} · ${dppPoolStats.totalEligible.toLocaleString()} eligible PYQs`}
            </span>

            {dppCompletedToday ? (
              <button
                type="button"
                onClick={onReviewDailyDpp}
                data-testid="review-daily-dpp-btn"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#2E5E3E] hover:bg-[#234A30] dark:bg-[#245034] dark:hover:bg-[#2E6441] text-white text-xs font-semibold press-tactile shadow-warm"
              >
                <Eye className="h-3.5 w-3.5" />
                Review Today&apos;s DPP
              </button>
            ) : (
              <button
                type="button"
                onClick={onLaunchDailyDpp}
                disabled={allQuestions.length === 0}
                data-testid="start-daily-dpp-btn"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold disabled:opacity-45 press-tactile shadow-warm"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Start Daily DPP (10 Qs)
              </button>
            )}
          </div>
        </div>

        {/* Daily 10-Min GA Lock-In Card */}
        <DailyGaLockInCard
          metrics={gaStreakMetrics}
          availableGaCount={availableGaCount}
          unseenRemaining={gaPoolStats.remainingUnseen}
          todayGaRecord={todayGaRecord}
          onStartGaSprint={onLaunchGaSprint}
          onReviewGaSprint={onReviewGaSprint}
          variant="full"
        />
      </section>

      {/* BELOW THE FOLD 1: Airy 3-Column Grid of Rounded Subject Cards */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[#1C1613] dark:text-[#F5F0E8]">
              11-Subject Syllabus Radar
            </h2>
            <p className="text-sm text-[#61554D] dark:text-[#A99B8E]">
              Click any subject card to inspect subtopics, confidence levels, and revision traps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('syllabus')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] text-xs font-semibold text-[#6E261A] dark:text-[#E0A92E] hover:bg-[#F4EFE6] dark:hover:bg-[#261E1A] press-tactile"
          >
            Full Tracker
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjectSummaries.map(({ subject, mastery, dueCount, solvedCount, totalTopics }) => (
            <button
              key={subject.id}
              type="button"
              onClick={() => onJumpToSubject(subject.id)}
              className="text-left rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm card-lift press-tactile flex flex-col justify-between gap-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#261E1A] font-mono text-[11px] font-bold text-[#6E261A] dark:text-[#E0A92E]">
                      {subject.code}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E]">
                      {subject.weightage} marks
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-[15px] font-bold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                    {subject.name}
                  </h3>
                </div>

                <span className="font-mono text-lg font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8] shrink-0">
                  {mastery}%
                </span>
              </div>

              <div className="space-y-2">
                <div className="h-1.5 w-full rounded-full bg-[#EFE9DF] dark:bg-[#2C241F] overflow-hidden">
                  <div
                    className={`h-full w-full origin-left rounded-full transition-transform duration-300 ease-apple ${
                      mastery >= 75
                        ? 'bg-[#2E5E3E] dark:bg-[#7BB88F]'
                        : mastery >= 40
                        ? 'bg-[#C89216] dark:bg-[#E0A92E]'
                        : 'bg-[#6E261A] dark:bg-[#B54A38]'
                    }`}
                    style={{ transform: `scaleX(${Math.max(0.03, mastery / 100)})` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono tabular-nums text-[#61554D] dark:text-[#A99B8E]">
                    {solvedCount}/{totalTopics} PYQ locked
                  </span>
                  {dueCount > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#332714] border border-[#EED89A] dark:border-[#5C441B] text-[#8B6209] dark:text-[#E0A92E] font-medium">
                      {dueCount} due
                    </span>
                  ) : (
                    <span className="text-[#2E5E3E] dark:text-[#7BB88F] font-medium">On track</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* BELOW THE FOLD 2: Compact Quick-Launch Focus Summary Tile */}
      <FocusQuickLaunchTile
        todayMinutes={todayMinutes}
        dailyGoalMinutes={state.settings.dailyGoalMinutes}
        todaySessionsCount={todaySessionsCount}
        activeStreak={activeStreak}
        onOpenFocus={() => onNavigate('focus')}
      />

      {/* BELOW THE FOLD 3: Trap of the Day + Cache-First Daily PYQ Autopilot (hidden in Simple Mode) */}
      {!simpleMode && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5" data-testid="overview-secondary-widgets">
          {currentTip && (
            <div className="lg:col-span-8 rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E8E0D5] dark:border-[#2E2520]">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#332714] border border-[#EED89A] dark:border-[#5C441B] font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                    Trap of the Day
                  </span>
                  <span className="font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                    {SUBJECT_MAP[currentTip.subjectId]?.name}
                  </span>
                  <span aria-hidden="true" className="text-[#A99B8E]">·</span>
                  <span className="text-[#61554D] dark:text-[#A99B8E]">{currentTip.category}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTipOffset((o) => o + 1)}
                    className="px-3 py-1 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#EFE9DF] dark:hover:bg-[#312722] press-tactile"
                  >
                    Next Tip
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('tips')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#6E261A] dark:text-[#E0A92E] hover:underline"
                  >
                    Formula Vault
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  <MathText text={currentTip.title} inline />
                </h3>
                <p className="text-sm text-[#61554D] dark:text-[#B8A99A] leading-relaxed">
                  <MathText text={currentTip.detail} />
                </p>
                {currentTip.formula && (
                  <div
                    data-testid="dashboard-trap-formula"
                    className="rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 py-3"
                  >
                    <div className="text-[11px] font-medium text-[#8C7E75] dark:text-[#A99B8E] mb-1">
                      Key Invariant / Formula
                    </div>
                    <FormulaBlock
                      latex={currentTip.formula}
                      compact
                      className="text-[#6E261A] dark:text-[#E5B23A]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Daily PYQ Autopilot Card */}
          <div
            data-testid="daily-autopilot-strip"
            className="lg:col-span-4 rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#F4EFE6] dark:bg-[#1C1714] p-5 shadow-warm flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFFFFF] dark:bg-[#261E1A] border border-[#E8E0D5] dark:border-[#3A2E28] font-mono text-[11px] font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2E5E3E] dark:bg-[#7BB88F]" />
                {state.lastAutopilotIstDate === todayIst
                  ? `Synced ${state.lastAutopilotIstDate} IST`
                  : `Ready · ${todayIst} IST`}
              </div>
              <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Daily PYQ Autopilot
              </h3>
              <p className="text-xs leading-relaxed text-[#61554D] dark:text-[#A99B8E]">
                Cache-first Firestore bank with{' '}
                <span className="font-mono font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                  {totalPyqCount.toLocaleString()} PYQs
                </span>
                . Fetches 1 fresh free-tier batch per IST calendar day.
              </p>
              {autopilotStatusMsg && (
                <p className="text-[11px] font-mono text-[#6E261A] dark:text-[#E0A92E]">
                  {autopilotStatusMsg}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={autopilotLoading}
                onClick={() => void onRunDailyAutopilot(true)}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold disabled:opacity-50 press-tactile"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${autopilotLoading ? 'animate-spin' : ''}`} />
                {autopilotLoading ? 'Syncing Batch...' : 'Sync Today\u2019s PYQ Batch'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('pyq')}
                className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#312722] press-tactile"
              >
                Open PYQ Studio
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

