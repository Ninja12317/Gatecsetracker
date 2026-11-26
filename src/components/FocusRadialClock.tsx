import React, { useEffect, useState } from 'react';
import type { AccentThemeId } from '../types';
import { SUBJECT_MAP } from '../data/syllabus';
import { useFocusTimer } from '../context/FocusTimerContext';
import { computeTimerClock, formatClock } from '../utils/focusAnalytics';
import { getActiveThemePalette } from '../utils/themeEngine';

interface FocusRadialClockProps {
  size?: 'normal' | 'zen';
  accentTheme?: AccentThemeId;
  isDark?: boolean;
}

/**
 * Isolated React.memo precision SVG circular progress ring + warm ivory monospace countdown.
 * Uses requestAnimationFrame ONLY while running so the progress arc animates
 * at a silky 60fps without re-rendering Recharts, heatmaps, or any sibling components.
 */
export const FocusRadialClock: React.FC<FocusRadialClockProps> = React.memo(
  ({ size = 'normal', accentTheme = 'brown', isDark = false }) => {
    const { clockSnapshot, status, subjectId, activePreset, sessionType } = useFocusTimer();
    const [nowMs, setNowMs] = useState<number>(() => Date.now());
    const palette = getActiveThemePalette(accentTheme, isDark);

    useEffect(() => {
      setNowMs(Date.now());
      if (status !== 'running') return;

      let rafId = 0;
      const tick = () => {
        setNowMs(Date.now());
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(rafId);
    }, [status, clockSnapshot]);

    const computed = computeTimerClock(clockSnapshot, nowMs);
    const isZen = size === 'zen';

    const svgDim = isZen ? 320 : 256;
    const strokeWidth = isZen ? 10 : 8.5;
    const radius = (svgDim - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * radius;

    // Show a subtle minimal start notch (0.015) once running or paused with progress
    const visualRatio =
      computed.progressRatio > 0
        ? Math.max(0.012, Math.min(1, computed.progressRatio))
        : 0;
    const dashOffset = circumference * (1 - visualRatio);

    const ringStroke = activePreset.kind === 'break' ? '#7BB88F' : palette.accentSecondary;

    const subj = SUBJECT_MAP[subjectId];
    const statusLabel =
      status === 'running'
        ? activePreset.kind === 'break'
          ? 'Restoring Focus'
          : 'Deep Work Active'
        : status === 'paused'
        ? 'Session Paused'
        : activePreset.kind === 'stopwatch'
        ? 'Stopwatch Ready'
        : activePreset.kind === 'break'
        ? 'Break Ready'
        : 'Ready to Lock In';

    return (
      <div className="relative flex flex-col items-center justify-center select-none">
        <div
          className="relative flex items-center justify-center"
          style={{ width: svgDim, height: svgDim }}
        >
          <svg
            width={svgDim}
            height={svgDim}
            viewBox={`0 0 ${svgDim} ${svgDim}`}
            className="-rotate-90"
            aria-hidden="true"
          >
            {/* Outer subtle recessed hairline ring */}
            <circle
              cx={svgDim / 2}
              cy={svgDim / 2}
              r={radius}
              fill="none"
              stroke="rgba(245, 240, 232, 0.1)"
              strokeWidth={strokeWidth}
            />
            {/* Smooth 60fps theme-matched progress arc */}
            <circle
              cx={svgDim / 2}
              cy={svgDim / 2}
              r={radius}
              fill="none"
              stroke={ringStroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: status === 'running' ? 'none' : 'stroke-dashoffset 260ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </svg>

          {/* Center Ivory Monospace Clock Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase text-[#D6C7B7]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${status === 'running' ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor:
                    status === 'running' ? ringStroke : '#8A7768',
                }}
              />
              {statusLabel}
            </span>

            <div
              data-testid={isZen ? 'zen-focus-clock' : 'focus-studio-clock'}
              className={`mt-1.5 font-mono font-bold tabular-nums tracking-[-0.04em] leading-none text-[#FAF8F4] ${
                isZen ? 'text-6xl sm:text-7xl' : 'text-[46px] sm:text-[54px]'
              }`}
            >
              {formatClock(computed.displaySeconds)}
            </div>

            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[#C7B6A5]">
              <span
                className="font-mono font-semibold"
                style={{ color: palette.accentSecondary }}
              >
                {activePreset.kind === 'break' ? activePreset.shortLabel : subj?.code ?? 'GATE'}
              </span>
              <span aria-hidden="true" className="text-[#6E5B4E]">
                ·
              </span>
              <span className="truncate max-w-[140px]">
                {activePreset.kind === 'break' ? 'Recovery' : sessionType}
              </span>
            </div>

            {computed.elapsedSeconds > 0 && !clockSnapshot.isStopwatch && (
              <span className="mt-1 font-mono text-[10px] tabular-nums text-[#9B897A]">
                {Math.round(computed.progressRatio * 100)}% elapsed
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

FocusRadialClock.displayName = 'FocusRadialClock';

