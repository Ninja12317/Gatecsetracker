import React, { useEffect, useRef, useState } from 'react';
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
  FlaskConical,
  Check,
  Palette,
  EyeOff,
  ChevronRight,
} from 'lucide-react';
import type { AccentThemeId, AuthUserSummary, NavView, UserProfile } from '../types';
import { GATE_2027_MILESTONES } from '../utils/examPolish';
import { ACCENT_THEMES } from '../utils/themeEngine';
import { resolveEffectiveProfile } from '../utils/profileHelpers';
import { useFocusTimer } from '../context/FocusTimerContext';

interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenProfileSettings: () => void;
  onOpenMistakeBucket: () => void;
  onJumpFocusTimer: () => void;
  onOpenCalculator: () => void;
  onOpenQuickPdf: () => void;
  onOpenPalette: () => void;
  theme: 'light' | 'dark';
  onSetLightDark: (mode: 'light' | 'dark') => void;
  accentTheme: AccentThemeId;
  onSetAccentTheme: (accent: AccentThemeId) => void;
  onThemeSelectedToast?: (themeName: string) => void;
  simpleMode: boolean;
  onToggleSimpleMode: (enabled: boolean) => void;
  user: AuthUserSummary | null;
  profile?: UserProfile;
  onSignIn: () => void;
  onSignOut: () => void;
  streakDays: number;
  unresolvedMistakesCount: number;
  dueRevisionCount: number;
}

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  open,
  onClose,
  activeView,
  onNavigate,
  onOpenProfileSettings,
  onOpenMistakeBucket,
  onJumpFocusTimer,
  onOpenCalculator,
  onOpenQuickPdf,
  onOpenPalette,
  theme,
  onSetLightDark,
  accentTheme,
  onSetAccentTheme,
  onThemeSelectedToast,
  simpleMode,
  onToggleSimpleMode,
  user,
  profile,
  onSignIn,
  onSignOut,
  streakDays,
  unresolvedMistakesCount,
  dueRevisionCount,
}) => {
  const { status: focusStatus } = useFocusTimer();
  const [palettePopoverOpen, setPalettePopoverOpen] = useState(false);
  const palettePopoverRef = useRef<HTMLDivElement>(null);

  const effectiveProfile = resolveEffectiveProfile(profile, user);
  const activeAccentMeta =
    ACCENT_THEMES.find((t) => t.id === accentTheme) ?? ACCENT_THEMES[0];

  useEffect(() => {
    if (!open) {
      setPalettePopoverOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (palettePopoverOpen) {
          setPalettePopoverOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, palettePopoverOpen]);

  useEffect(() => {
    if (!palettePopoverOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        palettePopoverRef.current &&
        !palettePopoverRef.current.contains(e.target as Node)
      ) {
        setPalettePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [palettePopoverOpen]);

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
          {/* 1. Compact Profile + Streak Header Card (taps directly to Settings -> Profile Settings) */}
          <button
            type="button"
            data-testid="drawer-profile-card"
            onClick={() => {
              onOpenProfileSettings();
              onClose();
            }}
            className="w-full text-left rounded-[22px] squircle bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] hover:border-[#C89216] p-3 shadow-warm flex items-center justify-between gap-2.5 transition-colors press-tactile"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {effectiveProfile.avatarUrl ? (
                <img
                  src={effectiveProfile.avatarUrl}
                  alt={effectiveProfile.displayName}
                  data-testid="drawer-profile-avatar-img"
                  className="h-10 w-10 rounded-full object-cover border border-[#E8E0D5] dark:border-[#352A24] shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span
                  data-testid="drawer-profile-avatar-initials"
                  className="h-10 w-10 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white font-display text-xs font-bold flex items-center justify-center shrink-0"
                >
                  {effectiveProfile.initials}
                </span>
              )}

              <div className="min-w-0">
                <p
                  data-testid="drawer-profile-name"
                  className="text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] truncate leading-tight"
                >
                  {effectiveProfile.displayName}
                </p>
                {effectiveProfile.targetGoal && (
                  <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] truncate mt-0.5">
                    {effectiveProfile.targetGoal}
                  </p>
                )}
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-2.5 py-0.5">
                  <Flame className="w-3 h-3 text-[#C89216] dark:text-[#E0A92E] shrink-0" />
                  <span
                    data-testid="drawer-streak-pill"
                    className="text-[11px] font-semibold tabular-nums text-[#7A5610] dark:text-[#E0A92E]"
                  >
                    70D Streak · {streakDays} {streakDays === 1 ? 'day' : 'days'}
                  </span>
                </div>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-[#8C7E75] dark:text-[#9A8B7E] shrink-0" />
          </button>

          {/* 2. Primary Views + Simple Mode Pill */}
          <section className="space-y-1.5">
            <div className="px-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#61554D] dark:text-[#A99B8E]">
                Primary Views
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={simpleMode}
                data-testid="drawer-simple-mode-toggle"
                onClick={() => onToggleSimpleMode(!simpleMode)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-colors press-tactile ${
                  simpleMode
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                    : 'bg-[#EFE9DF] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                }`}
              >
                <EyeOff className="w-3 h-3" />
                Simple Mode {simpleMode ? 'ON' : 'OFF'}
              </button>
            </div>

            {simpleMode && (
              <button
                type="button"
                data-testid="drawer-switch-to-full-btn"
                onClick={() => onToggleSimpleMode(false)}
                className="w-full rounded-[16px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-3 py-2 flex items-center justify-between text-[11px] font-semibold text-[#6E261A] dark:text-[#E0A92E] press-tactile"
              >
                <span>Simple Mode Active</span>
                <span className="underline underline-offset-2">Switch to Full →</span>
              </button>
            )}

            <div className="rounded-[22px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] p-1.5 space-y-0.5">
              {[
                { id: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard, core: true },
                { id: 'syllabus' as const, label: 'Subjects (12)', icon: BookOpen, core: true },
                { id: 'pyq' as const, label: 'PYQ Studio', icon: Code2, core: true },
                {
                  id: 'focus' as const,
                  label: 'Focus Studio',
                  icon: Timer,
                  core: true,
                  badge: focusStatus === 'running' ? 'Live' : undefined,
                },
                { id: 'mocks' as const, label: 'Mocks & Analytics', icon: LineChart, core: true },
                { id: 'cslab' as const, label: 'CS Lab (Visualizers)', icon: FlaskConical, core: false },
                {
                  id: 'revision' as const,
                  label: 'Rapid-Fire Revision',
                  icon: Zap,
                  core: false,
                  badge: dueRevisionCount > 0 ? `${dueRevisionCount} due` : undefined,
                },
                { id: 'tips' as const, label: 'Daily Traps & Tips', icon: Sparkles, core: false },
              ]
                .filter((item) => !simpleMode || item.core)
                .map((item) => {
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

        {/* 5. Compact Bottom Utility Bar + Floating Theme Popover + Full-Width Log Out / Sign In + Credit */}
        <div className="relative px-4 py-3 border-t border-[#E8E0D5] dark:border-[#2E2520] bg-white/90 dark:bg-[#1C1714]/95 shrink-0 space-y-2.5">
          {/* Sleek Single-Row Utility Bar: Light/Dark + Compact Palette Icon + Settings */}
          <div className="flex items-center gap-1.5" ref={palettePopoverRef}>
            {/* Segmented Light/Dark Pill */}
            <div className="flex-1 flex items-center p-1 rounded-full bg-[#EFE9DF] dark:bg-[#261E1A] border border-[#E8E0D5] dark:border-[#352A24]">
              <button
                type="button"
                data-testid="drawer-theme-light"
                onClick={() => onSetLightDark('light')}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium flex items-center justify-center gap-1 transition-all ${
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
                data-testid="drawer-theme-dark"
                onClick={() => onSetLightDark('dark')}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                  theme === 'dark'
                    ? 'bg-[#1C1714] text-[#F5F0E8] shadow-sm border border-[#352A24]'
                    : 'text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-[#E0A92E]" />
                Dark
              </button>
            </div>

            {/* Single Compact Palette / Theme Icon Pill + Floating 8-Dot Popover */}
            <div className="relative shrink-0">
              {palettePopoverOpen && (
                <div
                  role="menu"
                  aria-label="Choose color theme"
                  data-testid="drawer-theme-popover"
                  className="absolute bottom-full right-0 mb-2 z-20 w-[236px] rounded-[22px] squircle bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] shadow-warm-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[#61554D] dark:text-[#A99B8E]">
                      Color Theme
                    </span>
                    <span className="text-[10px] font-bold text-[#6E261A] dark:text-[#E0A92E]">
                      {activeAccentMeta.shortName}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {ACCENT_THEMES.map((t) => {
                      const isSelected = accentTheme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isSelected}
                          aria-label={`Switch color theme to ${t.name}`}
                          title={t.name}
                          data-testid={`drawer-accent-${t.id}`}
                          onClick={() => {
                            onSetAccentTheme(t.id);
                            setPalettePopoverOpen(false);
                            onThemeSelectedToast?.(t.name);
                          }}
                          className={`flex flex-col items-center gap-1 py-1.5 px-1 rounded-[14px] transition-all press-tactile ${
                            isSelected
                              ? 'bg-[#FAF8F4] dark:bg-[#261E1A] ring-1 ring-[#6E261A] dark:ring-[#E0A92E]'
                              : 'hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]'
                          }`}
                        >
                          <span
                            data-theme-swatch="true"
                            style={{
                              background: `linear-gradient(135deg, ${t.swatchPrimary} 50%, ${t.swatchSecondary} 50%)`,
                            }}
                            className={`w-6 h-6 rounded-full flex items-center justify-center shadow-xs ${
                              isSelected
                                ? 'ring-2 ring-offset-2 ring-[#C89216] dark:ring-offset-[#1C1714]'
                                : 'border border-black/10 dark:border-white/15'
                            }`}
                          >
                            {isSelected && (
                              <Check className="w-3 h-3 text-white drop-shadow" strokeWidth={3} />
                            )}
                          </span>
                          <span className="text-[9px] font-medium text-[#1C1613] dark:text-[#F5F0E8] leading-none truncate max-w-full">
                            {t.shortName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                data-testid="drawer-theme-palette-btn"
                aria-label={`Color theme: ${activeAccentMeta.name}. Open theme picker`}
                aria-expanded={palettePopoverOpen}
                aria-haspopup="menu"
                title={`Theme: ${activeAccentMeta.name}`}
                onClick={() => setPalettePopoverOpen((prev) => !prev)}
                className={`h-[34px] px-2.5 rounded-full border flex items-center gap-1.5 transition-colors press-tactile ${
                  palettePopoverOpen
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] border-[#6E261A] dark:border-[#9E3E2E] text-white'
                    : 'bg-[#F4EFE6] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216]'
                }`}
              >
                <Palette className="w-3.5 h-3.5 shrink-0" />
                <span
                  data-theme-swatch="true"
                  style={{
                    background: `linear-gradient(135deg, ${activeAccentMeta.swatchPrimary} 50%, ${activeAccentMeta.swatchSecondary} 50%)`,
                  }}
                  className="w-3.5 h-3.5 rounded-full border border-white/80 dark:border-black/30 shadow-xs shrink-0"
                />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleNav('settings')}
              className={`h-[34px] px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 press-tactile shrink-0 ${
                activeView === 'settings'
                  ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white'
                  : 'bg-[#F4EFE6] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border border-[#E8E0D5] dark:border-[#352A24]'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          </div>

          {/* Full-Width Bordered Log Out / Sign In Pill at the Very Bottom */}
          {user ? (
            <button
              type="button"
              data-testid="drawer-auth-action-btn"
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="w-full h-9 rounded-full border border-[#EBC7C3] dark:border-[#5E2823] bg-[#FAF8F4] dark:bg-[#241D19] hover:bg-[#FBEAE8] dark:hover:bg-[#3A1E1B] text-xs font-semibold text-[#B83227] dark:text-[#F08A80] flex items-center justify-center gap-1.5 transition-colors press-tactile"
            >
              <LogOut className="w-3.5 h-3.5" />
              Log Out
            </button>
          ) : (
            <button
              type="button"
              data-testid="drawer-auth-action-btn"
              onClick={() => {
                onSignIn();
                onClose();
              }}
              className="w-full h-9 rounded-full border border-[#6E261A]/35 dark:border-[#E0A92E]/40 bg-[#FAF8F4] dark:bg-[#241D19] hover:bg-[#6E261A] hover:text-white dark:hover:bg-[#9E3E2E] text-xs font-semibold text-[#6E261A] dark:text-[#E0A92E] flex items-center justify-center gap-1.5 transition-colors press-tactile"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}

          <p className="text-center text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
            Built by <span className="text-[#6E261A] dark:text-[#E0A92E] font-semibold">Nihal Pawar</span> · GATE CSE 2027
          </p>
        </div>
      </aside>
    </div>
  );
};
