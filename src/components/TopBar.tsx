import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import {
  Menu,
  LogIn,
  Search,
} from 'lucide-react';
import type { AuthUserSummary, ContentWidthMode, NavView, SyncStatus } from '../types';
import { useFocusTimer } from '../context/FocusTimerContext';

interface TopBarProps {
  activeView: NavView;
  contentWidth: ContentWidthMode;
  user: AuthUserSummary | null;
  syncStatus: SyncStatus;
  quotaNotice: string;
  unresolvedMistakesCount: number;
  revisionDueCount: number;
  onSelectView: (view: NavView) => void;
  onSignInGoogle: () => void;
  onOpenCommandPalette: () => void;
  onOpenDrawer: () => void;
}

const PRIMARY_NAV: Array<{ id: NavView; label: string }> = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'focus', label: 'Focus' },
  { id: 'syllabus', label: 'Subjects' },
  { id: 'pyq', label: 'PYQ Studio' },
  { id: 'cslab', label: 'CS Lab' },
  { id: 'revision', label: 'Revision' },
  { id: 'tips', label: 'Daily Tips' },
  { id: 'mocks', label: 'Mocks' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  contentWidth,
  user,
  syncStatus,
  quotaNotice,
  unresolvedMistakesCount,
  revisionDueCount,
  onSelectView,
  onSignInGoogle,
  onOpenCommandPalette,
  onOpenDrawer,
}) => {
  const { status: focusStatus } = useFocusTimer();
  const isFocusRunning = focusStatus === 'running';

  // Pure-GPU sliding active pill measurements (zero external runtime overhead, 60fps translate3d)
  const navContainerRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillRect, setPillRect] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0,
    width: 0,
    visible: false,
  });

  const measureActivePill = () => {
    const container = navContainerRef.current;
    const activeBtn = buttonRefs.current[activeView];
    if (!container || !activeBtn) {
      setPillRect((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const cRect = container.getBoundingClientRect();
    const bRect = activeBtn.getBoundingClientRect();
    setPillRect({
      left: bRect.left - cRect.left,
      width: bRect.width,
      visible: true,
    });
  };

  useLayoutEffect(() => {
    measureActivePill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, unresolvedMistakesCount, revisionDueCount, contentWidth, isFocusRunning]);

  useEffect(() => {
    const onResize = () => measureActivePill();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const syncDotColor =
    syncStatus === 'synced'
      ? 'bg-[#2E5E3E] dark:bg-[#7BB88F]'
      : syncStatus === 'connecting'
      ? 'bg-[#C89216] dark:bg-[#E0A92E] animate-pulse'
      : syncStatus === 'error'
      ? 'bg-[#B83227] dark:bg-[#E05D52]'
      : 'bg-[#A99B8E] dark:bg-[#6E6057]';

  const containerMaxClass = contentWidth === 'wide' ? 'max-w-[1536px]' : 'max-w-[1280px]';

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4]/95 dark:bg-[#130F0D]/95">
      <div className={`${containerMaxClass} mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 transition-[max-width] duration-200`}>
        {/* Left: Squircle Brand Badge + GATE '27 Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onSelectView('dashboard')}
            className="flex items-center gap-2.5 group press-tactile"
            aria-label="Go to GATE '27 Overview"
          >
            <img
              src="/icon.svg"
              alt="GATE CSE '27 Emblem"
              className="h-9 w-9 rounded-[12px] squircle shadow-xs border border-[#C89216]/40 object-cover shrink-0"
            />
            <span className="flex flex-col text-left leading-none">
              <span className="font-display text-[15px] font-bold tracking-[-0.03em] text-[#1C1613] dark:text-[#F5F0E8]">
                GATE &apos;27
              </span>
              <span className="mt-0.5 text-[10px] font-medium text-[#61554D] dark:text-[#A99B8E] hidden sm:inline">
                IITM CSE War Room
              </span>
            </span>
          </button>
        </div>

        {/* Center: Floating Segmented Pill Navigation with Pure-GPU Sliding Highlight */}
        <nav
          ref={navContainerRef}
          aria-label="Primary navigation"
          className="relative hidden lg:flex items-center gap-0.5 rounded-full bg-[#EFE9DF] dark:bg-[#241D19] p-1 border border-[#E8E0D5] dark:border-[#2E2520]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5]/90 dark:border-[#3A2E28] shadow-xs transition-[transform,width,opacity] duration-300 ease-apple will-change-transform"
            style={{
              width: pillRect.width,
              transform: `translate3d(${pillRect.left}px, 0, 0)`,
              opacity: pillRect.visible ? 1 : 0,
            }}
          />

          {PRIMARY_NAV.map((item) => {
            const isActive = activeView === item.id;
            const badgeCount =
              item.id === 'syllabus'
                ? revisionDueCount
                : item.id === 'pyq'
                ? unresolvedMistakesCount
                : 0;

            return (
              <button
                key={item.id}
                ref={(el) => {
                  buttonRefs.current[item.id] = el;
                }}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative z-10 px-2.5 xl:px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap select-none ${
                  isActive
                    ? 'text-[#1C1613] dark:text-[#F5F0E8]'
                    : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {item.id === 'focus' && isFocusRunning && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[#C89216] dark:bg-[#E0A92E] animate-pulse"
                      aria-hidden="true"
                    />
                  )}
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span
                      className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold tabular-nums ${
                        item.id === 'pyq'
                          ? 'bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                          : 'bg-[#FDF6E3] dark:bg-[#332714] text-[#9A6E0C] dark:text-[#E0A92E]'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right: Clean Decluttered Actions + Far Top-Right Circular 3-Line Hamburger Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Open quick search command palette"
            title="Quick Jump (⌘K)"
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] text-xs font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] hover:border-[#D4C7B7] dark:hover:border-[#42352E] press-tactile"
          >
            <Search className="h-3.5 w-3.5" />
            <kbd className="font-mono text-[10px] text-[#8C7E75] dark:text-[#9A8B7E]">⌘K</kbd>
          </button>

          {user ? (
            <button
              type="button"
              onClick={onOpenDrawer}
              title={`Signed in as ${user.email} · Open menu`}
              className="hidden sm:flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] hover:border-[#C89216] press-tactile"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full object-cover border border-[#E8E0D5] dark:border-[#2E2520]"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-[10px] font-bold text-white">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className={`h-2 w-2 rounded-full ${syncDotColor}`} aria-hidden="true" />
              <span className="hidden md:inline text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8] max-w-[88px] truncate">
                {user.displayName.split(' ')[0]}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInGoogle}
              data-testid="google-signin-btn"
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-[#FAF8F4] text-xs font-semibold press-tactile whitespace-nowrap shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Far Top-Right Tactile Circular 3-Line Hamburger Button (Desktop + Mobile) */}
          <button
            type="button"
            onClick={onOpenDrawer}
            data-testid="top-right-hamburger-btn"
            aria-label="Open navigation and utility menu"
            title="Open Navigation & Utility Drawer"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#6E261A] dark:hover:border-[#E0A92E] hover:text-[#6E261A] dark:hover:text-[#E0A92E] shadow-xs press-tactile shrink-0"
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Minimal Free-Tier Quota Notice (shown ONLY when 429 limit reached) */}
      {quotaNotice && (
        <div
          data-testid="quota-notice-bar"
          className="border-t border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] px-4 sm:px-6 py-1.5 text-xs font-mono text-[#8B6209] dark:text-[#E0A92E]"
        >
          <div className={`${containerMaxClass} mx-auto`}>{quotaNotice}</div>
        </div>
      )}
    </header>
  );
};
