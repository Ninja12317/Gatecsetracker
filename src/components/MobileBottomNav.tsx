import React, { useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Code2,
  Timer,
  LineChart,
  FlaskConical,
  Sparkles,
} from 'lucide-react';
import type { NavView } from '../types';
import { MOBILE_BOTTOM_TABS } from '../utils/mobileNav';
import { useFocusTimer } from '../context/FocusTimerContext';

interface MobileBottomNavProps {
  activeView: NavView;
  hidden?: boolean;
  onSelectView: (view: NavView) => void;
}

const TAB_ICONS: Partial<Record<NavView, React.ComponentType<{ className?: string }>>> = {
  dashboard: LayoutDashboard,
  syllabus: BookOpen,
  pyq: Code2,
  focus: Timer,
  mocks: LineChart,
  cslab: FlaskConical,
  tips: Sparkles,
};

/**
 * Sculpted Floating Curved Mobile Bottom Navigation Capsule (< 768px).
 * Horizontally scrollable single-row pill rail with smooth active-pill auto-centering
 * and a live Imperial Gold pulse on Focus whenever Pomodoro is active.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  hidden = false,
  onSelectView,
}) => {
  const { status: focusStatus } = useFocusTimer();
  const isFocusRunning = focusStatus === 'running';
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (hidden) return;
    const activeEl = itemRefs.current[activeView];
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeView, hidden]);

  if (hidden) return null;

  return (
    <div
      data-testid="mobile-bottom-nav"
      data-no-swipe="true"
      className="no-print md:hidden fixed inset-x-0 z-40 px-3 pointer-events-none"
      style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      <nav
        aria-label="Mobile primary navigation"
        data-no-swipe="true"
        className="pointer-events-auto mx-auto max-w-md rounded-[26px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF]/95 dark:bg-[#1C1714]/95 backdrop-blur-md shadow-[0_12px_32px_-8px_rgba(28,22,19,0.16)] dark:shadow-[0_14px_36px_-8px_rgba(0,0,0,0.65)] p-1.5"
      >
        <div
          data-no-swipe="true"
          className="flex flex-nowrap items-center gap-1 overflow-x-auto no-scrollbar snap-x snap-mandatory"
        >
          {MOBILE_BOTTOM_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id] ?? LayoutDashboard;
            const isActive = activeView === tab.id;
            const showFocusPulse = tab.id === 'focus' && isFocusRunning;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  itemRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => onSelectView(tab.id)}
                data-testid={`mobile-nav-${tab.id}`}
                aria-current={isActive ? 'page' : undefined}
                className={`relative shrink-0 whitespace-nowrap snap-center inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-[20px] text-xs font-semibold transition-all duration-200 ease-apple active:scale-95 select-none ${
                  isActive
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] shadow-xs'
                    : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]'
                }`}
              >
                <span className="relative inline-flex items-center justify-center">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive
                        ? 'text-[#FAF8F4] dark:text-[#E0A92E]'
                        : 'text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  />
                  {showFocusPulse && (
                    <span
                      data-testid="mobile-nav-focus-pulse"
                      className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-[#E0A92E] ring-2 ring-[#FFFFFF] dark:ring-[#1C1714] animate-pulse"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
