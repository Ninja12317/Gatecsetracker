import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AmbientSoundMode,
  ExamSettings,
  FocusPresetId,
  FocusSessionType,
  StudyLogEntry,
  SubjectId,
} from '../types';
import { SUBJECT_MAP } from '../data/syllabus';
import {
  buildFocusPresets,
  computeTimerClock,
  formatClock,
  type FocusPresetOption,
  type TimerClockSnapshot,
} from '../utils/focusAnalytics';
import { focusSoundEngine } from '../utils/focusAudio';

const FOCUS_STORAGE_KEY = 'gate27_focus_studio_v1';
const BASE_DOCUMENT_TITLE = "GATE '27 — IITM CSE Preparation War Room";

export interface FocusLogMeta {
  startedAt?: string;
  sessionType?: FocusSessionType;
  goal?: string;
  resumeNote?: string;
  distractions?: number;
  presetLabel?: string;
}

interface PersistedFocusState {
  presetId: FocusPresetId;
  subjectId: SubjectId;
  sessionType: FocusSessionType;
  goal: string;
  status: 'idle' | 'running' | 'paused';
  startedAtMs: number | null;
  sessionOriginIso: string | null;
  accumulatedSeconds: number;
  targetSeconds: number;
  distractions: number;
  volume: number;
  wakeLockEnabled: boolean;
  chimeEnabled: boolean;
  lastResumeNote: string;
}

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
}

export interface FocusTimerContextValue {
  presets: FocusPresetOption[];
  activePreset: FocusPresetOption;
  presetId: FocusPresetId;
  subjectId: SubjectId;
  sessionType: FocusSessionType;
  goal: string;
  status: 'idle' | 'running' | 'paused';
  clockSnapshot: TimerClockSnapshot;
  distractions: number;
  soundMode: AmbientSoundMode;
  volume: number;
  wakeLockEnabled: boolean;
  wakeLockActive: boolean;
  wakeLockSupported: boolean;
  chimeEnabled: boolean;
  zenFullscreen: boolean;
  pendingResumeLogId: string | null;
  lastResumeNote: string;
  lastLoggedBanner: string;
  selectPreset: (id: FocusPresetId) => void;
  setSubjectId: (id: SubjectId) => void;
  setSessionType: (t: FocusSessionType) => void;
  setGoal: (g: string) => void;
  start: () => void;
  pause: () => void;
  toggleStartPause: () => void;
  reset: () => void;
  extendMinutes: (deltaMinutes: number) => void;
  addDistraction: () => void;
  resetDistractions: () => void;
  logCurrentSession: (overrideResumeNote?: string) => StudyLogEntry | null;
  saveResumeNoteForLog: (logId: string, note: string) => void;
  dismissResumePrompt: () => void;
  setSoundMode: (mode: AmbientSoundMode) => void;
  setVolume: (vol: number) => void;
  toggleWakeLock: () => void;
  toggleChime: () => void;
  setZenFullscreen: (open: boolean) => void;
  toggleZenFullscreen: () => void;
}

const FocusTimerContext = createContext<FocusTimerContextValue | null>(null);

function loadPersistedFocus(defaultChime: boolean): PersistedFocusState {
  const fallback: PersistedFocusState = {
    presetId: 'deep_50',
    subjectId: 'os',
    sessionType: 'PYQs',
    goal: '',
    status: 'idle',
    startedAtMs: null,
    sessionOriginIso: null,
    accumulatedSeconds: 0,
    targetSeconds: 50 * 60,
    distractions: 0,
    volume: 0.38,
    wakeLockEnabled: false,
    chimeEnabled: defaultChime,
    lastResumeNote: '',
  };

  try {
    const raw = localStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<PersistedFocusState>;
    const validPresets: FocusPresetId[] = [
      'sprint_25',
      'deep_50',
      'ultradian_90',
      'stamina_180',
      'short_break',
      'long_break',
      'stopwatch',
    ];
    const presetId: FocusPresetId =
      p.presetId && validPresets.includes(p.presetId) ? p.presetId : fallback.presetId;
    const subjectId: SubjectId =
      p.subjectId && SUBJECT_MAP[p.subjectId] ? p.subjectId : fallback.subjectId;
    const sessionType: FocusSessionType =
      p.sessionType === 'Concept' ||
      p.sessionType === 'PYQs' ||
      p.sessionType === 'Mock Analysis' ||
      p.sessionType === 'Revision'
        ? p.sessionType
        : fallback.sessionType;

    const status: 'idle' | 'running' | 'paused' =
      p.status === 'running' || p.status === 'paused' ? p.status : 'idle';
    const targetSeconds =
      typeof p.targetSeconds === 'number' && p.targetSeconds >= 60 && p.targetSeconds <= 720 * 60
        ? Math.round(p.targetSeconds)
        : 50 * 60;
    const accumulatedSeconds =
      typeof p.accumulatedSeconds === 'number' && p.accumulatedSeconds >= 0
        ? p.accumulatedSeconds
        : 0;

    return {
      presetId,
      subjectId,
      sessionType,
      goal: typeof p.goal === 'string' ? p.goal.slice(0, 200) : '',
      status,
      startedAtMs:
        status === 'running' && typeof p.startedAtMs === 'number' ? p.startedAtMs : null,
      sessionOriginIso: typeof p.sessionOriginIso === 'string' ? p.sessionOriginIso : null,
      accumulatedSeconds,
      targetSeconds,
      distractions:
        typeof p.distractions === 'number' && p.distractions >= 0
          ? Math.min(500, Math.round(p.distractions))
          : 0,
      volume:
        typeof p.volume === 'number' && Number.isFinite(p.volume)
          ? Math.max(0, Math.min(1, p.volume))
          : 0.38,
      wakeLockEnabled: Boolean(p.wakeLockEnabled),
      chimeEnabled: typeof p.chimeEnabled === 'boolean' ? p.chimeEnabled : defaultChime,
      lastResumeNote: typeof p.lastResumeNote === 'string' ? p.lastResumeNote.slice(0, 300) : '',
    };
  } catch {
    return fallback;
  }
}

/**
 * Isolated leaf component that updates document.title once per second ONLY while timer is running.
 * Keeps the main React tree completely free from 1Hz re-renders.
 */
const FocusBrowserTitleSync: React.FC<{
  snapshot: TimerClockSnapshot;
  subjectId: SubjectId;
  presetKind: 'work' | 'break' | 'stopwatch';
}> = React.memo(({ snapshot, subjectId, presetKind }) => {
  useEffect(() => {
    if (snapshot.status !== 'running') {
      if (document.title !== BASE_DOCUMENT_TITLE) {
        document.title = BASE_DOCUMENT_TITLE;
      }
      return;
    }

    const subjCode = presetKind === 'break' ? 'BREAK' : SUBJECT_MAP[subjectId]?.code ?? 'GATE';
    const updateTitle = () => {
      const clock = computeTimerClock(snapshot, Date.now());
      document.title = `${formatClock(clock.displaySeconds)} · ${subjCode} · GATE '27`;
    };

    updateTitle();
    const id = window.setInterval(updateTitle, 1000);
    return () => {
      window.clearInterval(id);
      document.title = BASE_DOCUMENT_TITLE;
    };
  }, [snapshot, subjectId, presetKind]);

  return null;
});

FocusBrowserTitleSync.displayName = 'FocusBrowserTitleSync';

interface FocusTimerProviderProps {
  settings: ExamSettings;
  studyLogs: StudyLogEntry[];
  onLogStudySession: (
    subjectId: SubjectId,
    minutes: number,
    mode: 'pomodoro' | 'stopwatch',
    meta?: FocusLogMeta
  ) => StudyLogEntry | null;
  onUpdateStudyLog: (
    logId: string,
    patch: { resumeNote?: string; goal?: string; sessionType?: FocusSessionType }
  ) => void;
  children: React.ReactNode;
}

export const FocusTimerProvider: React.FC<FocusTimerProviderProps> = ({
  settings,
  studyLogs,
  onLogStudySession,
  onUpdateStudyLog,
  children,
}) => {
  const presets = useMemo(() => buildFocusPresets(settings), [
    settings.pomodoroWorkMinutes,
    settings.pomodoroShortBreakMinutes,
    settings.pomodoroLongBreakMinutes,
  ]);

  const [persisted, setPersisted] = useState<PersistedFocusState>(() =>
    loadPersistedFocus(settings.timerChimeEnabled ?? true)
  );
  const [soundMode, setSoundModeState] = useState<AmbientSoundMode>('off');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [zenFullscreen, setZenFullscreen] = useState(false);
  const [pendingResumeLogId, setPendingResumeLogId] = useState<string | null>(null);
  const [lastLoggedBanner, setLastLoggedBanner] = useState('');

  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;

  const wakeLockSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as unknown as NavigatorWithWakeLock).wakeLock?.request);

  const activePreset = useMemo(
    () => presets.find((p) => p.id === persisted.presetId) ?? presets[1],
    [presets, persisted.presetId]
  );

  // Derive the most recent resume note from Firestore/local studyLogs if available
  const latestStoredResumeNote = useMemo(() => {
    for (let i = studyLogs.length - 1; i >= 0; i--) {
      const note = studyLogs[i]?.resumeNote?.trim();
      if (note) return note;
    }
    return '';
  }, [studyLogs]);

  const lastResumeNote = latestStoredResumeNote || persisted.lastResumeNote;

  const clockSnapshot: TimerClockSnapshot = useMemo(
    () => ({
      isStopwatch: persisted.presetId === 'stopwatch',
      status: persisted.status,
      startedAtMs: persisted.startedAtMs,
      accumulatedSeconds: persisted.accumulatedSeconds,
      targetSeconds: persisted.targetSeconds,
    }),
    [
      persisted.presetId,
      persisted.status,
      persisted.startedAtMs,
      persisted.accumulatedSeconds,
      persisted.targetSeconds,
    ]
  );

  const flashBanner = useCallback((msg: string) => {
    setLastLoggedBanner(msg);
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
    }
    bannerTimerRef.current = window.setTimeout(() => {
      setLastLoggedBanner('');
    }, 5000);
  }, []);

  // Persist immutable anchor state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Ignore storage quota issues
    }
  }, [persisted]);

  // Keep Screen Awake (Wake Lock API) when enabled & running
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as unknown as NavigatorWithWakeLock;

    const releaseLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // Ignore
        }
        wakeLockRef.current = null;
      }
      if (!cancelled) setWakeLockActive(false);
    };

    const acquireLock = async () => {
      if (!nav.wakeLock?.request) return;
      try {
        const sentinel = await nav.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
      } catch {
        if (!cancelled) setWakeLockActive(false);
      }
    };

    if (persisted.wakeLockEnabled && persisted.status === 'running') {
      void acquireLock();
    } else {
      void releaseLock();
    }

    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        persistedRef.current.wakeLockEnabled &&
        persistedRef.current.status === 'running'
      ) {
        void acquireLock();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void releaseLock();
    };
  }, [persisted.wakeLockEnabled, persisted.status]);

  // Single exact completion timeout when running a countdown (zero per-second polling!)
  useEffect(() => {
    if (persisted.status !== 'running' || persisted.presetId === 'stopwatch') {
      return;
    }

    const handleCompletion = () => {
      const curr = persistedRef.current;
      if (curr.status !== 'running' || curr.presetId === 'stopwatch') return;

      if (curr.chimeEnabled) {
        focusSoundEngine.playWarmBellChime();
      }

      const preset = presets.find((p) => p.id === curr.presetId) ?? presets[1];
      if (preset.kind === 'work') {
        const loggedMinutes = Math.max(1, Math.round(curr.targetSeconds / 60));
        const created = onLogStudySession(curr.subjectId, loggedMinutes, 'pomodoro', {
          startedAt: curr.sessionOriginIso ?? undefined,
          sessionType: curr.sessionType,
          goal: curr.goal || undefined,
          distractions: curr.distractions,
          presetLabel: preset.shortLabel,
        });
        if (created) {
          setPendingResumeLogId(created.id);
          flashBanner(
            `Logged ${loggedMinutes}m ${SUBJECT_MAP[curr.subjectId]?.code ?? curr.subjectId.toUpperCase()} focus block.`
          );
        }
      } else {
        flashBanner(`${preset.title} complete — ready for your next deep block.`);
      }

      setPersisted((prev) => ({
        ...prev,
        status: 'idle',
        startedAtMs: null,
        sessionOriginIso: null,
        accumulatedSeconds: 0,
        distractions: 0,
      }));
    };

    const computed = computeTimerClock(clockSnapshot, Date.now());
    if (computed.isFinished) {
      handleCompletion();
      return;
    }

    const remainingMs = Math.max(50, computed.remainingSeconds * 1000);
    const timeoutId = window.setTimeout(handleCompletion, remainingMs + 40);
    return () => window.clearTimeout(timeoutId);
  }, [
    persisted.status,
    persisted.presetId,
    persisted.startedAtMs,
    persisted.targetSeconds,
    persisted.accumulatedSeconds,
    clockSnapshot,
    presets,
    onLogStudySession,
    flashBanner,
  ]);

  const selectPreset = useCallback(
    (id: FocusPresetId) => {
      const targetPreset = presets.find((p) => p.id === id) ?? presets[1];
      setPersisted((prev) => ({
        ...prev,
        presetId: id,
        status: 'idle',
        startedAtMs: null,
        sessionOriginIso: null,
        accumulatedSeconds: 0,
        targetSeconds:
          targetPreset.kind === 'stopwatch' ? 0 : Math.max(60, targetPreset.defaultMinutes * 60),
        distractions: 0,
      }));
    },
    [presets]
  );

  const setSubjectId = useCallback((id: SubjectId) => {
    setPersisted((prev) => ({ ...prev, subjectId: id }));
  }, []);

  const setSessionType = useCallback((t: FocusSessionType) => {
    setPersisted((prev) => ({ ...prev, sessionType: t }));
  }, []);

  const setGoal = useCallback((g: string) => {
    setPersisted((prev) => ({ ...prev, goal: g.slice(0, 200) }));
  }, []);

  const start = useCallback(() => {
    const now = Date.now();
    setPersisted((prev) => {
      if (prev.status === 'running') return prev;
      return {
        ...prev,
        status: 'running',
        startedAtMs: now,
        sessionOriginIso: prev.sessionOriginIso ?? new Date(now).toISOString(),
      };
    });
  }, []);

  const pause = useCallback(() => {
    const now = Date.now();
    setPersisted((prev) => {
      if (prev.status !== 'running') return prev;
      const delta = prev.startedAtMs ? Math.max(0, (now - prev.startedAtMs) / 1000) : 0;
      return {
        ...prev,
        status: 'paused',
        startedAtMs: null,
        accumulatedSeconds: prev.accumulatedSeconds + delta,
      };
    });
  }, []);

  const toggleStartPause = useCallback(() => {
    if (persistedRef.current.status === 'running') {
      pause();
    } else {
      start();
    }
  }, [pause, start]);

  const reset = useCallback(() => {
    setPersisted((prev) => {
      const preset = presets.find((p) => p.id === prev.presetId) ?? presets[1];
      return {
        ...prev,
        status: 'idle',
        startedAtMs: null,
        sessionOriginIso: null,
        accumulatedSeconds: 0,
        targetSeconds: preset.kind === 'stopwatch' ? 0 : Math.max(60, preset.defaultMinutes * 60),
        distractions: 0,
      };
    });
  }, [presets]);

  const extendMinutes = useCallback((deltaMinutes: number) => {
    setPersisted((prev) => {
      if (prev.presetId === 'stopwatch') return prev;
      const nextTarget = Math.max(
        60,
        Math.min(720 * 60, prev.targetSeconds + Math.round(deltaMinutes * 60))
      );
      return {
        ...prev,
        targetSeconds: nextTarget,
      };
    });
  }, []);

  const addDistraction = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      distractions: Math.min(500, prev.distractions + 1),
    }));
  }, []);

  const resetDistractions = useCallback(() => {
    setPersisted((prev) => ({ ...prev, distractions: 0 }));
  }, []);

  const logCurrentSession = useCallback(
    (overrideResumeNote?: string): StudyLogEntry | null => {
      const curr = persistedRef.current;
      const preset = presets.find((p) => p.id === curr.presetId) ?? presets[1];
      const now = Date.now();
      const clock = computeTimerClock(
        {
          isStopwatch: curr.presetId === 'stopwatch',
          status: curr.status,
          startedAtMs: curr.startedAtMs,
          accumulatedSeconds: curr.accumulatedSeconds,
          targetSeconds: curr.targetSeconds,
        },
        now
      );

      // Allow logging partial sessions (> 0s elapsed -> minimum 1 minute) or full target if idle on work preset
      let minutesToLog = 0;
      if (clock.elapsedSeconds > 0) {
        minutesToLog = Math.max(1, Math.round(clock.elapsedSeconds / 60));
      } else if (preset.kind === 'work') {
        minutesToLog = Math.max(1, Math.round(curr.targetSeconds / 60));
      }

      if (minutesToLog <= 0) return null;

      const mode: 'pomodoro' | 'stopwatch' =
        curr.presetId === 'stopwatch' ? 'stopwatch' : 'pomodoro';

      const created = onLogStudySession(curr.subjectId, minutesToLog, mode, {
        startedAt: curr.sessionOriginIso ?? undefined,
        sessionType: curr.sessionType,
        goal: curr.goal || undefined,
        resumeNote: overrideResumeNote?.trim() || undefined,
        distractions: curr.distractions,
        presetLabel: preset.shortLabel,
      });

      if (created) {
        setPendingResumeLogId(overrideResumeNote ? null : created.id);
        flashBanner(
          `Logged ${minutesToLog}m ${SUBJECT_MAP[curr.subjectId]?.code ?? curr.subjectId.toUpperCase()} (${curr.sessionType}).`
        );
      }

      setPersisted((prev) => ({
        ...prev,
        status: 'idle',
        startedAtMs: null,
        sessionOriginIso: null,
        accumulatedSeconds: 0,
        targetSeconds: preset.kind === 'stopwatch' ? 0 : Math.max(60, preset.defaultMinutes * 60),
        distractions: 0,
        lastResumeNote: overrideResumeNote?.trim() || prev.lastResumeNote,
      }));

      return created;
    },
    [presets, onLogStudySession, flashBanner]
  );

  const saveResumeNoteForLog = useCallback(
    (logId: string, note: string) => {
      const clean = note.trim().slice(0, 300);
      onUpdateStudyLog(logId, { resumeNote: clean });
      if (clean) {
        setPersisted((prev) => ({ ...prev, lastResumeNote: clean }));
      }
      setPendingResumeLogId((curr) => (curr === logId ? null : curr));
    },
    [onUpdateStudyLog]
  );

  const dismissResumePrompt = useCallback(() => {
    setPendingResumeLogId(null);
  }, []);

  const setSoundMode = useCallback((mode: AmbientSoundMode) => {
    setSoundModeState(mode);
    focusSoundEngine.setMode(mode, persistedRef.current.volume);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setPersisted((prev) => ({ ...prev, volume: clamped }));
    focusSoundEngine.setVolume(clamped);
  }, []);

  const toggleWakeLock = useCallback(() => {
    setPersisted((prev) => ({ ...prev, wakeLockEnabled: !prev.wakeLockEnabled }));
  }, []);

  const toggleChime = useCallback(() => {
    setPersisted((prev) => ({ ...prev, chimeEnabled: !prev.chimeEnabled }));
  }, []);

  const toggleZenFullscreen = useCallback(() => {
    setZenFullscreen((z) => !z);
  }, []);

  // Cleanup audio on provider unmount
  useEffect(() => {
    return () => {
      focusSoundEngine.setMode('off');
      if (bannerTimerRef.current !== null) {
        window.clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  const value = useMemo<FocusTimerContextValue>(
    () => ({
      presets,
      activePreset,
      presetId: persisted.presetId,
      subjectId: persisted.subjectId,
      sessionType: persisted.sessionType,
      goal: persisted.goal,
      status: persisted.status,
      clockSnapshot,
      distractions: persisted.distractions,
      soundMode,
      volume: persisted.volume,
      wakeLockEnabled: persisted.wakeLockEnabled,
      wakeLockActive,
      wakeLockSupported,
      chimeEnabled: persisted.chimeEnabled,
      zenFullscreen,
      pendingResumeLogId,
      lastResumeNote,
      lastLoggedBanner,
      selectPreset,
      setSubjectId,
      setSessionType,
      setGoal,
      start,
      pause,
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
    }),
    [
      presets,
      activePreset,
      persisted.presetId,
      persisted.subjectId,
      persisted.sessionType,
      persisted.goal,
      persisted.status,
      clockSnapshot,
      persisted.distractions,
      soundMode,
      persisted.volume,
      persisted.wakeLockEnabled,
      wakeLockActive,
      wakeLockSupported,
      persisted.chimeEnabled,
      zenFullscreen,
      pendingResumeLogId,
      lastResumeNote,
      lastLoggedBanner,
      selectPreset,
      setSubjectId,
      setSessionType,
      setGoal,
      start,
      pause,
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
      toggleZenFullscreen,
    ]
  );

  return (
    <FocusTimerContext.Provider value={value}>
      <FocusBrowserTitleSync
        snapshot={clockSnapshot}
        subjectId={persisted.subjectId}
        presetKind={activePreset.kind}
      />
      {children}
    </FocusTimerContext.Provider>
  );
};

export function useFocusTimer(): FocusTimerContextValue {
  const ctx = useContext(FocusTimerContext);
  if (!ctx) {
    throw new Error('useFocusTimer must be used inside FocusTimerProvider');
  }
  return ctx;
}
