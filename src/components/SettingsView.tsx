import React, { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Check,
  AlertCircle,
  CalendarClock,
  Cloud,
  LogIn,
  LogOut,
  Monitor,
  Sliders,
  Database,
  RefreshCw,
  FileDown,
  Volume2,
  Sun,
  Moon,
  Laptop,
  Smartphone,
  Wifi,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import type {
  AuthUserSummary,
  ContentWidthMode,
  ExamSettings,
  GateRSyncStatus,
  SyncStatus,
  ThemeMode,
  UiScaleMode,
  WarRoomState,
} from '../types';
import { validateBackupJson } from '../utils/gateMath';
import {
  GATE_2027_EXAM_DATES,
  formatBytesCompact,
  playTimerCompletionChime,
} from '../utils/examPolish';
import { getGateRCacheSizeBytes } from '../utils/pyqIndexedDb';

interface SettingsViewProps {
  state: WarRoomState;
  user: AuthUserSummary | null;
  syncStatus: SyncStatus;
  authError: string;
  gaterCount: number;
  gaterSyncStatus: GateRSyncStatus;
  onSyncGateR: (forceRefresh?: boolean) => Promise<{ ok: boolean; count: number; message: string }>;
  onSignInGoogle: () => void;
  onSignOut: () => void;
  onSetThemeMode: (mode: ThemeMode) => void;
  onUpdateSettings: (patch: Partial<ExamSettings>) => void;
  onImportBackup: (imported: Partial<WarRoomState>) => void;
  onResetAll: () => void;
  onExportStudyReportPdf: () => void;
  pwaInstalled: boolean;
  pwaCanPrompt: boolean;
  isOnline: boolean;
  swActive: boolean;
  onTriggerPwaInstall: () => void;
  onOpenPwaGuide: () => void;
}

type SettingsTab = 'exam' | 'display' | 'study' | 'data' | 'app';

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  user,
  syncStatus,
  authError,
  gaterCount,
  gaterSyncStatus,
  onSyncGateR,
  onSignInGoogle,
  onSignOut,
  onSetThemeMode,
  onUpdateSettings,
  onImportBackup,
  onResetAll,
  onExportStudyReportPdf,
  pwaInstalled,
  pwaCanPrompt,
  isOnline,
  swActive,
  onTriggerPwaInstall,
  onOpenPwaGuide,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('exam');
  const currentDatePart = state.settings.targetDateIso.slice(0, 10);
  const [dateInput, setDateInput] = useState(currentDatePart);
  const [shiftInput, setShiftInput] = useState<ExamSettings['shift']>(state.settings.shift);
  const [dailyGoalInput, setDailyGoalInput] = useState(String(state.settings.dailyGoalMinutes));
  const [workMins, setWorkMins] = useState(String(state.settings.pomodoroWorkMinutes ?? 50));
  const [shortBreakMins, setShortBreakMins] = useState(
    String(state.settings.pomodoroShortBreakMinutes ?? 10)
  );
  const [longBreakMins, setLongBreakMins] = useState(
    String(state.settings.pomodoroLongBreakMinutes ?? 25)
  );
  const [savedNotice, setSavedNotice] = useState('');
  const [backupStatus, setBackupStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<{ bytes: number; count: number; syncedAt: string | null }>({
    bytes: 0,
    count: gaterCount,
    syncedAt: null,
  });
  const [resyncFeedback, setResyncFeedback] = useState('');

  useEffect(() => {
    let active = true;
    void getGateRCacheSizeBytes().then((info) => {
      if (active) setCacheInfo(info);
    });
    return () => {
      active = false;
    };
  }, [gaterCount, gaterSyncStatus]);

  const showSaved = (msg: string) => {
    setSavedNotice(msg);
    window.setTimeout(() => setSavedNotice(''), 2600);
  };

  const applyDateAndShift = (isoDate: string, shift: ExamSettings['shift']) => {
    setDateInput(isoDate);
    setShiftInput(shift);
    const timePart = shift.startsWith('Forenoon') ? '09:30:00+05:30' : '14:30:00+05:30';
    onUpdateSettings({
      targetDateIso: `${isoDate}T${timePart}`,
      shift,
    });
    showSaved(`Target calibrated to ${isoDate} · ${shift}.`);
  };

  const handleSaveExamConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const timePart = shiftInput.startsWith('Forenoon') ? '09:30:00+05:30' : '14:30:00+05:30';
    onUpdateSettings({
      targetDateIso: `${dateInput}T${timePart}`,
      shift: shiftInput,
    });
    showSaved('GATE 2027 countdown target updated.');
  };

  const handleSaveStudyConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const goalNum = Math.max(30, Math.min(720, Number(dailyGoalInput) || 240));
    const w = Math.max(5, Math.min(180, Number(workMins) || 50));
    const sb = Math.max(1, Math.min(60, Number(shortBreakMins) || 10));
    const lb = Math.max(5, Math.min(90, Number(longBreakMins) || 25));
    onUpdateSettings({
      dailyGoalMinutes: goalNum,
      pomodoroWorkMinutes: w,
      pomodoroShortBreakMinutes: sb,
      pomodoroLongBreakMinutes: lb,
    });
    showSaved('Study targets & Pomodoro timer durations saved.');
  };

  const handleExportJson = () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gate27-war-room-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupStatus({ type: 'ok', msg: 'Exported full workspace backup (.json).' });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const res = validateBackupJson(reader.result);
      if (!res.valid || !res.state) {
        setBackupStatus({ type: 'err', msg: res.error ?? 'Invalid backup JSON file.' });
        return;
      }
      onImportBackup(res.state);
      setBackupStatus({
        type: 'ok',
        msg: 'Backup restored successfully. All syllabus, logs, sketches, and mocks synced.',
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResyncGateR = async () => {
    setResyncFeedback('Syncing khushit-shah/gater-frontend from GitHub...');
    const res = await onSyncGateR(true);
    setResyncFeedback(res.message);
    const info = await getGateRCacheSizeBytes();
    setCacheInfo(info);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'exam', label: 'Exam & Countdown', icon: CalendarClock },
    { id: 'display', label: 'Display & Scaling', icon: Monitor },
    { id: 'study', label: 'Study & Exam', icon: Sliders },
    { id: 'data', label: 'Data & Cache', icon: Database },
    { id: 'app', label: 'App & Offline', icon: Smartphone },
  ];

  const currentThemeMode: ThemeMode = state.settings.themeMode ?? state.theme;
  const currentScale: UiScaleMode = state.settings.uiScale ?? 'default';
  const currentWidth: ContentWidthMode = state.settings.contentWidth ?? 'focused';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header + Tabbed Segmented Control */}
      <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="fluid-heading font-display font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Settings Control Center
            </h1>
            <p className="text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E] mt-0.5">
              Personalize your GATE 2027 countdown, typography scale, Pomodoro blocks, and offline cache. Synced automatically to Firestore.
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EBF5EE] dark:bg-[#152B1D] text-xs font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
              <Check className="h-3.5 w-3.5" />
              {savedNotice}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 p-1.5 rounded-[22px] bg-[#EFE9DF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 px-3.5 rounded-[16px] text-xs font-semibold transition-all press-tactile ${
                  active
                    ? 'bg-white dark:bg-[#1C1714] text-[#6E261A] dark:text-[#E0A92E] shadow-xs'
                    : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* TAB 1: Exam & Countdown + Cloud Sync */}
      {activeTab === 'exam' && (
        <div className="space-y-5">
          <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-5">
            <div className="flex items-center gap-2.5">
              <CalendarClock className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Official GATE 2027 Exam Dates &amp; Shift
              </h2>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]">
                Quick Select Official GATE 2027 Exam Window
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {GATE_2027_EXAM_DATES.map((d) => {
                  const selected = dateInput === d.date;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => applyDateAndShift(d.date, shiftInput)}
                      className={`py-2.5 px-3.5 rounded-[16px] border text-xs font-semibold press-tactile ${
                        selected
                          ? 'bg-[#6E261A] dark:bg-[#9E3E2E] border-[#6E261A] dark:border-[#9E3E2E] text-white'
                          : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216]'
                      }`}
                    >
                      {d.label}, 2027
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSaveExamConfig} className="space-y-4 pt-3 border-t border-[#EFE9DF] dark:border-[#2E2520]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="exam-target-date"
                    className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5"
                  >
                    Custom Target Date
                  </label>
                  <input
                    id="exam-target-date"
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5">
                    Admit Card Shift (IST)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Forenoon (09:30 IST)', 'Afternoon (14:30 IST)'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => applyDateAndShift(dateInput, s)}
                        className={`h-10 rounded-full border text-xs font-semibold press-tactile ${
                          shiftInput === s
                            ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#C89216] dark:border-[#E0A92E] text-[#6E261A] dark:text-[#E0A92E]'
                            : 'bg-[#FAF8F4] dark:bg-[#130F0D] border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                        }`}
                      >
                        {s.startsWith('Forenoon') ? 'Forenoon 9:30 AM' : 'Afternoon 2:30 PM'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                >
                  Save Exam Target
                </button>
              </div>
            </form>
          </section>

          {/* Cloud Sync Section */}
          <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Cloud className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
                <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Firebase Firestore Cloud Sync
                </h2>
              </div>
              <span
                className={`px-3 py-1 rounded-full font-mono text-xs font-semibold ${
                  syncStatus === 'synced'
                    ? 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                    : syncStatus === 'error'
                    ? 'bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                    : 'bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                {syncStatus === 'synced'
                  ? 'Live Synced'
                  : syncStatus === 'connecting'
                  ? 'Connecting...'
                  : syncStatus === 'error'
                  ? 'Sync Error'
                  : 'Local Mode'}
              </span>
            </div>

            {user ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] px-4 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                    {user.displayName}
                  </div>
                  <div className="font-mono text-xs text-[#61554D] dark:text-[#A99B8E] truncate">
                    {user.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#EBC7C3] dark:border-[#5E2823] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-xs font-semibold text-[#B83227] dark:text-[#F08A80] press-tactile"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSignInGoogle}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in with Google to Sync Across Devices
              </button>
            )}
            {authError && (
              <p className="text-xs font-mono text-[#B83227] dark:text-[#F08A80]">{authError}</p>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: Display & Web Scaling */}
      {activeTab === 'display' && (
        <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-6">
          {/* UI Scale Control */}
          <div className="space-y-2.5">
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                UI Scale Control
              </h2>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                Adjust global typography and spacing density cleanly for laptops, tablets, or external monitors.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'compact' as const, label: 'Compact', pct: '90%' },
                  { id: 'default' as const, label: 'Default', pct: '100%' },
                  { id: 'comfortable' as const, label: 'Comfortable', pct: '110%' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onUpdateSettings({ uiScale: opt.id });
                    showSaved(`UI scale set to ${opt.label} (${opt.pct}).`);
                  }}
                  className={`rounded-[20px] p-4 border text-left press-tactile ${
                    currentScale === opt.id
                      ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#C89216] dark:border-[#E0A92E]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520]'
                  }`}
                >
                  <p className="font-mono text-sm font-bold text-[#6E261A] dark:text-[#E0A92E]">
                    {opt.pct}
                  </p>
                  <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] mt-0.5">
                    {opt.label}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Content Width Mode */}
          <div className="space-y-2.5 pt-4 border-t border-[#EFE9DF] dark:border-[#2E2520]">
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Content Width Mode
              </h2>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                Choose between calm editorial focus or wide split-screen space for PYQ + Sketchpad sessions.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  {
                    id: 'focused' as const,
                    label: 'Focused Editorial (1280px)',
                    desc: 'Balanced scholarly layout with optimal reading measure.',
                  },
                  {
                    id: 'wide' as const,
                    label: 'Wide Workspace (1536px)',
                    desc: 'Expands grids and charts cleanly on 1440p / 4K monitors.',
                  },
                ] as const
              ).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    onUpdateSettings({ contentWidth: w.id });
                    showSaved(`Workspace width set to ${w.label}.`);
                  }}
                  className={`rounded-[20px] p-4 border text-left press-tactile ${
                    currentWidth === w.id
                      ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#C89216] dark:border-[#E0A92E]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520]'
                  }`}
                >
                  <p className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">{w.label}</p>
                  <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] mt-1">{w.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Theme Mode */}
          <div className="space-y-2.5 pt-4 border-t border-[#EFE9DF] dark:border-[#2E2520]">
            <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Theme Mode
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'light' as const, label: 'Light (IITM Ivory)', icon: Sun },
                  { id: 'dark' as const, label: 'Dark (Warm Espresso)', icon: Moon },
                  { id: 'system' as const, label: 'System Auto', icon: Laptop },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSetThemeMode(m.id);
                      showSaved(`Theme mode set to ${m.label}.`);
                    }}
                    className={`rounded-[20px] p-3.5 border flex flex-col items-center justify-center gap-1.5 text-center press-tactile ${
                      currentThemeMode === m.id
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] border-[#6E261A] dark:border-[#9E3E2E] text-white'
                        : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Study & Exam Behavior */}
      {activeTab === 'study' && (
        <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-6">
          <form onSubmit={handleSaveStudyConfig} className="space-y-5">
            <div className="space-y-2.5">
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Daily Study Hour Target
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: '4h (240m)', mins: 240 },
                  { label: '6h (360m)', mins: 360 },
                  { label: '8h (480m)', mins: 480 },
                ].map((p) => (
                  <button
                    key={p.mins}
                    type="button"
                    onClick={() => {
                      setDailyGoalInput(String(p.mins));
                      onUpdateSettings({ dailyGoalMinutes: p.mins });
                      showSaved(`Daily target set to ${p.label}.`);
                    }}
                    className={`px-4 py-2 rounded-full border text-xs font-semibold press-tactile ${
                      Number(dailyGoalInput) === p.mins
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] border-[#6E261A] text-white'
                        : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <input
                  type="number"
                  min={30}
                  max={720}
                  value={dailyGoalInput}
                  onChange={(e) => setDailyGoalInput(e.target.value)}
                  aria-label="Custom daily study goal in minutes"
                  className="w-28 h-9 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-3.5 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
                <span className="text-xs text-[#61554D] dark:text-[#A99B8E]">min/day</span>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-[#EFE9DF] dark:border-[#2E2520]">
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Custom Pomodoro Durations &amp; Chime
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                    Deep Work (min)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={workMins}
                    onChange={(e) => setWorkMins(e.target.value)}
                    className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                    Short Break (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={shortBreakMins}
                    onChange={(e) => setShortBreakMins(e.target.value)}
                    className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                    Long Break (min)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={90}
                    value={longBreakMins}
                    onChange={(e) => setLongBreakMins(e.target.value)}
                    className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => playTimerCompletionChime()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-xs font-semibold text-[#8E620C] dark:text-[#E0A92E] press-tactile"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Test Web Audio Chime
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                >
                  Save Timer Targets
                </button>
              </div>
            </div>
          </form>

          {/* Exam Behavior Toggles */}
          <div className="space-y-2.5 pt-4 border-t border-[#EFE9DF] dark:border-[#2E2520]">
            <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Exam &amp; PYQ Studio Behavior
            </h2>
            <div className="space-y-2">
              {[
                {
                  key: 'timerChimeEnabled' as const,
                  label: 'Timer Completion Chime (Web Audio API)',
                  desc: 'Play a gentle harmonic bell when a Pomodoro focus block finishes.',
                  val: state.settings.timerChimeEnabled ?? true,
                },
                {
                  key: 'autoHideRemoved2027' as const,
                  label: 'Auto-Hide Removed 2027 Syllabus Topics',
                  desc: 'Filter out legacy out-of-syllabus GATE PYQs by default in PYQ Studio.',
                  val: state.settings.autoHideRemoved2027 ?? true,
                },
                {
                  key: 'autoAddWrongToMistakes' as const,
                  label: 'Auto-Add Wrong Answers to Mistake Bucket',
                  desc: 'Automatically capture incorrect PYQ attempts for spaced revision.',
                  val: state.settings.autoAddWrongToMistakes ?? true,
                },
                {
                  key: 'showLivePaceTimer' as const,
                  label: 'Show Live Per-Question Pace Timer',
                  desc: 'Display live seconds spent per question and highlight >150s (1M) / >270s (2M) time sinks.',
                  val: state.settings.showLivePaceTimer ?? true,
                },
                {
                  key: 'enableKeyboardShortcuts' as const,
                  label: 'Enable Keyboard Shortcuts',
                  desc: 'Allow C (Calculator), F (Zen Fullscreen), N/P/S/B (PYQ CBT), Space/1/2/3 (Revision), Cmd+K.',
                  val: state.settings.enableKeyboardShortcuts ?? true,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4 rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-4 py-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                      {item.label}
                    </p>
                    <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.val}
                    onClick={() => {
                      onUpdateSettings({ [item.key]: !item.val });
                      showSaved(`${item.label} ${!item.val ? 'enabled' : 'disabled'}.`);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                      item.val
                        ? 'bg-[#6E261A] dark:bg-[#E0A92E]'
                        : 'bg-[#D8CBB8] dark:bg-[#3A2E28]'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
                        item.val ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: Data, Cache & Backup */}
      {activeTab === 'data' && (
        <div className="space-y-5">
          {/* GateR IndexedDB Cache & Re-Sync */}
          <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  GateR GitHub PYQ Bank &amp; IndexedDB Cache
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                  Cached locally in browser IndexedDB (
                  <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24]">
                    gate27_pyq_cache
                  </code>
                  ) for &lt;100ms offline access with zero Firestore quota burn.
                </p>
              </div>
              <button
                type="button"
                disabled={gaterSyncStatus === 'syncing'}
                onClick={handleResyncGateR}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold disabled:opacity-60 press-tactile"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${gaterSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                Re-Sync GateR GitHub PYQs
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3.5">
                <p className="text-[10px] uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  Cached PYQs
                </p>
                <p className="font-mono text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8] tabular-nums">
                  {Math.max(gaterCount, cacheInfo.count).toLocaleString()}
                </p>
              </div>
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3.5">
                <p className="text-[10px] uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  IndexedDB Cache Size
                </p>
                <p className="font-mono text-lg font-bold text-[#6E261A] dark:text-[#E0A92E] tabular-nums">
                  {formatBytesCompact(cacheInfo.bytes)}
                </p>
              </div>
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3.5">
                <p className="text-[10px] uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                  Last Synced
                </p>
                <p className="font-mono text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] mt-1">
                  {cacheInfo.syncedAt
                    ? new Date(cacheInfo.syncedAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Auto-synced'}
                </p>
              </div>
            </div>

            {resyncFeedback && (
              <p className="text-xs font-medium text-[#2E5E3E] dark:text-[#7BB88F]">
                {resyncFeedback}
              </p>
            )}
          </section>

          {/* Export PDF Study Report + JSON Backup */}
          <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                70-Day Study Report (.PDF) &amp; JSON Backup
              </h2>
              <p className="text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E] mt-1">
                Export a crisp A4 vector PDF readiness report or take portable JSON snapshots of all syllabus progress, study logs, sketches, traps, and mocks.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onExportStudyReportPdf}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[#6E261A] dark:text-[#E0A92E] text-xs font-bold press-tactile"
              >
                <FileDown className="h-3.5 w-3.5" />
                Export 70-Day Study Report (.pdf)
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
              >
                <Download className="h-3.5 w-3.5" />
                Export Full Backup (.json)
              </button>

              <label className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#EFE9DF] dark:hover:bg-[#312722] cursor-pointer press-tactile">
                <Upload className="h-3.5 w-3.5" />
                Import Backup (.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="sr-only"
                />
              </label>
            </div>

            {backupStatus && (
              <div
                className={`flex items-center gap-2 rounded-[20px] border px-4 py-2.5 text-xs font-semibold ${
                  backupStatus.type === 'ok'
                    ? 'border-[#B9D6C2] dark:border-[#254A33] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                    : 'border-[#EBC7C3] dark:border-[#5E2823] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                }`}
              >
                {backupStatus.type === 'ok' ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{backupStatus.msg}</span>
              </div>
            )}
          </section>

          {/* Danger Zone: Safe Reset Confirmation */}
          <section className="rounded-[28px] squircle border border-[#EBC7C3] dark:border-[#5E2823] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Reset Workspace Progress
              </h2>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                Clears syllabus progress, study logs, mistakes, sketches, mocks, and SRS review cards. Keeps cached GateR PYQs intact.
              </p>
            </div>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-[#EBC7C3] dark:border-[#5E2823] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80] text-xs font-semibold press-tactile"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Progress
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="h-9 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResetAll();
                    setConfirmReset(false);
                    setBackupStatus({ type: 'ok', msg: 'Workspace restored to clean baseline.' });
                  }}
                  className="h-9 px-4 rounded-full bg-[#B83227] text-white text-xs font-semibold hover:bg-[#99271D] press-tactile"
                >
                  Confirm Reset
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: App & Offline (PWA Installation, Offline Cache & Home-Screen Shortcuts) */}
      {activeTab === 'app' && (
        <div className="space-y-5" data-testid="settings-app-offline-panel">
          <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src="/icon.svg"
                  alt="GATE CSE '27 App Icon"
                  className="h-16 w-16 rounded-[18px] shadow-md border border-[#C89216]/45 shrink-0"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                      Install GATE &apos;27 App (PWA)
                    </h2>
                    {pwaInstalled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF5EE] dark:bg-[#152B1D] border border-[#B9D6C2] dark:border-[#254A33] px-2.5 py-0.5 text-[11px] font-bold text-[#2E5E3E] dark:text-[#7BB88F]">
                        <CheckCircle2 className="w-3 h-3" />
                        Installed as App
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-2.5 py-0.5 text-[11px] font-bold text-[#8E620C] dark:text-[#E0A92E]">
                        Android · iOS · Desktop
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-1">
                    Launch GATE &apos;27 full-screen without browser chrome, with offline-cached GateR PYQs, Focus Timer, and quick home-screen shortcuts.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!pwaInstalled && (
                  <button
                    type="button"
                    data-testid="settings-install-app-btn"
                    onClick={onTriggerPwaInstall}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold shadow-sm press-tactile"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {pwaCanPrompt ? "Install GATE '27 Now" : "Install GATE '27 App"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenPwaGuide}
                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:border-[#C89216] press-tactile"
                >
                  Install Guide
                </button>
              </div>
            </div>

            {/* Live Offline & PWA Readiness Telemetry */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#EFE9DF] dark:border-[#2E2520]">
              <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#61554D] dark:text-[#A99B8E]">
                  Network Status
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  {isOnline ? (
                    <>
                      <Wifi className="w-4 h-4 text-[#2E5E3E] dark:text-[#7BB88F]" />
                      <span>Online &amp; Syncing</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-[#C89216] dark:text-[#E0A92E]" />
                      <span>Offline Mode</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#61554D] dark:text-[#A99B8E]">
                  Offline Shell (Service Worker)
                </p>
                <p className="mt-1.5 text-sm font-bold text-[#6E261A] dark:text-[#E0A92E]">
                  {swActive ? 'Active & Caching' : 'Ready on Standalone URL'}
                </p>
              </div>

              <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#61554D] dark:text-[#A99B8E]">
                  Offline GateR PYQ Bank
                </p>
                <p className="mt-1.5 font-mono text-sm font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                  {Math.max(gaterCount, cacheInfo.count).toLocaleString()} PYQs ({formatBytesCompact(cacheInfo.bytes)})
                </p>
              </div>
            </div>

            {/* App Shortcuts Preview */}
            <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4 space-y-2.5">
              <p className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Home-Screen Long-Press Shortcuts Included
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Start Focus Timer', route: '/?tab=focus' },
                  { label: 'PYQ Studio', route: '/?tab=pyq' },
                  { label: 'Mock Logs', route: '/?tab=mocks' },
                ].map((sc) => (
                  <span
                    key={sc.route}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-white dark:bg-[#1C1714] px-3 py-1 text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#C89216]" />
                    {sc.label}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
