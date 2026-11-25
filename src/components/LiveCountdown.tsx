import React, { useState, useEffect } from 'react';
import { computeCountdown, computeSprintPhase } from '../utils/gateMath';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface DaysLeftPillProps {
  targetDateIso: string;
}

/**
 * Isolated 1-minute updating pill for the Hero kicker so parent views never re-render on ticks.
 */
export const DaysLeftPill: React.FC<DaysLeftPillProps> = React.memo(({ targetDateIso }) => {
  const [days, setDays] = useState(() => computeCountdown(targetDateIso).days);

  useEffect(() => {
    setDays(computeCountdown(targetDateIso).days);
    const id = window.setInterval(() => {
      setDays(computeCountdown(targetDateIso).days);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [targetDateIso]);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#F4EFE6] dark:bg-[#241D19] px-3.5 py-1.5 text-xs font-medium text-[#61554D] dark:text-[#D8CBB8]">
      <span className="h-2 w-2 rounded-full bg-[#C89216] dark:bg-[#E0A92E] shrink-0" aria-hidden="true" />
      <span className="font-mono font-semibold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
        {days} days left
      </span>
      <span aria-hidden="true">·</span>
      <span>IIT Madras GATE CSE 2027</span>
    </div>
  );
});

DaysLeftPill.displayName = 'DaysLeftPill';

interface LiveCountdownTileProps {
  targetDateIso: string;
  shift: string;
}

/**
 * Memoized, self-contained 1-second live countdown leaf inside the Roasted Cocoa Bento tile.
 * Ticking every second ONLY updates this leaf — zero parent dashboard/chart/sketchpad re-renders.
 */
export const LiveCountdownTile: React.FC<LiveCountdownTileProps> = React.memo(
  ({ targetDateIso, shift }) => {
    const [countdown, setCountdown] = useState(() => computeCountdown(targetDateIso));

    useEffect(() => {
      setCountdown(computeCountdown(targetDateIso));
      const timer = window.setInterval(() => {
        setCountdown(computeCountdown(targetDateIso));
      }, 1000);
      return () => window.clearInterval(timer);
    }, [targetDateIso]);

    const sprintPhase = computeSprintPhase(countdown.days);
    const formattedDate = new Date(targetDateIso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <div
        data-testid="hero-countdown"
        className="rounded-[20px] squircle bg-[#241914] dark:bg-[#16100D] text-[#F5F0E8] p-5 ring-1 ring-inset ring-amber-100/10"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#C8B9AA]">
          <span className="font-medium text-[#E5B23A]">{sprintPhase.label}</span>
          <span className="font-mono tabular-nums">
            {formattedDate} · {shift.split(' ')[0]}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: 'Days', val: pad2(countdown.days) },
            { label: 'Hrs', val: pad2(countdown.hours) },
            { label: 'Min', val: pad2(countdown.minutes) },
            { label: 'Sec', val: pad2(countdown.seconds) },
          ].map((unit) => (
            <div
              key={unit.label}
              className="rounded-[14px] bg-[#2C221D] dark:bg-[#221915] px-2 py-2.5 text-center ring-1 ring-inset ring-amber-100/10"
            >
              <div className="font-mono text-2xl sm:text-[26px] font-bold tabular-nums leading-none text-[#FAF5EB]">
                {unit.val}
              </div>
              <div className="mt-1.5 text-[10px] font-medium text-[#B8A695]">
                {unit.label}
              </div>
            </div>
          ))}
        </div>

        {/* 70-Day Sprint Progress Bar (GPU scaleX transform) */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#C8B9AA]">
            <span className="truncate">{sprintPhase.focus}</span>
            <span className="font-mono font-semibold tabular-nums text-[#E5B23A] ml-2 shrink-0">
              {sprintPhase.sprintProgressPct}%
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-[#3A2D26] overflow-hidden"
            role="progressbar"
            aria-label="70-day sprint roadmap progress"
            aria-valuenow={sprintPhase.sprintProgressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full w-full origin-left rounded-full bg-[#E0A92E] transition-transform duration-300 ease-apple"
              style={{
                transform: `scaleX(${Math.max(0.03, sprintPhase.sprintProgressPct / 100)})`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }
);

LiveCountdownTile.displayName = 'LiveCountdownTile';
