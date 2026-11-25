import React, { useEffect, useState } from 'react';
import { Timer, ArrowRight, Flame, Play, BookmarkCheck } from 'lucide-react';
import { SUBJECT_MAP } from '../data/syllabus';
import { useFocusTimer } from '../context/FocusTimerContext';
import { computeTimerClock, formatClock, formatMinutesCompact } from '../utils/focusAnalytics';

interface FocusQuickLaunchTileProps {
  todayMinutes: number;
  dailyGoalMinutes: number;
  todaySessionsCount: number;
  activeStreak: number;
  onOpenFocus: () => void;
}

/**
 * Compact Quick-Launch Summary Tile on Overview page.
 * Shows Today's Tally + live active timer status + pinned resume point and clicks straight into Focus Studio.
 * Isolated React.memo so live ticks never re-render the Overview dashboard.
 */
export const FocusQuickLaunchTile: React.FC<FocusQuickLaunchTileProps> = React.memo(
  ({ todayMinutes, dailyGoalMinutes, todaySessionsCount, activeStreak, onOpenFocus }) => {
    const {
      clockSnapshot,
      status,
      subjectId,
      activePreset,
      lastResumeNote,
    } = useFocusTimer();

    const [nowMs, setNowMs] = useState<number>(() => Date.now());

    useEffect(() => {
      if (status !== 'running') return;
      setNowMs(Date.now());
      const id = window.setInterval(() => setNowMs(Date.now()), 1000);
      return () => window.clearInterval(id);
    }, [status]);

    const clock = computeTimerClock(clockSnapshot, nowMs);
    const subjCode = SUBJECT_MAP[subjectId]?.code ?? subjectId.toUpperCase();
    const goalPct = Math.min(100, Math.round((todayMinutes / Math.max(1, dailyGoalMinutes)) * 100));

    return (
      <section aria-label="Focus Studio quick launch">
        <button
          type="button"
          onClick={onOpenFocus}
          data-testid="overview-focus-quick-tile"
          className="w-full text-left rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] hover:border-[#C89216] dark:hover:border-[#E0A92E] p-5 shadow-warm card-lift press-tactile flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          {/* Left: Focus Studio Identity + Today's Tally */}
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            <span className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#241914] dark:bg-[#2A201B] text-[#E0A92E] shrink-0">
              <Timer className="h-5 w-5" />
            </span>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Deep-Work Focus Studio
                </h2>
                {status === 'running' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#241914] text-[#F3DCA0] font-mono text-[11px] font-bold tabular-nums">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#E0A92E] animate-pulse" />
                    {activePreset.kind === 'break' ? 'BREAK' : subjCode} ·{' '}
                    {formatClock(clock.displaySeconds)}
                  </span>
                ) : status === 'paused' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#332714] border border-[#EED89A] dark:border-[#5C441B] font-mono text-[11px] font-semibold text-[#8B6209] dark:text-[#E0A92E] tabular-nums">
                    Paused · {subjCode} {formatClock(clock.displaySeconds)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#261E1A] text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
                    <Play className="h-2.5 w-2.5 text-[#6E261A] dark:text-[#E0A92E]" />
                    {activePreset.shortLabel} Ready
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-[#61554D] dark:text-[#A99B8E]">
                <span>
                  Today&apos;s Tally:{' '}
                  <strong
                    data-testid="today-minutes"
                    className="font-mono font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    {formatMinutesCompact(todayMinutes)}
                  </strong>{' '}
                  / {formatMinutesCompact(dailyGoalMinutes)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {todaySessionsCount} {todaySessionsCount === 1 ? 'session' : 'sessions'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                  <Flame className="h-3 w-3" />
                  {activeStreak}d streak
                </span>
              </div>

              {lastResumeNote && (
                <p className="text-[11px] text-[#8B6209] dark:text-[#D9B664] flex items-center gap-1.5 truncate max-w-xl">
                  <BookmarkCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Next Resume: {lastResumeNote}</span>
                </p>
              )}
            </div>
          </div>

          {/* Right: Progress Meter + Open Studio Pill */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block w-36 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#61554D] dark:text-[#A99B8E]">
                <span>Daily Goal</span>
                <span className="font-bold text-[#1C1613] dark:text-[#F5F0E8]">{goalPct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#EFE9DF] dark:bg-[#2C241F] overflow-hidden">
                <div
                  className="h-full w-full origin-left rounded-full bg-[#6E261A] dark:bg-[#E0A92E] transition-transform duration-300 ease-apple"
                  style={{ transform: `scaleX(${Math.max(0.03, goalPct / 100)})` }}
                />
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] text-xs font-semibold shrink-0">
              {status === 'running' ? 'Open Active Timer' : 'Open Focus Studio'}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      </section>
    );
  }
);

FocusQuickLaunchTile.displayName = 'FocusQuickLaunchTile';
