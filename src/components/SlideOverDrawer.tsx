import React, { useEffect } from 'react';
import {
  X,
  LayoutDashboard,
  BookOpen,
  Code2,
  Zap,
  Sparkles,
  LineChart,
  AlertTriangle,
  Timer,
  Calculator,
  FileDown,
  Command,
  Calendar,
  Settings,
  Sun,
  Moon,
  LogIn,
  LogOut,
  Flame,
  Database,
  CheckCircle2,
  CloudOff,
  Download,
  Smartphone,
  FlaskConical,
} from 'lucide-react';
import type { AuthUserSummary, GateRSyncStatus, NavView, SyncStatus } from '../types';
import { GATE_2027_MILESTONES } from '../utils/examPolish';
import { useFocusTimer } from '../context/FocusTimerContext';

interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenMistakeBucket: () => void;
  onJumpFocusTimer: () => void;
  onOpenCalculator: () => void;
  onOpenQuickPdf: () => void;
  onOpenPalette: () => void;
  theme: 'light' | 'dark';
  onSetLightDark: (mode: 'light' | 'dark') => void;
  user: AuthUserSummary | null;
  syncStatus: SyncStatus;
  onSignIn: () => void;
  onSignOut: () => void;
  gaterCount: number;
  gaterSyncStatus: GateRSyncStatus;
  streakDays: number;
  unresolvedMistakesCount: number;
  dueRevisionCount: number;
  pwaInstalled: boolean;
  pwaCanPrompt: boolean;
  onTriggerPwaInstall: () => void;
}

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  open,
  onClose,
  activeView,
  onNavigate,
  onOpenMistakeBucket,
  onJumpFocusTimer,
  onOpenCalculator,
  onOpenQuickPdf,
  onOpenPalette,
  theme,
  onSetLightDark,
  user,
  syncStatus,
  onSignIn,
  onSignOut,
  gaterCount,
  gaterSyncStatus,
  streakDays,
  unresolvedMistakesCount,
  dueRevisionCount,
  pwaInstalled,
  pwaCanPrompt,
  onTriggerPwaInstall,
}) => {
  const { status: focusStatus } = useFocusTimer();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleNav = (view: NavView) => {
    onNavigate(view);
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 no-print transition-opacity duration-200 ${
        open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!open}
    >
      {/* Subtle warm dim backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#1C1613]/40 dark:bg-black/65 backdrop-blur-[2px]"
      />

      {/* Right-side curved slide-over drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="GATE '27 Navigation and Utility Drawer"
        className={`drawer-panel absolute top-0 right-0 bottom-0 w-full max-w-[360px] bg-[#FAF8F4] dark:bg-[#16110E] border-l border-[#E8E0D5] dark:border-[#2E2520] rounded-l-[28px] shadow-warm-lg flex flex-col overflow-hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#E8E0D5] dark:border-[#2E2520] shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon.svg"
              alt="GATE CSE '27"
              className="h-8 w-8 rounded-[10px] shadow-sm border border-[#C89216]/40 object-cover shrink-0"
            />
            <div>
              <p className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] leading-tight">
                GATE &apos;27 Command
              </p>
              <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                Navigation &amp; Exam Utilities
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu drawer"
            className="h-8 w-8 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] flex items-center justify-center press-tactile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* 1. Profile & Cloud Sync Pill */}
          <section className="rounded-[20px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] p-3 shadow-warm space-y-2.5">
            {user ? (
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName}
                      className="h-9 w-9 rounded-full object-cover border border-[#E8E0D5] dark:border-[#352A24]"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="h-9 w-9 rounded-full bg-[#6E261A] text-white font-display text-xs font-bold flex items-center justify-center shrink-0">
                      {user.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                      {user.displayName}
                    </p>
                    <p className="text-[11px] text-[#2E5E3E] dark:text-[#63A87A] flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      {syncStatus === 'synced' ? 'Firestore Synced' : 'Connecting...'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-2.5 py-1.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#B83227] dark:hover:text-[#E87A70] flex items-center gap-1 press-tactile"
                  title="Sign out"
                >
                  <LogOut className="w-3 h-3" />
                  Out
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-8 w-8 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] flex items-center justify-center shrink-0">
                    <CloudOff className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                      Local Mode Active
                    </p>
                    <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] truncate">
                      Sign in to sync across devices
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSignIn();
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-medium flex items-center gap-1.5 shrink-0 press-tactile"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFE9DF] dark:border-[#2A221D]">
              <div className="rounded-[14px] bg-[#FAF8F4] dark:bg-[#241D19] px-2.5 py-2 flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-[#2E5E3E] dark:text-[#63A87A] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E] font-medium">
                    GateR Bank
                  </p>
                  <p className="text-xs font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8] truncate">
                    {gaterSyncStatus === 'syncing'
                      ? 'Syncing...'
                      : `${gaterCount.toLocaleString()} PYQs`}
                  </p>
                </div>
              </div>

              <div className="rounded-[14px] bg-[#FDF6E3] dark:bg-[#2C2215] px-2.5 py-2 flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-[#C89216] dark:text-[#E0A92E] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[#7A5610] dark:text-[#D9B664] font-medium">
                    70d Streak
                  </p>
                  <p className="text-xs font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                    {streakDays} {streakDays === 1 ? 'day' : 'days'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Primary Views */}
          <section className="space-y-1.5">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-[#61554D] dark:text-[#A99B8E]">
              Primary Views
            </p>
            <div className="rounded-[22px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] p-1.5 space-y-0.5">
              {[
                { id: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
                {
                  id: 'focus' as const,
                  label: 'Focus Studio',
                  icon: Timer,
                  badge: focusStatus === 'running' ? 'Live' : undefined,
                },
                { id: 'syllabus' as const, label: 'Subjects (11)', icon: BookOpen },
                { id: 'pyq' as const, label: 'PYQ Studio', icon: Code2 },
                { id: 'cslab' as const, label: 'CS Lab (Visualizers)', icon: FlaskConical },
                {
                  id: 'revision' as const,
                  label: 'Rapid-Fire Revision',
                  icon: Zap,
                  badge: dueRevisionCount > 0 ? `${dueRevisionCount} due` : undefined,
                },
                { id: 'tips' as const, label: 'Daily Traps & Tips', icon: Sparkles },
                { id: 'mocks' as const, label: 'Mocks & Analytics', icon: LineChart },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-[14px] text-xs font-medium transition-colors press-tactile ${
                      active
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white'
                        : 'text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#F4EFE6] dark:hover:bg-[#241D19]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8E620C] dark:text-[#E0A92E]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  onOpenMistakeBucket();
                  onClose();
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-[14px] text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#F4EFE6] dark:hover:bg-[#241D19] transition-colors press-tactile"
              >
                <span className="flex items-center gap-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#B83227] dark:text-[#E87A70] shrink-0" />
                  Mistake Bucket
                </span>
                {unresolvedMistakesCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums bg-[#FDECEB] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F09A91]">
                    {unresolvedMistakesCount}
                  </span>
                )}
              </button>
            </div>
          </section>

          {/* 3. Quick Tools */}
          <section className="space-y-1.5">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-[#61554D] dark:text-[#A99B8E]">
              Quick Tools
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onJumpFocusTimer();
                  onClose();
                }}
                className="rounded-[16px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] hover:border-[#C89216] p-2.5 text-left press-tactile"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Timer className="w-3.5 h-3.5 text-[#6E261A] dark:text-[#E0A92E] shrink-0" />
                  <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                    Focus Timer
                  </p>
                </div>
                <p className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Pomodoro &amp; Log</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenCalculator();
                  onClose();
                }}
                className="rounded-[16px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] hover:border-[#C89216] p-2.5 text-left press-tactile"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Calculator className="w-3.5 h-3.5 text-[#6E261A] dark:text-[#E0A92E] shrink-0" />
                  <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                    Calculator
                  </p>
                </div>
                <p className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Shortcut: C</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenQuickPdf();
                  onClose();
                }}
                className="rounded-[16px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] hover:border-[#C89216] p-2.5 text-left press-tactile"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <FileDown className="w-3.5 h-3.5 text-[#6E261A] dark:text-[#E0A92E] shrink-0" />
                  <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                    Quick PDF
                  </p>
                </div>
                <p className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">70-Day Study Sheet</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenPalette();
                  onClose();
                }}
                className="rounded-[16px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] hover:border-[#C89216] p-2.5 text-left press-tactile"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Command className="w-3.5 h-3.5 text-[#6E261A] dark:text-[#E0A92E] shrink-0" />
                  <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                    Command
                  </p>
                </div>
                <p className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Cmd / Ctrl + K</p>
              </button>
            </div>

            {/* Install GATE '27 App PWA Pill Card */}
            {pwaInstalled ? (
              <div
                data-testid="drawer-installed-badge"
                className="rounded-[18px] bg-[#EBF5EE] dark:bg-[#152B1D] border border-[#B9D6C2] dark:border-[#254A33] px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Installed as App
                </span>
                <span className="font-mono text-[10px] font-bold text-[#2E5E3E] dark:text-[#7BB88F]">
                  PWA Ready
                </span>
              </div>
            ) : (
              <button
                type="button"
                data-testid="drawer-install-app-btn"
                onClick={() => {
                  onClose();
                  onTriggerPwaInstall();
                }}
                className="w-full rounded-[18px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] hover:border-[#C89216] px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left press-tactile"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="h-8 w-8 rounded-[11px] bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] flex items-center justify-center shrink-0">
                    {pwaCanPrompt ? (
                      <Download className="w-4 h-4" />
                    ) : (
                      <Smartphone className="w-4 h-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-[#6E261A] dark:text-[#E0A92E] truncate">
                      Install GATE &apos;27 App
                    </span>
                    <span className="block text-[10px] text-[#7D570A] dark:text-[#D9B664] truncate">
                      {pwaCanPrompt
                        ? '1-tap install · Offline PYQs & Focus'
                        : 'Android, iOS & Desktop Home Screen'}
                    </span>
                  </span>
                </span>
                <span className="px-2.5 py-1 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white text-[10px] font-semibold shrink-0">
                  Install
                </span>
              </button>
            )}
          </section>

          {/* 4. GATE 2027 Milestones Mini-Card */}
          <section className="rounded-[20px] bg-[#241914] text-[#F5F0E8] p-3 ring-1 ring-inset ring-amber-100/10 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#E0A92E]">
              <Calendar className="w-3.5 h-3.5" />
              GATE 2027 Official Milestones
            </div>
            <div className="space-y-1">
              {GATE_2027_MILESTONES.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between text-[11px] border-b border-white/10 last:border-none pb-1 last:pb-0"
                >
                  <span className="text-[#D4C6B8]">{m.label}</span>
                  <span className="font-mono text-[11px] font-semibold text-[#FDF6E3] tabular-nums">
                    {m.date}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 5. Settings, Theme & Credit Footer */}
        <div className="px-4 py-3.5 border-t border-[#E8E0D5] dark:border-[#2E2520] bg-white/80 dark:bg-[#1C1714]/90 shrink-0 space-y-2.5">
          <div className="flex items-center gap-2">
            {/* Segmented Light/Dark Pill */}
            <div className="flex-1 flex items-center p-1 rounded-full bg-[#EFE9DF] dark:bg-[#261E1A] border border-[#E8E0D5] dark:border-[#352A24]">
              <button
                type="button"
                onClick={() => onSetLightDark('light')}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  theme === 'light'
                    ? 'bg-white text-[#1C1613] shadow-sm'
                    : 'text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-[#C89216]" />
                Light
              </button>
              <button
                type="button"
                onClick={() => onSetLightDark('dark')}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  theme === 'dark'
                    ? 'bg-[#1C1714] text-[#F5F0E8] shadow-sm border border-[#352A24]'
                    : 'text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-[#E0A92E]" />
                Dark
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleNav('settings')}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 press-tactile ${
                activeView === 'settings'
                  ? 'bg-[#6E261A] text-white'
                  : 'bg-[#F4EFE6] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border border-[#E8E0D5] dark:border-[#352A24]'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          </div>

          <p className="text-center text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
            Built by <span className="text-[#6E261A] dark:text-[#E0A92E] font-semibold">Nihal Pawar</span> · GATE CSE 2027
          </p>
        </div>
      </aside>
    </div>
  );
};
