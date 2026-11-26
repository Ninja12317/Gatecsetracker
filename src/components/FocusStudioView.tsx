import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Smartphone,
  ShieldAlert,
  BookmarkCheck,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { AmbientSoundMode, FocusSessionType, StudyLogEntry, SubjectId } from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import { useFocusTimer } from '../context/FocusTimerContext';
import {
  FOCUS_SESSION_TYPES,
  formatMinutesCompact,
  formatTimeWindow,
  getTodayStudyLogs,
} from '../utils/focusAnalytics';
import { toLocalIsoDate } from '../utils/gateMath';
import { FocusRadialClock } from './FocusRadialClock';
import { FocusAnalyticsSection } from './FocusAnalyticsSection';

interface FocusStudioViewProps {
  studyLogs: StudyLogEntry[];
  dailyGoalMinutes: number;
  theme: 'light' | 'dark';
  keyboardShortcutsEnabled: boolean;
  onUpdateStudyLog: (
    logId: string,
    patch: { resumeNote?: string; goal?: string; sessionType?: FocusSessionType }
  ) => void;
  onDeleteStudyLog: (logId: string) => void;
}

const SOUNDSCAPE_OPTIONS: Array<{ id: AmbientSoundMode; label: string; subtitle: string }> = [
  { id: 'off', label: 'Off', subtitle: 'Silent room' },
  { id: 'brown', label: 'Warm Brown', subtitle: 'Deep velvet rumble' },
  { id: 'rain', label: 'Soft Rain', subtitle: 'Filtered rainfall' },
  { id: 'pink', label: 'Library Pink', subtitle: 'Balanced study hum' },
];

export const FocusStudioView: React.FC<FocusStudioViewProps> = ({
  studyLogs,
  dailyGoalMinutes,
  theme,
  keyboardShortcutsEnabled,
  onUpdateStudyLog,
  onDeleteStudyLog,
}) => {
  const {
    presets,
    activePreset,
    presetId,
    subjectId,
    sessionType,
    goal,
    status,
    distractions,
    soundMode,
    volume,
    wakeLockEnabled,
    wakeLockActive,
    wakeLockSupported,
    chimeEnabled,
    zenFullscreen,
    pendingResumeLogId,
    lastResumeNote,
    lastLoggedBanner,
    selectPreset,
    setSubjectId,
    setSessionType,
    setGoal,
    toggleStartPause,
    reset,
    extendMinutes,
    addDistraction,
    resetDistractions,
    logCurrentSession,
    saveResumeNoteForLog,
    dismissResumePrompt,
    setSoundMode,
    setVolume,
    toggleWakeLock,
    toggleChime,
    setZenFullscreen,
    toggleZenFullscreen,
  } = useFocusTimer();

  const [resumeDraft, setResumeDraft] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editResumeText, setEditResumeText] = useState('');
  const [editGoalText, setEditGoalText] = useState('');

  const todayIso = toLocalIsoDate();
  const todayLogs = useMemo(() => getTodayStudyLogs(studyLogs, todayIso), [studyLogs, todayIso]);
  const todayTotalMinutes = useMemo(
    () => todayLogs.reduce((acc, l) => acc + l.minutes, 0),
    [todayLogs]
  );

  // Sync draft when a new resume prompt appears
  useEffect(() => {
    if (pendingResumeLogId) {
      setResumeDraft('');
    }
  }, [pendingResumeLogId]);

  // Keyboard shortcuts while on Focus Studio ('Z' for Zen Fullscreen, 'Esc' to exit Zen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && zenFullscreen) {
        e.preventDefault();
        setZenFullscreen(false);
        return;
      }
      if (!keyboardShortcutsEnabled) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        toggleZenFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboardShortcutsEnabled, zenFullscreen, setZenFullscreen, toggleZenFullscreen]);

  const hygieneStatus =
    distractions === 0
      ? {
          label: 'Deep Flow',
          tone: 'bg-[#EEF6F0] dark:bg-[#1A2E22] text-[#2E5E3E] dark:text-[#7BB88F] border-[#CFE3D5] dark:border-[#2E503B]',
        }
      : distractions <= 2
      ? {
          label: 'Minor Drift',
          tone: 'bg-[#FDF6E3] dark:bg-[#332714] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A] dark:border-[#5C441B]',
        }
      : {
          label: 'High Friction · Reset',
          tone: 'bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80] border-[#EBC7C3] dark:border-[#5E2823]',
        };

  const handleSavePendingResume = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingResumeLogId) return;
    saveResumeNoteForLog(pendingResumeLogId, resumeDraft);
    setResumeDraft('');
  };

  const startEditingLog = (log: StudyLogEntry) => {
    setEditingLogId(log.id);
    setEditResumeText(log.resumeNote ?? '');
    setEditGoalText(log.goal ?? '');
  };

  const handleSaveInlineEdit = (logId: string) => {
    onUpdateStudyLog(logId, {
      resumeNote: editResumeText,
      goal: editGoalText,
    });
    setEditingLogId(null);
  };

  const activeSubject = SUBJECT_MAP[subjectId];

  return (
    <div className="space-y-8" data-testid="focus-studio-view">
      {/* Compact Editorial Page Header */}
      <div className="flex items-start sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[11px] font-semibold text-[#8B6209] dark:text-[#E0A92E]">
            <Sparkles className="h-3 w-3" />
            Deep-Work Sanctuary · Persistent Cross-Tab Timer
          </span>
          <h1 className="sm:mt-2 font-display text-xl sm:text-[30px] font-bold tracking-[-0.03em] text-[#1C1613] dark:text-[#F5F0E8] truncate">
            Focus Studio
          </h1>
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E] max-w-2xl">
            Lock a single GATE CSE target, isolate distractions, and log every deep-work block straight to your 70-day consistency radar.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleZenFullscreen}
          data-testid="focus-zen-toggle-btn"
          className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] hover:border-[#C89216] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] shadow-xs press-tactile"
        >
          <Maximize2 className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
          <span className="hidden sm:inline">Zen Fullscreen</span>
          <span className="sm:hidden">Zen</span>
          <kbd className="hidden sm:inline font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#261E1A] text-[#61554D] dark:text-[#A99B8E]">
            Z
          </kbd>
        </button>
      </div>

      {/* PRIMARY 2-COLUMN BENTO WORKSPACE */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (7 cols): Matte Roasted Cocoa Deep-Work Timer Card */}
        <div className="lg:col-span-7 rounded-[28px] squircle bg-[#241914] dark:bg-[#171311] text-[#FAF8F4] border border-[#3B2B23] dark:border-[#2E2520] p-4 sm:p-6 shadow-warm-lg space-y-6">
          {/* Sculpted 7-Mode Pill Selector (Single-row horizontal rail on mobile) */}
          <div
            role="tablist"
            aria-label="Focus timer duration presets"
            className="flex flex-nowrap md:justify-center items-center gap-1.5 overflow-x-auto no-scrollbar p-1.5 rounded-full bg-[#19110E] dark:bg-[#110D0B] border border-white/10"
          >
            {presets.map((preset) => {
              const selected = preset.id === presetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={(e) => {
                    selectPreset(preset.id);
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      inline: 'center',
                      block: 'nearest',
                    });
                  }}
                  title={preset.title}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-mono font-semibold transition-colors press-tactile ${
                    selected
                      ? 'bg-[#C89216] text-[#1C1613] shadow-xs'
                      : 'text-[#C7B6A5] hover:text-[#FAF8F4] hover:bg-white/5'
                  }`}
                >
                  {preset.shortLabel}
                </button>
              );
            })}
          </div>

          {/* Isolated 60fps SVG Radial Clock */}
          <div className="py-1">
            <FocusRadialClock size="normal" />
          </div>

          {/* Tactile Primary Controls Row */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={toggleStartPause}
              data-testid="focus-start-pause-btn"
              className={`inline-flex items-center justify-center gap-2 h-11 px-7 rounded-full text-sm font-bold shadow-warm press-tactile min-w-[160px] ${
                status === 'running'
                  ? 'bg-[#6E261A] hover:bg-[#842E20] text-[#FAF8F4] border border-[#C89216]/50'
                  : 'bg-[#C89216] hover:bg-[#DBA11E] text-[#1C1613]'
              }`}
            >
              {status === 'running' ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause Focus
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  {status === 'paused' ? 'Resume Focus' : 'Start Focus'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={reset}
              aria-label="Reset focus timer"
              title="Reset timer"
              className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 text-[#E5D8C8] press-tactile"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            {activePreset.kind !== 'stopwatch' && (
              <button
                type="button"
                onClick={() => extendMinutes(5)}
                data-testid="focus-extend-btn"
                aria-label="Extend timer by 5 minutes"
                className="inline-flex items-center gap-1 h-11 px-4 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 text-xs font-mono font-semibold text-[#F3DCA0] press-tactile"
              >
                <Plus className="h-3.5 w-3.5" />
                5m
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                logCurrentSession();
              }}
              data-testid="focus-log-session-btn"
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-[#3A2820] hover:bg-[#4B342A] border border-[#C89216]/35 text-xs font-semibold text-[#F3DCA0] press-tactile"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[#E0A92E]" />
              Log Session
            </button>
          </div>

          {lastLoggedBanner && (
            <div
              role="status"
              data-testid="focus-logged-banner"
              className="rounded-full bg-[#2E5E3E]/30 border border-[#7BB88F]/40 px-4 py-2 text-center text-xs font-medium text-[#BEE5CA]"
            >
              {lastLoggedBanner}
            </div>
          )}

          {/* Concentric Pre-Session Target Lock Inner Card */}
          <div className="rounded-[20px] squircle bg-[#1A120F] dark:bg-[#120E0C] border border-white/10 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C7B6A5]">
                Pre-Session Target Lock
              </span>
              <span className="font-mono text-[11px] text-[#E0A92E]">
                {activeSubject?.code} · {activeSubject?.weightage} marks
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="focus-subject-select"
                  className="block text-[11px] font-medium text-[#B8A695] mb-1.5"
                >
                  GATE CSE Subject
                </label>
                <select
                  id="focus-subject-select"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value as SubjectId)}
                  className="w-full h-10 rounded-[14px] bg-[#281D18] border border-white/12 px-3 text-xs font-medium text-[#FAF8F4] focus:outline-none focus:border-[#C89216]"
                >
                  {GATE_2027_SYLLABUS.map((subj) => (
                    <option key={subj.id} value={subj.id} className="bg-[#241914] text-[#FAF8F4]">
                      {subj.code} — {subj.name} ({subj.weightage}m)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-medium text-[#B8A695] mb-1.5">
                  Session Type
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {FOCUS_SESSION_TYPES.map((type) => {
                    const active = sessionType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSessionType(type)}
                        className={`h-9 px-2.5 rounded-full text-[11px] font-semibold transition-colors press-tactile truncate ${
                          active
                            ? 'bg-[#6E261A] text-[#FAF8F4] border border-[#C89216]/50'
                            : 'bg-[#281D18] text-[#C7B6A5] border border-white/8 hover:text-[#FAF8F4]'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="focus-block-goal"
                className="block text-[11px] font-medium text-[#B8A695] mb-1.5"
              >
                One Goal for This Block
              </label>
              <input
                id="focus-block-goal"
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                maxLength={200}
                placeholder="e.g., Solve 12 Banker's Algorithm & Deadlock PYQs (2015–2024)"
                className="w-full h-10 rounded-[14px] bg-[#281D18] border border-white/12 px-3.5 text-xs text-[#FAF8F4] placeholder:text-[#8A7768] focus:outline-none focus:border-[#C89216]"
              />
            </div>
          </div>

          {/* Subtle Pinned Last Resume Point Strip */}
          {lastResumeNote && (
            <div
              data-testid="pinned-resume-point"
              className="rounded-[18px] bg-[#2F2118] border border-[#C89216]/35 px-4 py-3 flex items-start gap-2.5"
            >
              <BookmarkCheck className="h-4 w-4 text-[#E0A92E] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#E0A92E]">
                  Pinned Next Resume Point
                </div>
                <p className="mt-0.5 text-xs text-[#FAF8F4] leading-relaxed break-words">
                  {lastResumeNote}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 cols): Soundscapes + Focus Hygiene + Today's Timeline */}
        <div className="lg:col-span-5 space-y-5">
          {/* Card 1: Zero-Asset Web Audio Focus Soundscapes & Chimes */}
          <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] flex items-center gap-2">
                  {soundMode === 'off' ? (
                    <VolumeX className="h-4 w-4 text-[#8C7E75]" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-[#C89216] dark:text-[#E0A92E]" />
                  )}
                  Focus Soundscape &amp; Hardware
                </h2>
                <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                  Pure Web Audio synthesis · zero external streams or bandwidth
                </p>
              </div>
              {soundMode !== 'off' && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#332714] border border-[#EED89A] dark:border-[#5C441B] text-[10px] font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                  Playing
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {SOUNDSCAPE_OPTIONS.map((opt) => {
                const active = soundMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSoundMode(opt.id)}
                    aria-pressed={active}
                    className={`rounded-[16px] px-3 py-2.5 text-left border transition-colors press-tactile ${
                      active
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] border-[#6E261A] dark:border-[#B54A38]'
                        : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#2E2520] hover:border-[#C89216]'
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        active ? 'text-[#F3DCA0]' : 'text-[#61554D] dark:text-[#A99B8E]'
                      }`}
                    >
                      {opt.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Volume Slider (Zero Blue: accent-[#C89216]) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <label
                  htmlFor="focus-sound-volume"
                  className="font-medium text-[#61554D] dark:text-[#A99B8E]"
                >
                  Ambient Volume
                </label>
                <span className="font-mono font-semibold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <input
                id="focus-sound-volume"
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                className="w-full h-2 rounded-full cursor-pointer accent-[#C89216]"
              />
            </div>

            {/* Chime & Wake Lock Toggles */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#EFE9DF] dark:border-[#2E2520]">
              <button
                type="button"
                onClick={toggleChime}
                aria-pressed={chimeEnabled}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-[14px] border text-xs font-medium press-tactile ${
                  chimeEnabled
                    ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#EED89A] dark:border-[#5C441B] text-[#6E261A] dark:text-[#E0A92E]'
                    : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {chimeEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  Bell Chime
                </span>
                <span className="font-mono text-[10px] font-bold">
                  {chimeEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={toggleWakeLock}
                disabled={!wakeLockSupported}
                aria-pressed={wakeLockEnabled}
                title={
                  wakeLockSupported
                    ? 'Prevents screen sleep during active 50m–180m sessions'
                    : 'Screen Wake Lock is not supported in this browser'
                }
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-[14px] border text-xs font-medium press-tactile disabled:opacity-50 ${
                  wakeLockEnabled
                    ? 'bg-[#EEF6F0] dark:bg-[#1A2E22] border-[#CFE3D5] dark:border-[#2E503B] text-[#2E5E3E] dark:text-[#7BB88F]'
                    : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Smartphone className="h-3.5 w-3.5" />
                  Wake Lock
                </span>
                <span className="font-mono text-[10px] font-bold">
                  {!wakeLockSupported
                    ? 'N/A'
                    : wakeLockActive
                    ? 'LIVE'
                    : wakeLockEnabled
                    ? 'ON'
                    : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* Card 2: Focus Hygiene (Distraction Counter + Resume-Point Capture) */}
          <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
                  Focus Hygiene &amp; Resume Point
                </h2>
                <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                  Log phone/tab urges neutrally to protect deep flow.
                </p>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${hygieneStatus.tone}`}
              >
                {hygieneStatus.label}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-4 py-3">
              <div>
                <div className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                  Current Block Distractions
                </div>
                <div
                  data-testid="distraction-counter-value"
                  className="font-mono text-xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {distractions}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {distractions > 0 && (
                  <button
                    type="button"
                    onClick={resetDistractions}
                    aria-label="Reset distraction counter"
                    className="h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] text-xs font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] press-tactile"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={addDistraction}
                  data-testid="add-distraction-btn"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                >
                  <Plus className="h-3.5 w-3.5" />1 Distraction
                </button>
              </div>
            </div>

            {/* Inline Post-Session "Next Resume Point" Capture Prompt */}
            {pendingResumeLogId && (
              <form
                onSubmit={handleSavePendingResume}
                data-testid="resume-point-prompt"
                className="rounded-[20px] border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="pending-resume-note-input"
                    className="text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]"
                  >
                    Where should your next block resume?
                  </label>
                  <button
                    type="button"
                    onClick={dismissResumePrompt}
                    aria-label="Dismiss resume note prompt"
                    className="text-[#8B6209] dark:text-[#D9B664] hover:text-[#1C1613] dark:hover:text-[#FAF8F4]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  id="pending-resume-note-input"
                  type="text"
                  value={resumeDraft}
                  onChange={(e) => setResumeDraft(e.target.value)}
                  maxLength={300}
                  placeholder="e.g., Pick up at GateR Q#142 (Belady's Anomaly proof)"
                  className="w-full h-9 rounded-[12px] bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#3A2E28] px-3 text-xs text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#C89216]"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={dismissResumePrompt}
                    className="h-8 px-3 rounded-full text-xs font-medium text-[#61554D] dark:text-[#A99B8E]"
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    data-testid="save-resume-note-btn"
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save Resume Point
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Card 3: Today's Session Timeline (Editable & Deletable, Firestore Synced) */}
          <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
                  Today&apos;s Session Timeline
                </h2>
                <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                  {todayLogs.length} {todayLogs.length === 1 ? 'block' : 'blocks'} ·{' '}
                  <span className="font-mono font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                    {formatMinutesCompact(todayTotalMinutes)}
                  </span>{' '}
                  logged today
                </p>
              </div>
            </div>

            {todayLogs.length === 0 ? (
              <div
                data-testid="today-timeline-empty"
                className="rounded-[20px] border border-dashed border-[#DFD5C7] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#16110E] p-5 text-center space-y-1.5"
              >
                <p className="text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                  No deep-work blocks logged yet today
                </p>
                <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                  Hit <span className="font-semibold">Start Focus</span> or{' '}
                  <span className="font-semibold">Log Session</span> to build today&apos;s execution timeline.
                </p>
              </div>
            ) : (
              <div
                data-testid="today-timeline-list"
                className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1"
              >
                {todayLogs.map((log) => {
                  const subj = SUBJECT_MAP[log.subjectId];
                  const isEditing = editingLogId === log.id;
                  const windowStr = formatTimeWindow(log.startedAt, log.completedAt, log.minutes);

                  return (
                    <div
                      key={log.id}
                      data-testid="timeline-session-item"
                      className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-3.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="px-2 py-0.5 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white font-mono text-[10px] font-bold">
                            {subj?.code ?? log.subjectId.toUpperCase()}
                          </span>
                          <span className="font-mono text-xs font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                            {formatMinutesCompact(log.minutes)}
                          </span>
                          {log.sessionType && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] text-[10px] font-medium text-[#61554D] dark:text-[#A99B8E]">
                              {log.sessionType}
                            </span>
                          )}
                          {typeof log.distractions === 'number' && log.distractions > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#332714] text-[10px] font-mono font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                              {log.distractions} drift
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono text-[10px] tabular-nums text-[#8C7E75] dark:text-[#A99B8E] mr-1">
                            {windowStr}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditingLog(log)}
                            aria-label={`Edit notes for ${subj?.code ?? log.subjectId} ${log.minutes}m session`}
                            title="Edit goal or resume note"
                            className="p-1 rounded-full text-[#61554D] dark:text-[#A99B8E] hover:text-[#6E261A] dark:hover:text-[#E0A92E] hover:bg-[#EFE9DF] dark:hover:bg-[#312722]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStudyLog(log.id)}
                            aria-label={`Delete ${subj?.code ?? log.subjectId} ${log.minutes}m session`}
                            title="Delete session"
                            className="p-1 rounded-full text-[#61554D] dark:text-[#A99B8E] hover:text-[#B83227] dark:hover:text-[#F08A80] hover:bg-[#FBEAE8] dark:hover:bg-[#3A1E1B]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <input
                            type="text"
                            value={editGoalText}
                            onChange={(e) => setEditGoalText(e.target.value)}
                            maxLength={200}
                            placeholder="Session goal..."
                            aria-label="Edit session goal"
                            className="w-full h-8 rounded-[10px] bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] px-2.5 text-xs text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#C89216]"
                          />
                          <input
                            type="text"
                            value={editResumeText}
                            onChange={(e) => setEditResumeText(e.target.value)}
                            maxLength={300}
                            placeholder="Next resume point note..."
                            aria-label="Edit resume note"
                            className="w-full h-8 rounded-[10px] bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] px-2.5 text-xs text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#C89216]"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingLogId(null)}
                              className="h-7 px-2.5 rounded-full text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineEdit(log.id)}
                              className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white text-[11px] font-semibold"
                            >
                              <Check className="h-3 w-3" />
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {log.goal && (
                            <p className="text-xs text-[#1C1613] dark:text-[#F5F0E8] leading-snug">
                              {log.goal}
                            </p>
                          )}
                          {log.resumeNote && (
                            <p className="text-[11px] text-[#8B6209] dark:text-[#E0A92E] bg-[#FDF6E3] dark:bg-[#2C2215] rounded-[10px] px-2.5 py-1.5 leading-snug">
                              <span className="font-semibold">Resume:</span> {log.resumeNote}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FULL-WIDTH 70-DAY CONSISTENCY HEATMAP & HIGH-ROI ANALYTICS */}
      <FocusAnalyticsSection
        studyLogs={studyLogs}
        dailyGoalMinutes={dailyGoalMinutes}
        theme={theme}
      />

      {/* ZEN FULLSCREEN SANCTUARY OVERLAY ('Z' shortcut or button) */}
      {zenFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Zen Fullscreen Deep-Work Mode"
          data-testid="focus-zen-overlay"
          className="fixed inset-0 z-50 bg-[#1B130F] text-[#FAF8F4] flex flex-col items-center justify-between p-6 sm:p-10"
        >
          {/* Top Bar */}
          <div className="w-full max-w-3xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#C7B6A5]">
              <span className="px-2.5 py-1 rounded-full bg-[#2E2019] border border-[#C89216]/35 font-mono font-bold text-[#E0A92E]">
                {activeSubject?.code}
              </span>
              <span className="font-medium text-[#FAF8F4] truncate max-w-[260px] sm:max-w-[420px]">
                {goal.trim() || `${activeSubject?.name ?? 'GATE CSE'} · ${sessionType}`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setZenFullscreen(false)}
              data-testid="exit-zen-btn"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-[#FAF8F4] press-tactile"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit Zen (Esc)
            </button>
          </div>

          {/* Center Large Radial Clock + Primary Controls */}
          <div className="flex flex-col items-center gap-7">
            <FocusRadialClock size="zen" />

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleStartPause}
                className={`inline-flex items-center justify-center gap-2 h-12 px-8 rounded-full text-sm font-bold press-tactile min-w-[170px] ${
                  status === 'running'
                    ? 'bg-[#6E261A] hover:bg-[#842E20] text-[#FAF8F4] border border-[#C89216]/50'
                    : 'bg-[#C89216] hover:bg-[#DBA11E] text-[#1C1613]'
                }`}
              >
                {status === 'running' ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {status === 'paused' ? 'Resume' : 'Start Focus'}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={addDistraction}
                className="inline-flex items-center gap-1.5 h-12 px-5 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-[#F3DCA0] press-tactile"
              >
                <Plus className="h-3.5 w-3.5" />1 Distraction ({distractions})
              </button>
            </div>
          </div>

          {/* Bottom Compact Ambient Soundscape Selector */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {SOUNDSCAPE_OPTIONS.map((opt) => {
              const active = soundMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSoundMode(opt.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors press-tactile ${
                    active
                      ? 'bg-[#C89216] text-[#1C1613]'
                      : 'bg-white/8 text-[#C7B6A5] hover:text-[#FAF8F4]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
