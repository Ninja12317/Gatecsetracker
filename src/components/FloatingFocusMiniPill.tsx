import React, { useEffect, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import { SUBJECT_MAP } from '../data/syllabus';
import { useFocusTimer } from '../context/FocusTimerContext';
import { computeTimerClock, formatClock } from '../utils/focusAnalytics';

interface FloatingFocusMiniPillProps {
  visible: boolean;
  onOpenFocus: () => void;
}

/**
 * Isolated React.memo floating mini-timer pill displayed in the bottom-right corner
 * whenever the Focus Studio timer is active (running or paused mid-block) on another tab.
 */
export const FloatingFocusMiniPill: React.FC<FloatingFocusMiniPillProps> = React.memo(
  ({ visible, onOpenFocus }) => {
    const {
      clockSnapshot,
      status,
      subjectId,
      activePreset,
      soundMode,
      toggleStartPause,
    } = useFocusTimer();

    const shouldShow =
      visible && (status === 'running' || (status === 'paused' && clockSnapshot.accumulatedSeconds > 0));

    const [nowMs, setNowMs] = useState<number>(() => Date.now());

    useEffect(() => {
      if (!shouldShow || status !== 'running') return;
      setNowMs(Date.now());
      const id = window.setInterval(() => setNowMs(Date.now()), 1000);
      return () => window.clearInterval(id);
    }, [shouldShow, status]);

    if (!shouldShow) return null;

    const clock = computeTimerClock(clockSnapshot, nowMs);
    const subjCode =
      activePreset.kind === 'break'
        ? 'BRK'
        : SUBJECT_MAP[subjectId]?.code ?? subjectId.toUpperCase();

    return (
      <div
        data-testid="floating-focus-pill"
        role="region"
        aria-label="Active Focus Timer"
        className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-1.5 rounded-full bg-[#241914] dark:bg-[#171311] text-[#FAF8F4] pl-3.5 pr-1.5 py-1.5 border border-[#C89216]/45 shadow-warm-lg"
      >
        <button
          type="button"
          onClick={onOpenFocus}
          aria-label={`Open Focus Studio (${subjCode} ${formatClock(clock.displaySeconds)})`}
          className="flex items-center gap-2 pr-1.5 text-left press-tactile"
        >
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              status === 'running'
                ? 'bg-[#E0A92E] animate-pulse'
                : 'bg-[#A99B8E]'
            }`}
            aria-hidden="true"
          />
          <span className="font-mono text-[11px] font-bold tracking-wide text-[#E0A92E]">
            {subjCode}
          </span>
          <span className="text-[#6E5C50]" aria-hidden="true">
            ·
          </span>
          <span
            data-testid="floating-focus-clock"
            className="font-mono text-xs font-bold tabular-nums text-[#FAF8F4]"
          >
            {formatClock(clock.displaySeconds)}
          </span>
          {soundMode !== 'off' && (
            <Volume2 className="h-3 w-3 text-[#C89216] shrink-0" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleStartPause}
          aria-label={status === 'running' ? 'Pause focus timer' : 'Resume focus timer'}
          title={status === 'running' ? 'Pause timer' : 'Resume timer'}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6E261A] hover:bg-[#8A3022] dark:bg-[#9E3E2E] text-[#FAF8F4] press-tactile"
        >
          {status === 'running' ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5 ml-0.5" />
          )}
        </button>
      </div>
    );
  }
);

FloatingFocusMiniPill.displayName = 'FloatingFocusMiniPill';
