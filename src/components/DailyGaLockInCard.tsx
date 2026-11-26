import React from 'react';
import { Flame, CheckCircle2, Clock, Play, Target, Eye } from 'lucide-react';
import type { DailyTestRecord } from '../types';
import type { GaStreakMetrics } from '../utils/gaStreak';

interface DailyGaLockInCardProps {
  metrics: GaStreakMetrics;
  availableGaCount: number;
  unseenRemaining?: number;
  todayGaRecord?: DailyTestRecord;
  onStartGaSprint: () => void;
  onReviewGaSprint?: () => void;
  variant?: 'full' | 'compact';
}

export const DailyGaLockInCard: React.FC<DailyGaLockInCardProps> = ({
  metrics,
  availableGaCount,
  unseenRemaining,
  todayGaRecord,
  onStartGaSprint,
  onReviewGaSprint,
  variant = 'full',
}) => {
  const isCompletedToday = Boolean(todayGaRecord?.completed || metrics.completedToday);
  const scoreSummary =
    todayGaRecord?.completed
      ? `${todayGaRecord.score}/${todayGaRecord.maxMarks}`
      : null;

  if (variant === 'compact') {
    return (
      <div
        data-testid="pyq-ga-lockin-banner"
        className="rounded-[24px] squircle border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-warm"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-9 w-9 rounded-[12px] bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF5EB] flex items-center justify-center shrink-0">
            <Flame className="h-4 w-4 text-[#E0A92E]" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Daily GA Lock-In (15M Guaranteed)
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isCompletedToday
                    ? 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                    : 'bg-[#FFFFFF] dark:bg-[#1C1714] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A] dark:border-[#5C441B]'
                }`}
              >
                {isCompletedToday
                  ? scoreSummary
                    ? `GA Completed ✓ · ${scoreSummary}`
                    : 'Completed Today ✓'
                  : 'Today Pending'}
              </span>
            </div>
            <p className="text-[11px] text-[#61554D] dark:text-[#D8CBB8] font-mono tabular-nums mt-0.5">
              GA Streak: <strong>{metrics.streakDays}d</strong> · Rolling Acc:{' '}
              <strong>{metrics.rollingAccuracyPct}%</strong> · Projected:{' '}
              <strong>{metrics.projectedGaScore.toFixed(1)}/15</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {todayGaRecord?.completed && onReviewGaSprint ? (
            <button
              type="button"
              onClick={onReviewGaSprint}
              data-testid="pyq-review-ga-sprint-btn"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#2E5E3E] hover:bg-[#234A30] text-white text-xs font-semibold press-tactile"
            >
              <Eye className="h-3.5 w-3.5" />
              Review Answers
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartGaSprint}
              disabled={availableGaCount === 0}
              data-testid="pyq-start-ga-sprint-btn"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold disabled:opacity-45 press-tactile"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Start 10-Min GA Sprint (5 Qs)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      data-testid="daily-ga-lockin-card"
      className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm flex flex-col justify-between gap-4"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E261A] dark:text-[#E0A92E]">
              <Target className="h-3.5 w-3.5" />
              Daily 10-Min GA (15M)
            </div>
            <h3 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              General Aptitude Streak
            </h3>
            <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
              5 unseen GateR GA PYQs under a 10:00 timer · never repeats prior days.
              {typeof unseenRemaining === 'number' && (
                <span className="font-mono ml-1 text-[#8B6209] dark:text-[#E0A92E]">
                  ({unseenRemaining.toLocaleString()} unseen left)
                </span>
              )}
            </p>
          </div>

          <span
            data-testid="ga-today-status-pill"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shrink-0 ${
              isCompletedToday
                ? 'border-[#B8D7C3] dark:border-[#264D34] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                : 'border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]'
            }`}
          >
            {isCompletedToday ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {scoreSummary ? `GA Completed ✓ · ${scoreSummary}` : 'GA Completed ✓'}
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5" />
                Pending Today
              </>
            )}
          </span>
        </div>

        {/* 3 Compact Metric Tiles */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-[18px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8B6209] dark:text-[#E0A92E] flex items-center gap-1">
              <Flame className="h-3 w-3" />
              GA Streak
            </div>
            <div
              data-testid="ga-streak-days"
              className="mt-1 font-mono text-lg font-bold tabular-nums text-[#6E261A] dark:text-[#FAF5EB]"
            >
              {metrics.streakDays} {metrics.streakDays === 1 ? 'day' : 'days'}
            </div>
          </div>

          <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
              Rolling Acc
            </div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#2E5E3E] dark:text-[#7BB88F]">
              {metrics.rollingAccuracyPct}%
            </div>
          </div>

          <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
              GA Projected
            </div>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
              {metrics.projectedGaScore.toFixed(1)}
              <span className="text-xs font-normal text-[#61554D] dark:text-[#A99B8E]">/15</span>
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Mini Consistency Dots + Start / Review CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5" aria-label="Last 7 days GA streak">
          {metrics.last7Days.map((day) => (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span
                title={`${day.date}: ${day.completed ? 'Completed' : 'Pending'}`}
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold border ${
                  day.completed
                    ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#C89216] text-white dark:text-[#1C1613]'
                    : 'border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-[#8C7E75]'
                }`}
              >
                {day.completed ? '✓' : '·'}
              </span>
              <span className="text-[9px] font-mono text-[#8C7E75]">{day.label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {todayGaRecord?.completed && onReviewGaSprint ? (
            <button
              type="button"
              onClick={onReviewGaSprint}
              data-testid="review-ga-sprint-btn"
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#2E5E3E] hover:bg-[#234A30] dark:bg-[#245034] dark:hover:bg-[#2E6441] text-white text-xs font-semibold press-tactile shadow-warm"
            >
              <Eye className="h-3.5 w-3.5" />
              Review Answers
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartGaSprint}
              disabled={availableGaCount === 0}
              data-testid="start-ga-sprint-btn"
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold disabled:opacity-45 press-tactile shadow-warm"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Start 10-Min GA Test (5 Qs)
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

