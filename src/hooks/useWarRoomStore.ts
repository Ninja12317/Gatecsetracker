import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  AccentThemeId,
  AuthUserSummary,
  DailyProgressState,
  DailyTestRecord,
  DryRunTraceRow,
  DryRunTraceTable,
  ErrorTag,
  ExamSettings,
  FocusSessionType,
  GaStreakEntry,
  GateRSyncStatus,
  MistakeEntry,
  MockTestEntry,
  Question,
  QuestionAttemptRecord,
  SrsCardRecord,
  SrsItemType,
  SrsRating,
  StandaloneRoughWorkState,
  StudyLogEntry,
  SubjectId,
  SubtopicProgress,
  SyncStatus,
  TestHistoryEntry,
  ThemeMode,
  TipItem,
  TopicStatus,
  TrapSourceType,
  UserProfile,
  VaultCard,
  VaultPack,
  VerifiedAnswerRecord,
  WarRoomState,
} from '../types';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from '../firebase';
import { createInitialWarRoomState } from '../data/seedState';
import { GATE_QUESTION_BANK } from '../data/questions';
import { GATE_2027_MASTER_VAULT } from '../data/gate27FormulaTrapBundle';
import { GATE_2027_SYLLABUS } from '../data/syllabus';
import { nextTopicStatus, toLocalIsoDate } from '../utils/gateMath';
import {
  computeQuestionFingerprint,
  getIstDateString,
} from '../utils/pyqServerHelpers';
import {
  applyVerifiedAnswer,
  normalizeGateRDataset,
} from '../utils/gaterNormalizer';
import {
  mergeQuestionBanks,
  questionHasAnswerKey,
  type ArshanPyqKeyRecord,
} from '../utils/arshanNormalizer';
import { deduplicateQuestionPool } from '../utils/testBuilder';
import {
  readCommunityKeysCache,
  readGateRCache,
  writeCommunityKeysCache,
  writeGateRCache,
} from '../utils/pyqIndexedDb';
import {
  buildLocalTagTrapsFallback,
  computeNextSrsSchedule,
  makeSrsCardId,
} from '../utils/examPolish';
import {
  cardFingerprint,
  mineMistakesToVaultCards,
  splitPackForFirestore,
  tipItemToVaultCard,
  vaultCardToTipItem,
} from '../utils/vaultImporter';
import {
  applyThemeToDocument,
  normalizeAccentThemeId,
} from '../utils/themeEngine';
import {
  applyAccentAttributeToDom,
  parseAccentUpdatedAt,
  readLocalAccentSelection,
  resolveRemoteAccentSync,
  writeLocalAccentSelection,
} from '../utils/accentThemePersistence';
import {
  createEmptyDailyProgress,
  recordDailyTestCompletion,
  selectOrGetDailyDpp,
  selectOrGetDailyGa,
} from '../utils/dailyTestEngine';
import {
  migrateLegacyMockSubject,
  migrateLegacyProgressMap,
  migrateLegacyQuestion,
  migrateLegacyQuestionList,
  migrateLegacyTip,
  migrateLegacyVaultCard,
  migrateLegacyWarRoomState,
  normalizeSubject12,
} from '../utils/subjectMigration';
import {
  evaluateQuestionStrict,
  gradeTestSessionStrict,
  parseSerializedResponse,
  recalculateTestHistoryEntry,
} from '../utils/testScoringEngine';
import {
  createEmptyUserProfile,
  sanitizeUserProfile,
  shouldApplyRemoteProfile,
} from '../utils/profileHelpers';
import {
  communityKeyDocToVerifiedRecord,
  mergeCommunityAndLocalVerifiedKeys,
  resolveContributorDisplayName,
  verifiedRecordToCommunityKeyDoc,
  type CommunityVerifiedKeyDoc,
} from '../utils/communityKeys';

const STORAGE_KEY = 'gate27_war_room_state_v2';
const STANDALONE_ROUGH_WORK_KEY = 'standalone_rough_work';
const USER_PROFILE_STORAGE_KEY = 'gate27_user_profile_v1';
const SUBJECT_COOLDOWN_MS = 45_000;
const TRAPS_COOLDOWN_MS = 10_000;

function readLocalUserProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) return createEmptyUserProfile();
    return sanitizeUserProfile(JSON.parse(raw));
  } catch {
    return createEmptyUserProfile();
  }
}

function writeLocalUserProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(sanitizeUserProfile(profile)));
  } catch {
    // ignore localStorage quota errors
  }
}

function createDefaultStandaloneRoughWork(): StandaloneRoughWorkState {
  const nowIso = new Date().toISOString();
  return {
    activeSheetId: 'sheet-1',
    sheets: [
      {
        id: 'sheet-1',
        name: 'Sheet 1',
        paperStyle: 'dot',
        dataUrl: '',
        updatedAt: nowIso,
      },
    ],
    updatedAt: nowIso,
  };
}

function loadLocalStandaloneRoughWork(): StandaloneRoughWorkState {
  try {
    const raw = localStorage.getItem(STANDALONE_ROUGH_WORK_KEY);
    if (!raw) return createDefaultStandaloneRoughWork();
    const parsed = JSON.parse(raw) as Partial<StandaloneRoughWorkState>;
    if (!Array.isArray(parsed.sheets) || parsed.sheets.length === 0) {
      return createDefaultStandaloneRoughWork();
    }
    const sheets = parsed.sheets.slice(0, 12).map((s, idx) => ({
      id: typeof s?.id === 'string' && s.id ? s.id : `sheet-${idx + 1}`,
      name: typeof s?.name === 'string' && s.name ? s.name : `Sheet ${idx + 1}`,
      paperStyle:
        s?.paperStyle === 'grid' || s?.paperStyle === 'blank' ? s.paperStyle : ('dot' as const),
      dataUrl: typeof s?.dataUrl === 'string' ? s.dataUrl : '',
      updatedAt: typeof s?.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
    }));
    const activeSheetId =
      typeof parsed.activeSheetId === 'string' && sheets.some((s) => s.id === parsed.activeSheetId)
        ? parsed.activeSheetId
        : sheets[0].id;
    return {
      activeSheetId,
      sheets,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return createDefaultStandaloneRoughWork();
  }
}

function sanitizeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

function loadLocalState(): WarRoomState {
  const localAccent = readLocalAccentSelection();
  const localProfile = readLocalUserProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialWarRoomState();
      return {
        ...initial,
        profile: localProfile,
        settings: {
          ...initial.settings,
          accentTheme: localAccent.accentTheme,
          accentUpdatedAt: localAccent.accentUpdatedAt,
        },
      };
    }
    const parsed = JSON.parse(raw) as Partial<WarRoomState>;
    const initial = createInitialWarRoomState();
    const resolvedTheme = parsed.theme === 'dark' ? 'dark' : 'light';
    const resolvedAccent = localAccent.hasExplicitLocalSelection
      ? localAccent.accentTheme
      : normalizeAccentThemeId(parsed.settings?.accentTheme);
    const resolvedAccentUpdatedAt = Math.max(
      localAccent.accentUpdatedAt,
      parseAccentUpdatedAt(parsed.settings?.accentUpdatedAt)
    );
    const parsedProfile = sanitizeUserProfile(parsed.profile);
    const resolvedProfile =
      (localProfile.profileUpdatedAt ?? 0) >= (parsedProfile.profileUpdatedAt ?? 0) &&
      (localProfile.displayName || localProfile.avatarDataUrl || localProfile.targetGoal || localProfile.bio)
        ? localProfile
        : parsedProfile;
    const assembled: WarRoomState = {
      ...initial,
      ...parsed,
      theme: resolvedTheme,
      profile: resolvedProfile,
      settings: {
        ...initial.settings,
        ...(parsed.settings ?? {}),
        themeMode: parsed.settings?.themeMode ?? resolvedTheme,
        accentTheme: resolvedAccent,
        accentUpdatedAt: resolvedAccentUpdatedAt,
        simpleMode: Boolean(parsed.settings?.simpleMode ?? false),
      },
      lastAutopilotIstDate: parsed.lastAutopilotIstDate ?? '',
      lastTrapsIstDate: parsed.lastTrapsIstDate ?? '',
      progress: { ...initial.progress, ...(parsed.progress ?? {}) },
      attempts: parsed.attempts ?? {},
      mistakes: parsed.mistakes ?? {},
      verifiedAnswers: parsed.verifiedAnswers ?? {},
      bookmarkedQuestions: parsed.bookmarkedQuestions ?? [],
      savedSketches: parsed.savedSketches ?? {},
      traceTables: parsed.traceTables ?? {},
      gaStreakLogs: parsed.gaStreakLogs ?? {},
      dailyProgress: {
        ...createEmptyDailyProgress(),
        ...(parsed.dailyProgress ?? {}),
        usedDailyDppIds: Array.isArray(parsed.dailyProgress?.usedDailyDppIds)
          ? parsed.dailyProgress.usedDailyDppIds
          : [],
        usedDailyGaIds: Array.isArray(parsed.dailyProgress?.usedDailyGaIds)
          ? parsed.dailyProgress.usedDailyGaIds
          : [],
        dailyDppByDate: parsed.dailyProgress?.dailyDppByDate ?? {},
        dailyGaByDate: parsed.dailyProgress?.dailyGaByDate ?? {},
      },
      customQuestions: parsed.customQuestions ?? [],
      bookmarkedTips: parsed.bookmarkedTips ?? [],
      customTips: parsed.customTips ?? [],
      trapsVault: parsed.trapsVault ?? [],
      vaultPacks: Array.isArray(parsed.vaultPacks) ? parsed.vaultPacks : [],
      srsCards: parsed.srsCards ?? {},
      mocks: parsed.mocks ?? [],
      studyLogs: parsed.studyLogs ?? [],
      testHistory: Array.isArray(parsed.testHistory) ? parsed.testHistory : [],
    };
    return migrateLegacyWarRoomState(assembled);
  } catch {
    const initial = createInitialWarRoomState();
    return {
      ...initial,
      profile: localProfile,
      settings: {
        ...initial.settings,
        accentTheme: localAccent.accentTheme,
        accentUpdatedAt: localAccent.accentUpdatedAt,
      },
    };
  }
}

export interface AutopilotRunResult {
  ok: boolean;
  addedQuestions: number;
  addedTip: boolean;
  cached?: boolean;
  quotaExceeded?: boolean;
  message: string;
}

export interface SubjectFetchResult {
  ok: boolean;
  addedCount: number;
  quotaExceeded?: boolean;
  cooldown?: boolean;
  retryAfterSeconds?: number;
  message: string;
}

export interface UrlIngestResult {
  ok: boolean;
  addedCount: number;
  quotaExceeded?: boolean;
  message: string;
}

export function useWarRoomStore() {
  const [state, setState] = useState<WarRoomState>(() => loadLocalState());
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('signed_out');
  const [authError, setAuthError] = useState<string>('');

  // Free-Tier quota & fetcher states
  const [quotaNotice, setQuotaNotice] = useState<string>('');
  const [autopilotLoading, setAutopilotLoading] = useState<boolean>(false);
  const [autopilotStatusMsg, setAutopilotStatusMsg] = useState<string>('');
  const [subjectFetching, setSubjectFetching] = useState<SubjectId | null>(null);
  const [subjectCooldownUntil, setSubjectCooldownUntil] = useState<Record<string, number>>({});
  const [urlIngestLoading, setUrlIngestLoading] = useState<boolean>(false);

  // Dynamic Traps & Tips states
  const [trapsGenerating, setTrapsGenerating] = useState<boolean>(false);
  const [trapsCooldownUntil, setTrapsCooldownUntil] = useState<number>(0);
  const [trapsNotice, setTrapsNotice] = useState<string>('');

  // Unified GateR + Arshan IndexedDB-cached PYQ bank
  const [gaterQuestions, setGaterQuestions] = useState<Question[]>([]);
  const [gaterSyncStatus, setGaterSyncStatus] = useState<GateRSyncStatus>('idle');
  const [gaterSyncedAt, setGaterSyncedAt] = useState<string>('');
  const [gaterError, setGaterError] = useState<string>('');
  const [gaterRawCount, setGaterRawCount] = useState<number>(0);
  const [arshanCount, setArshanCount] = useState<number>(0);
  const [enrichedCount, setEnrichedCount] = useState<number>(0);
  const [syncProgressMsg, setSyncProgressMsg] = useState<string>('');

  // Completely isolated Standalone Rough-Work Scratchpad state (never touches PYQ savedSketches)
  const [standaloneRoughWork, setStandaloneRoughWork] = useState<StandaloneRoughWorkState>(() =>
    loadLocalStandaloneRoughWork()
  );

  const stateRef = useRef<WarRoomState>(state);
  stateRef.current = state;
  const communityDocsRef = useRef<Record<string, CommunityVerifiedKeyDoc>>({});
  const communityKeysRef = useRef<Record<string, VerifiedAnswerRecord>>({});
  const allQuestionsRef = useRef<Question[]>([]);

  const userRef = useRef<AuthUserSummary | null>(user);
  userRef.current = user;

  const metaDocExistsRef = useRef<boolean>(false);
  const pushedAccentSessionRef = useRef<string>('');

  // Sync dark/light/system theme mode AND 8-color accent theme on <html> + zero-flicker boot cache
  useEffect(() => {
    const mode: ThemeMode = state.settings.themeMode ?? state.theme;
    const accent: AccentThemeId = normalizeAccentThemeId(state.settings.accentTheme);

    applyThemeToDocument(mode, accent);

    if (mode === 'system' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyThemeToDocument('system', accent);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    }

    return undefined;
  }, [state.theme, state.settings.themeMode, state.settings.accentTheme]);

  // Sync root UI Scale (90% / 100% / 110%) cleanly on <html>
  useEffect(() => {
    const root = document.documentElement;
    const scale = state.settings.uiScale ?? 'default';
    root.style.fontSize =
      scale === 'compact' ? '90%' : scale === 'comfortable' ? '110%' : '100%';
  }, [state.settings.uiScale]);

  // Persist local cache whenever state changes (offline-first fallback)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Handle localStorage quota silently
    }
  }, [state]);

  // Persist isolated standalone rough-work scratchpad independently
  useEffect(() => {
    try {
      localStorage.setItem(STANDALONE_ROUGH_WORK_KEY, JSON.stringify(standaloneRoughWork));
    } catch {
      // ignore localStorage quota errors
    }
  }, [standaloneRoughWork]);

  // Sync BOTH GateR (khushit-shah/gater-frontend) AND Arshan (arshanalikhan/gate-cse) into unified IndexedDB cache
  const syncAllRepos = useCallback(
    async (
      forceRefresh = false
    ): Promise<{
      ok: boolean;
      count: number;
      gaterCount: number;
      arshanCount: number;
      enrichedCount: number;
      verifiedCount: number;
      message: string;
    }> => {
      setGaterSyncStatus('syncing');
      setGaterError('');
      setSyncProgressMsg('Syncing GATE CSE question banks...');

      try {
        const qs = forceRefresh ? '?force=1' : '';
        const [gaterSettled, arshanSettled] = await Promise.allSettled([
          fetch(`/api/sync-gater-repo${qs}`).then((r) => r.json()),
          fetch(`/api/sync-arshan-repo${qs}`).then((r) => r.json()),
        ]);

        const gaterPayload =
          gaterSettled.status === 'fulfilled'
            ? (gaterSettled.value as {
                ok: boolean;
                sourceUrl?: string;
                syncedAt?: string;
                data?: unknown;
                message?: string;
              })
            : null;

        const arshanPayload =
          arshanSettled.status === 'fulfilled'
            ? (arshanSettled.value as {
                ok: boolean;
                syncedAt?: string;
                questions?: Question[];
                pyqAnswerKeys?: ArshanPyqKeyRecord[];
                stats?: {
                  playableCount?: number;
                  pyqKeysCount?: number;
                  predicted2027Count?: number;
                };
                message?: string;
              })
            : null;

        // Retain existing cached GateR items if GateR temporarily failed while Arshan succeeded
        let gaterNormalized: Question[] = [];
        if (gaterPayload?.ok && gaterPayload.data) {
          gaterNormalized = normalizeGateRDataset(gaterPayload.data);
        } else {
          const cached = await readGateRCache();
          if (cached && cached.questions.length > 0) {
            gaterNormalized = cached.questions.filter((q) => q.isGateR || q.sourceRepo === 'gater' || q.sourceRepo === 'merged');
          }
        }

        const arshanQuestions: Question[] =
          arshanPayload?.ok && Array.isArray(arshanPayload.questions)
            ? arshanPayload.questions
            : [];
        const arshanKeys: ArshanPyqKeyRecord[] =
          arshanPayload?.ok && Array.isArray(arshanPayload.pyqAnswerKeys)
            ? arshanPayload.pyqAnswerKeys
            : [];

        if (gaterNormalized.length === 0 && arshanQuestions.length === 0) {
          const msg =
            gaterPayload?.message ||
            arshanPayload?.message ||
            'Offline or GitHub unreachable · Serving cached PYQs.';
          setGaterSyncStatus('error');
          setGaterError(msg);
          setSyncProgressMsg('');
          return {
            ok: false,
            count: 0,
            gaterCount: 0,
            arshanCount: 0,
            enrichedCount: 0,
            verifiedCount: 0,
            message: msg,
          };
        }

        const { questions: rawMergedQuestions, stats } = mergeQuestionBanks(
          gaterNormalized,
          arshanQuestions,
          arshanKeys
        );
        const mergedQuestions = migrateLegacyQuestionList(rawMergedQuestions);

        const syncedAt = new Date().toISOString();
        setGaterQuestions(mergedQuestions);
        setGaterRawCount(stats.gaterCount);
        setArshanCount(stats.arshanCount);
        setEnrichedCount(stats.enrichedCount);
        setGaterSyncedAt(syncedAt);
        setGaterSyncStatus('synced');

        await writeGateRCache({
          syncedAt,
          arshanSyncedAt: arshanPayload?.ok ? arshanPayload.syncedAt || syncedAt : undefined,
          sourceUrl: 'GateR + arshanalikhan/gate-cse',
          count: mergedQuestions.length,
          gaterCount: stats.gaterCount,
          arshanCount: stats.arshanCount,
          enrichedCount: stats.enrichedCount,
          verifiedCount: stats.verifiedCount,
          questions: mergedQuestions,
        });

        const msg = `Synced ${mergedQuestions.length.toLocaleString()} questions (${stats.verifiedCount.toLocaleString()} with verified answer keys).`;
        setSyncProgressMsg(msg);
        return {
          ok: true,
          count: mergedQuestions.length,
          gaterCount: stats.gaterCount,
          arshanCount: stats.arshanCount,
          enrichedCount: stats.enrichedCount,
          verifiedCount: stats.verifiedCount,
          message: msg,
        };
      } catch {
        const msg = 'Offline or GitHub unreachable · Serving cached PYQs.';
        setGaterSyncStatus('error');
        setGaterError(msg);
        setSyncProgressMsg('');
        return {
          ok: false,
          count: 0,
          gaterCount: 0,
          arshanCount: 0,
          enrichedCount: 0,
          verifiedCount: 0,
          message: msg,
        };
      }
    },
    []
  );

  const syncGateRFromRepo = syncAllRepos;

  // Auto-load unified GateR + Arshan PYQ bank from IndexedDB (<100ms offline) or sync seamlessly
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readGateRCache();
      if (cancelled) return;
      if (cached && cached.questions.length > 0) {
        const migrated = migrateLegacyQuestionList(cached.questions);
        setGaterQuestions(migrated);
        setGaterRawCount(cached.gaterCount ?? migrated.length);
        setArshanCount(cached.arshanCount ?? 0);
        setEnrichedCount(cached.enrichedCount ?? 0);
        setGaterSyncedAt(cached.syncedAt);
        setGaterSyncStatus('synced');
        // Upgrade legacy GateR-only IndexedDB cache seamlessly in background to include Arshan
        if (!cached.arshanSyncedAt) {
          void syncAllRepos(false);
        }
        return;
      }
      await syncAllRepos(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [syncAllRepos]);

  // Build strict Firestore workspace meta payload
  const buildWorkspaceMetaPayload = useCallback((uid: string, s: WarRoomState) => {
    const mode = s.settings.themeMode ?? s.theme;
    const accent = normalizeAccentThemeId(s.settings.accentTheme);
    const accentUpdatedAt = parseAccentUpdatedAt(s.settings.accentUpdatedAt);
    const payload: Record<string, unknown> = {
      ownerId: uid,
      theme: s.theme === 'dark' ? 'dark' : 'light',
      themeMode: mode === 'dark' || mode === 'system' ? mode : 'light',
      accentTheme: accent,
      simpleMode: Boolean(s.settings.simpleMode ?? false),
      uiScale:
        s.settings.uiScale === 'compact' || s.settings.uiScale === 'comfortable'
          ? s.settings.uiScale
          : 'default',
      contentWidth: s.settings.contentWidth === 'wide' ? 'wide' : 'focused',
      targetDateIso: s.settings.targetDateIso.slice(0, 40),
      shift:
        s.settings.shift === 'Afternoon (14:30 IST)'
          ? 'Afternoon (14:30 IST)'
          : 'Forenoon (09:30 IST)',
      dailyGoalMinutes: Math.max(30, Math.min(720, Math.round(s.settings.dailyGoalMinutes || 240))),
      pomodoroWorkMinutes: Math.max(5, Math.min(180, Math.round(s.settings.pomodoroWorkMinutes || 50))),
      pomodoroShortBreakMinutes: Math.max(1, Math.min(60, Math.round(s.settings.pomodoroShortBreakMinutes || 10))),
      pomodoroLongBreakMinutes: Math.max(5, Math.min(90, Math.round(s.settings.pomodoroLongBreakMinutes || 25))),
      timerChimeEnabled: Boolean(s.settings.timerChimeEnabled ?? true),
      autoHideRemoved2027: Boolean(s.settings.autoHideRemoved2027 ?? true),
      autoAddWrongToMistakes: Boolean(s.settings.autoAddWrongToMistakes ?? true),
      showLivePaceTimer: Boolean(s.settings.showLivePaceTimer ?? true),
      enableKeyboardShortcuts: Boolean(s.settings.enableKeyboardShortcuts ?? true),
      enableMobileSwipeNav: Boolean(s.settings.enableMobileSwipeNav ?? true),
      lastAutopilotIstDate: (s.lastAutopilotIstDate || '').slice(0, 16),
      lastTrapsIstDate: (s.lastTrapsIstDate || '').slice(0, 16),
      bookmarkedQuestions: s.bookmarkedQuestions.slice(0, 200),
      bookmarkedTips: s.bookmarkedTips.slice(0, 200),
      updatedAt: serverTimestamp(),
    };
    if (accentUpdatedAt > 0) {
      payload.accentUpdatedAt = accentUpdatedAt;
    }
    return payload;
  }, []);

  const persistWorkspaceMeta = useCallback(
    async (nextState: WarRoomState) => {
      const uid = userRef.current?.uid;
      if (!uid) return;
      const path = `users/${uid}/meta/workspace`;
      try {
        await setDoc(
          doc(db, 'users', uid, 'meta', 'workspace'),
          buildWorkspaceMetaPayload(uid, nextState),
          { merge: true }
        );
        metaDocExistsRef.current = true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [buildWorkspaceMetaPayload]
  );

  const persistDailyProgress = useCallback(async (nextDaily: DailyProgressState) => {
    const uid = userRef.current?.uid;
    if (!uid) return;
    const path = `users/${uid}/daily_progress/tracker`;
    try {
      await setDoc(doc(db, 'users', uid, 'daily_progress', 'tracker'), {
        ownerId: uid,
        usedDailyDppIds: nextDaily.usedDailyDppIds.slice(0, 4000),
        usedDailyGaIds: nextDaily.usedDailyGaIds.slice(0, 1000),
        dailyDppByDate: nextDaily.dailyDppByDate,
        dailyGaByDate: nextDaily.dailyGaByDate,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const persistStandaloneRoughWork = useCallback(async (nextRough: StandaloneRoughWorkState) => {
    const uid = userRef.current?.uid;
    if (!uid) return;
    const path = `users/${uid}/rough_work/main`;
    try {
      await setDoc(doc(db, 'users', uid, 'rough_work', 'main'), {
        ownerId: uid,
        activeSheetId: nextRough.activeSheetId.slice(0, 64),
        sheets: nextRough.sheets.slice(0, 12).map((s) => ({
          id: s.id.slice(0, 64),
          name: s.name.slice(0, 64),
          paperStyle: s.paperStyle,
          dataUrl: s.dataUrl.slice(0, 350000),
          updatedAt: s.updatedAt.slice(0, 40),
        })),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const persistPyqQuestion = useCallback(async (uid: string, q: Question) => {
    const docId = sanitizeDocId(q.id);
    const path = `users/${uid}/pyq_bank/${docId}`;
    const fingerprint = q.fingerprint || computeQuestionFingerprint(q.prompt);
    const payload = {
      ownerId: uid,
      subjectId: q.subjectId,
      subtopic: (q.subtopic || 'Core Concepts').slice(0, 160),
      format: q.format,
      marks: q.marks === 1 ? 1 : 2,
      difficulty: q.difficulty || 'Medium',
      sourceTag: (q.sourceTag || 'GATE PYQ').slice(0, 120),
      sourceUrl: (q.sourceUrl || '').slice(0, 500),
      prompt: q.prompt.slice(0, 4000),
      codeSnippet: (q.codeSnippet || '').slice(0, 4000),
      options: q.format === 'NAT' ? [] : (q.options ?? []).slice(0, 6),
      correctOption: q.format === 'MCQ' ? (q.correctOption || '').slice(0, 4) : '',
      correctOptions: q.format === 'MSQ' ? (q.correctOptions ?? []).slice(0, 6) : [],
      natAnswer: q.format === 'NAT' ? Number(q.natAnswer ?? 0) : 0,
      natTolerance:
        q.format === 'NAT'
          ? Math.max(0, Math.min(100, Number(q.natTolerance ?? 0.01)))
          : 0,
      natUnit: q.format === 'NAT' ? (q.natUnit || '').slice(0, 40) : '',
      explanation: (q.explanation || 'Step-by-step proof.').slice(0, 5000),
      wrongOptionAnalysis: (q.wrongOptionAnalysis || '').slice(0, 3000),
      fingerprint: fingerprint.slice(0, 128),
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'users', uid, 'pyq_bank', docId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }, []);

  const persistCustomTip = useCallback(async (uid: string, tip: TipItem) => {
    const docId = sanitizeDocId(tip.id);
    const path = `users/${uid}/custom_tips/${docId}`;
    const payload = {
      ownerId: uid,
      subjectId: tip.subjectId,
      title: tip.title.slice(0, 180),
      category: tip.category,
      summary: (tip.summary || '').slice(0, 400),
      detail: tip.detail.slice(0, 3000),
      formula: (tip.formula || '').slice(0, 400),
      sourceUrl: (tip.sourceUrl || '').slice(0, 500),
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'users', uid, 'custom_tips', docId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }, []);

  const persistTrapVaultItem = useCallback(async (uid: string, trap: TipItem) => {
    const docId = sanitizeDocId(trap.id);
    const path = `users/${uid}/traps_vault/${docId}`;
    const validSources = new Set(['ai_daily', 'ai_subject', 'mistake_mined', 'local_mined', 'manual']);
    const trapSource =
      trap.trapSource && validSources.has(trap.trapSource) ? trap.trapSource : 'ai_daily';
    const payload: Record<string, unknown> = {
      ownerId: uid,
      subjectId: trap.subjectId,
      title: trap.title.slice(0, 180),
      category: trap.category,
      summary: (trap.summary || '').slice(0, 400),
      detail: trap.detail.slice(0, 3000),
      formula: (trap.formula || '').slice(0, 400),
      trapSource,
      generatedDateIst: (trap.generatedDateIst || getIstDateString()).slice(0, 16),
      createdAt: serverTimestamp(),
    };
    if (trap.sourceQuestionId) {
      payload.sourceQuestionId = trap.sourceQuestionId.slice(0, 128);
    }
    try {
      await setDoc(doc(db, 'users', uid, 'traps_vault', docId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }, []);

  const persistSrsCard = useCallback(async (uid: string, card: SrsCardRecord) => {
    const docId = sanitizeDocId(card.cardId);
    const path = `users/${uid}/srs_cards/${docId}`;
    try {
      await setDoc(doc(db, 'users', uid, 'srs_cards', docId), {
        ownerId: uid,
        cardId: docId,
        itemType: card.itemType,
        itemId: card.itemId.slice(0, 128),
        intervalDays: card.intervalDays,
        nextReviewDate: card.nextReviewDate,
        lastRating: card.lastRating,
        reviewCount: Math.max(1, Math.min(10000, Math.round(card.reviewCount))),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const persistVaultPack = useCallback(async (uid: string, pack: VaultPack, isUpdate = false) => {
    const docId = sanitizeDocId(pack.packId);
    const path = `users/${uid}/vault_packs/${docId}`;
    const boundedCards = pack.cards.slice(0, 150).map((c) => {
      const cleanCard: Record<string, unknown> = {
        id: sanitizeDocId(c.id),
        subject: c.subject,
        subtopic: (c.subtopic || 'Core Concepts').slice(0, 120),
        tagMatchKeywords: (c.tagMatchKeywords ?? []).slice(0, 8),
        kind: c.kind,
        highYield: Boolean(c.highYield),
        title: c.title.slice(0, 180),
        gateTruth: c.gateTruth.slice(0, 2400),
        source: c.source,
        packId: docId,
        packName: pack.name.slice(0, 120),
      };
      if (c.formulaLatex) cleanCard.formulaLatex = c.formulaLatex.slice(0, 500);
      if (c.codeSnippet) cleanCard.codeSnippet = c.codeSnippet.slice(0, 2000);
      if (c.commonTrap) cleanCard.commonTrap = c.commonTrap.slice(0, 800);
      if (c.quickExample) cleanCard.quickExample = c.quickExample.slice(0, 600);
      if (c.outOf2027Syllabus) cleanCard.outOf2027Syllabus = true;
      if (typeof c.createdAt === 'number') cleanCard.createdAt = c.createdAt;
      return cleanCard;
    });
    if (boundedCards.length === 0) return;

    try {
      if (isUpdate) {
        await updateDoc(doc(db, 'users', uid, 'vault_packs', docId), {
          name: pack.name.slice(0, 120),
          cardCount: boundedCards.length,
          cards: boundedCards,
          updatedAt: serverTimestamp(),
        });
      } else {
        const payload: Record<string, unknown> = {
          ownerId: uid,
          packId: docId,
          name: pack.name.slice(0, 120),
          source: pack.source,
          cardCount: boundedCards.length,
          cards: boundedCards,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (pack.sourceUrl) {
          payload.sourceUrl = pack.sourceUrl.slice(0, 400);
        }
        await setDoc(doc(db, 'users', uid, 'vault_packs', docId), payload);
      }
    } catch (err) {
      handleFirestoreError(err, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  }, []);

  // Firebase Auth listener + Real-Time Firestore onSnapshot listeners
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    const clearListeners = () => {
      while (unsubscribes.length > 0) {
        const fn = unsubscribes.pop();
        if (fn) fn();
      }
    };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      clearListeners();
      setAuthReady(true);

      if (!fbUser) {
        metaDocExistsRef.current = false;
        pushedAccentSessionRef.current = '';
        setUser(null);
        setSyncStatus('signed_out');
        setState(loadLocalState());
        return;
      }

      const summary: AuthUserSummary = {
        uid: fbUser.uid,
        displayName: fbUser.displayName || 'GATE Aspirant',
        email: fbUser.email || '',
        photoURL: fbUser.photoURL,
      };
      setUser(summary);
      setSyncStatus('connecting');
      setAuthError('');
      pushedAccentSessionRef.current = '';

      const uid = fbUser.uid;
      const localAccentBeforeAuth = readLocalAccentSelection();
      const preservedTheme = stateRef.current.theme;
      const preservedThemeMode = stateRef.current.settings.themeMode ?? preservedTheme;

      try {
        // 1. Ensure Master Gate root doc /users/{uid} exists
        const userDocRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
          await setDoc(userDocRef, {
            ownerId: uid,
            displayName: summary.displayName.slice(0, 120) || 'GATE Aspirant',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // 2. Ensure /users/{uid}/meta/workspace exists (preserving current local accent theme)
        const metaRef = doc(db, 'users', uid, 'meta', 'workspace');
        const metaSnap = await getDoc(metaRef);
        if (!metaSnap.exists()) {
          const base = createInitialWarRoomState();
          base.theme = preservedTheme;
          base.settings.themeMode = preservedThemeMode;
          base.settings.accentTheme = localAccentBeforeAuth.accentTheme;
          if (localAccentBeforeAuth.accentUpdatedAt > 0) {
            base.settings.accentUpdatedAt = localAccentBeforeAuth.accentUpdatedAt;
          }
          await setDoc(metaRef, buildWorkspaceMetaPayload(uid, base), { merge: true });
        }
        metaDocExistsRef.current = true;

        // Reset in-memory state cleanly for Firestore docs while strictly preserving active local theme & profile
        const latestLocalAccent = readLocalAccentSelection();
        const latestLocalProfile = readLocalUserProfile();
        const freshForUser = createInitialWarRoomState();
        freshForUser.theme = preservedTheme;
        freshForUser.profile = latestLocalProfile;
        freshForUser.settings.themeMode = preservedThemeMode;
        freshForUser.settings.accentTheme = latestLocalAccent.accentTheme;
        freshForUser.settings.accentUpdatedAt = latestLocalAccent.accentUpdatedAt;
        setState(freshForUser);

        // 3. Attach real-time onSnapshot listeners across all user subcollections
        unsubscribes.push(
          onSnapshot(
            metaRef,
            (snap) => {
              if (!snap.exists()) return;
              metaDocExistsRef.current = true;
              const d = snap.data();

              // Race-safe accentTheme reconciliation: skip pending writes, never revert to 'brown' on missing field, enforce timestamp ordering
              const currentLocal = readLocalAccentSelection();
              const effectiveLocalTheme = currentLocal.hasExplicitLocalSelection
                ? currentLocal.accentTheme
                : normalizeAccentThemeId(stateRef.current.settings.accentTheme);
              const effectiveLocalTs = Math.max(
                currentLocal.accentUpdatedAt,
                parseAccentUpdatedAt(stateRef.current.settings.accentUpdatedAt)
              );

              const accentDecision = resolveRemoteAccentSync({
                localTheme: effectiveLocalTheme,
                localUpdatedAt: effectiveLocalTs,
                remoteTheme: d.accentTheme,
                remoteUpdatedAt: d.accentUpdatedAt,
                hasPendingWrites: snap.metadata.hasPendingWrites,
              });

              if (accentDecision.shouldApplyRemote) {
                writeLocalAccentSelection(
                  accentDecision.accentTheme,
                  accentDecision.accentUpdatedAt
                );
                applyAccentAttributeToDom(accentDecision.accentTheme);
              } else if (accentDecision.shouldPushLocalToRemote) {
                const syncKey = `${uid}:${accentDecision.accentTheme}:${accentDecision.accentUpdatedAt}`;
                if (pushedAccentSessionRef.current !== syncKey) {
                  pushedAccentSessionRef.current = syncKey;
                  const pushTs = accentDecision.accentUpdatedAt || Date.now();
                  void setDoc(
                    metaRef,
                    {
                      accentTheme: accentDecision.accentTheme,
                      accentUpdatedAt: pushTs,
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                  ).catch((err) => {
                    console.warn('Deferred accentTheme cloud sync failed; local theme preserved:', err);
                  });
                }
              }

              setState((prev) => {
                const themeVal = d.theme === 'dark' ? 'dark' : 'light';
                const themeModeVal: ThemeMode =
                  d.themeMode === 'dark' || d.themeMode === 'system' || d.themeMode === 'light'
                    ? d.themeMode
                    : themeVal;
                return {
                  ...prev,
                  theme: themeVal,
                  settings: {
                    ...prev.settings,
                    targetDateIso:
                      typeof d.targetDateIso === 'string'
                        ? d.targetDateIso
                        : prev.settings.targetDateIso,
                    shift:
                      d.shift === 'Afternoon (14:30 IST)'
                        ? 'Afternoon (14:30 IST)'
                        : 'Forenoon (09:30 IST)',
                    dailyGoalMinutes:
                      typeof d.dailyGoalMinutes === 'number'
                        ? d.dailyGoalMinutes
                        : prev.settings.dailyGoalMinutes,
                    themeMode: themeModeVal,
                    accentTheme: accentDecision.accentTheme,
                    accentUpdatedAt: accentDecision.accentUpdatedAt,
                    simpleMode:
                      typeof d.simpleMode === 'boolean'
                        ? d.simpleMode
                        : prev.settings.simpleMode,
                    uiScale:
                      d.uiScale === 'compact' || d.uiScale === 'comfortable'
                        ? d.uiScale
                        : 'default',
                    contentWidth: d.contentWidth === 'wide' ? 'wide' : 'focused',
                    pomodoroWorkMinutes:
                      typeof d.pomodoroWorkMinutes === 'number'
                        ? d.pomodoroWorkMinutes
                        : prev.settings.pomodoroWorkMinutes,
                    pomodoroShortBreakMinutes:
                      typeof d.pomodoroShortBreakMinutes === 'number'
                        ? d.pomodoroShortBreakMinutes
                        : prev.settings.pomodoroShortBreakMinutes,
                    pomodoroLongBreakMinutes:
                      typeof d.pomodoroLongBreakMinutes === 'number'
                        ? d.pomodoroLongBreakMinutes
                        : prev.settings.pomodoroLongBreakMinutes,
                    timerChimeEnabled:
                      typeof d.timerChimeEnabled === 'boolean'
                        ? d.timerChimeEnabled
                        : prev.settings.timerChimeEnabled,
                    autoHideRemoved2027:
                      typeof d.autoHideRemoved2027 === 'boolean'
                        ? d.autoHideRemoved2027
                        : prev.settings.autoHideRemoved2027,
                    autoAddWrongToMistakes:
                      typeof d.autoAddWrongToMistakes === 'boolean'
                        ? d.autoAddWrongToMistakes
                        : prev.settings.autoAddWrongToMistakes,
                    showLivePaceTimer:
                      typeof d.showLivePaceTimer === 'boolean'
                        ? d.showLivePaceTimer
                        : prev.settings.showLivePaceTimer,
                    enableKeyboardShortcuts:
                      typeof d.enableKeyboardShortcuts === 'boolean'
                        ? d.enableKeyboardShortcuts
                        : prev.settings.enableKeyboardShortcuts,
                    enableMobileSwipeNav:
                      typeof d.enableMobileSwipeNav === 'boolean'
                        ? d.enableMobileSwipeNav
                        : prev.settings.enableMobileSwipeNav,
                  },
                  lastAutopilotIstDate:
                    typeof d.lastAutopilotIstDate === 'string' ? d.lastAutopilotIstDate : '',
                  lastTrapsIstDate:
                    typeof d.lastTrapsIstDate === 'string' ? d.lastTrapsIstDate : '',
                  bookmarkedQuestions: Array.isArray(d.bookmarkedQuestions)
                    ? d.bookmarkedQuestions
                    : [],
                  bookmarkedTips: Array.isArray(d.bookmarkedTips) ? d.bookmarkedTips : [],
                };
              });
              setSyncStatus('synced');
            },
            (err) => {
              setSyncStatus('error');
              handleFirestoreError(err, OperationType.GET, `users/${uid}/meta/workspace`);
            }
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'syllabus'), where('ownerId', '==', uid)),
            (snap) => {
              const rawProgress: Record<string, SubtopicProgress> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                rawProgress[docSnap.id] = {
                  status: d.status as TopicStatus,
                  confidence: Number(d.confidence ?? 1),
                  lastRevisedAt: d.lastRevisedAt ? String(d.lastRevisedAt) : null,
                  notes: String(d.notes ?? ''),
                };
              });
              const baseProgress = {
                ...createInitialWarRoomState().progress,
                ...migrateLegacyProgressMap(rawProgress),
              };
              setState((prev) => ({ ...prev, progress: baseProgress }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/syllabus`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'study_logs'), where('ownerId', '==', uid)),
            (snap) => {
              const logs: StudyLogEntry[] = [];
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                const validType =
                  d.sessionType === 'Concept' ||
                  d.sessionType === 'PYQs' ||
                  d.sessionType === 'Mock Analysis' ||
                  d.sessionType === 'Revision'
                    ? (d.sessionType as FocusSessionType)
                    : undefined;
                logs.push({
                  id: docSnap.id,
                  date: String(d.date),
                  subjectId: normalizeSubject12(String(d.subjectId ?? ''), {
                    text: `${String(d.goal ?? '')} ${String(d.resumeNote ?? '')}`,
                  }),
                  minutes: Number(d.minutes),
                  mode: d.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro',
                  completedAt: String(d.completedAt),
                  startedAt: typeof d.startedAt === 'string' && d.startedAt ? d.startedAt : undefined,
                  sessionType: validType,
                  goal: typeof d.goal === 'string' && d.goal ? d.goal : undefined,
                  resumeNote: typeof d.resumeNote === 'string' && d.resumeNote ? d.resumeNote : undefined,
                  distractions:
                    typeof d.distractions === 'number' && Number.isFinite(d.distractions)
                      ? d.distractions
                      : undefined,
                  presetLabel:
                    typeof d.presetLabel === 'string' && d.presetLabel ? d.presetLabel : undefined,
                });
              });
              logs.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
              setState((prev) => ({ ...prev, studyLogs: logs }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/study_logs`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'attempts'), where('ownerId', '==', uid)),
            (snap) => {
              const attempts: Record<string, QuestionAttemptRecord> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                attempts[docSnap.id] = {
                  questionId: String(d.questionId ?? docSnap.id),
                  isCorrect: Boolean(d.isCorrect),
                  marksAwarded: Number(d.marksAwarded ?? 0),
                  maxMarks: Number(d.maxMarks ?? 2),
                  attemptedAt: String(d.attemptedAt ?? ''),
                  selectedAnswer: typeof d.selectedAnswer === 'string' ? d.selectedAnswer : undefined,
                };
              });
              setState((prev) => ({ ...prev, attempts }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/attempts`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'mistakes'), where('ownerId', '==', uid)),
            (snap) => {
              const mistakes: Record<string, MistakeEntry> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                mistakes[docSnap.id] = {
                  questionId: String(d.questionId ?? docSnap.id),
                  errorTag: (d.errorTag as ErrorTag) || 'Conceptual Gap',
                  wrongCount: Number(d.wrongCount ?? 0),
                  lastAttemptedAt: String(d.lastAttemptedAt ?? ''),
                  resolved: Boolean(d.resolved),
                  userNote: String(d.userNote ?? ''),
                };
              });
              setState((prev) => ({ ...prev, mistakes }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/mistakes`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'sketches'), where('ownerId', '==', uid)),
            (snap) => {
              const savedSketches: Record<string, string> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                if (typeof d.dataUrl === 'string') {
                  savedSketches[docSnap.id] = d.dataUrl;
                }
              });
              setState((prev) => ({ ...prev, savedSketches }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/sketches`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'mocks'), where('ownerId', '==', uid)),
            (snap) => {
              const mocks: MockTestEntry[] = [];
              const optNum = (v: unknown): number | undefined =>
                typeof v === 'number' && Number.isFinite(v) ? v : undefined;
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                const parsedType: MockTestEntry['type'] =
                  d.type === 'Topic-Wise Test'
                    ? 'Topic-Wise Test'
                    : d.type === 'Subject Test'
                    ? 'Subject Test'
                    : 'Full-Length Mock';
                mocks.push({
                  id: docSnap.id,
                  name: String(d.name),
                  source: String(d.source),
                  subjectId:
                    typeof d.subjectId === 'string'
                      ? migrateLegacyMockSubject(d.subjectId, String(d.name ?? ''), String(d.notes ?? ''))
                      : undefined,
                  date: String(d.date),
                  type: parsedType,
                  score: Number(d.score),
                  maxScore: Number(d.maxScore),
                  normalizedScore: optNum(d.normalizedScore),
                  percentage: optNum(d.percentage),
                  accuracy: Number(d.accuracy),
                  totalQuestions: optNum(d.totalQuestions),
                  attempted: optNum(d.attempted),
                  correct: optNum(d.correct),
                  wrong: optNum(d.wrong),
                  unattempted: Number(d.unattempted ?? 0),
                  q1Attempted: optNum(d.q1Attempted),
                  q2Attempted: optNum(d.q2Attempted),
                  q1Correct: optNum(d.q1Correct),
                  q2Correct: optNum(d.q2Correct),
                  q1Wrong: optNum(d.q1Wrong),
                  q2Wrong: optNum(d.q2Wrong),
                  q1Total: optNum(d.q1Total),
                  q2Total: optNum(d.q2Total),
                  positiveMarks: optNum(d.positiveMarks),
                  penaltyMarks: optNum(d.penaltyMarks),
                  q1PositiveMarks: optNum(d.q1PositiveMarks),
                  q2PositiveMarks: optNum(d.q2PositiveMarks),
                  q1PenaltyMarks: optNum(d.q1PenaltyMarks),
                  q2PenaltyMarks: optNum(d.q2PenaltyMarks),
                  durationMinutes: optNum(d.durationMinutes),
                  timeTakenMinutes: optNum(d.timeTakenMinutes),
                  rank: optNum(d.rank),
                  totalCandidates: optNum(d.totalCandidates),
                  percentile: optNum(d.percentile),
                  parseSource:
                    d.parseSource === 'local_deterministic' ||
                    d.parseSource === 'ai_free_tier' ||
                    d.parseSource === 'manual'
                      ? d.parseSource
                      : undefined,
                  notes: String(d.notes ?? ''),
                });
              });
              mocks.sort((a, b) => a.date.localeCompare(b.date));
              setState((prev) => ({ ...prev, mocks }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/mocks`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'custom_tips'), where('ownerId', '==', uid)),
            (snap) => {
              const tips: TipItem[] = [];
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                tips.push(
                  migrateLegacyTip({
                    id: docSnap.id,
                    subjectId: d.subjectId as SubjectId,
                    title: String(d.title),
                    category: d.category as TipItem['category'],
                    summary: String(d.summary ?? ''),
                    detail: String(d.detail),
                    formula: d.formula ? String(d.formula) : undefined,
                    sourceUrl: d.sourceUrl ? String(d.sourceUrl) : undefined,
                    isCustom: true,
                  })
                );
              });
              setState((prev) => ({ ...prev, customTips: tips }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/custom_tips`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'pyq_bank'), where('ownerId', '==', uid)),
            (snap) => {
              const qs: Question[] = [];
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                qs.push(
                  migrateLegacyQuestion({
                    id: docSnap.id,
                    subjectId: d.subjectId as SubjectId,
                    subtopic: String(d.subtopic),
                    format: d.format as Question['format'],
                    marks: d.marks === 1 ? 1 : 2,
                    difficulty: d.difficulty as Question['difficulty'],
                    sourceTag: String(d.sourceTag),
                    sourceUrl: d.sourceUrl ? String(d.sourceUrl) : undefined,
                    prompt: String(d.prompt),
                    codeSnippet: d.codeSnippet ? String(d.codeSnippet) : undefined,
                    options:
                      Array.isArray(d.options) && d.options.length > 0 ? d.options : undefined,
                    correctOption: d.correctOption ? String(d.correctOption) : undefined,
                    correctOptions:
                      Array.isArray(d.correctOptions) && d.correctOptions.length > 0
                        ? d.correctOptions
                        : undefined,
                    natAnswer: d.format === 'NAT' ? Number(d.natAnswer ?? 0) : undefined,
                    natTolerance: d.format === 'NAT' ? Number(d.natTolerance ?? 0.01) : undefined,
                    natUnit: d.natUnit ? String(d.natUnit) : undefined,
                    explanation: String(d.explanation),
                    wrongOptionAnalysis: String(d.wrongOptionAnalysis ?? ''),
                    fingerprint: d.fingerprint ? String(d.fingerprint) : undefined,
                    isCustom: true,
                  })
                );
              });
              setState((prev) => ({ ...prev, customQuestions: qs }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/pyq_bank`)
          )
        );
        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'verified_answers'), where('ownerId', '==', uid)),
            (snap) => {
              const verifiedAnswers: Record<string, VerifiedAnswerRecord> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                verifiedAnswers[docSnap.id] = {
                  questionId: String(d.questionId ?? docSnap.id),
                  format: (d.format as VerifiedAnswerRecord['format']) || 'MCQ',
                  correctOption: d.correctOption ? String(d.correctOption) : undefined,
                  correctOptions:
                    Array.isArray(d.correctOptions) && d.correctOptions.length > 0
                      ? d.correctOptions.map(String)
                      : undefined,
                  natAnswer: d.format === 'NAT' ? Number(d.natAnswer ?? 0) : undefined,
                  natTolerance: d.format === 'NAT' ? Number(d.natTolerance ?? 0.01) : undefined,
                  explanation: String(d.explanation ?? ''),
                  wrongOptionAnalysis: String(d.wrongOptionAnalysis ?? ''),
                  source: d.source === 'ai' ? 'ai' : 'manual',
                  updatedAt: new Date().toISOString(),
                };
              });
              setState((prev) => ({
                ...prev,
                verifiedAnswers: mergeCommunityAndLocalVerifiedKeys(
                  communityKeysRef.current,
                  verifiedAnswers
                ),
              }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/verified_answers`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'traps_vault'), where('ownerId', '==', uid)),
            (snap) => {
              const traps: TipItem[] = [];
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                traps.push(
                  migrateLegacyTip({
                    id: docSnap.id,
                    subjectId: d.subjectId as SubjectId,
                    title: String(d.title),
                    category: d.category as TipItem['category'],
                    summary: String(d.summary ?? ''),
                    detail: String(d.detail ?? ''),
                    formula: d.formula ? String(d.formula) : undefined,
                    trapSource: (d.trapSource as TrapSourceType) || 'ai_daily',
                    generatedDateIst: d.generatedDateIst ? String(d.generatedDateIst) : undefined,
                    sourceQuestionId: d.sourceQuestionId ? String(d.sourceQuestionId) : undefined,
                    isCustom: true,
                  })
                );
              });
              traps.sort((a, b) => (b.generatedDateIst ?? '').localeCompare(a.generatedDateIst ?? ''));
              setState((prev) => ({ ...prev, trapsVault: traps }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/traps_vault`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'srs_cards'), where('ownerId', '==', uid)),
            (snap) => {
              const srsCards: Record<string, SrsCardRecord> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                const iv = Number(d.intervalDays);
                const safeInterval: 1 | 3 | 7 | 14 =
                  iv === 14 ? 14 : iv === 7 ? 7 : iv === 3 ? 3 : 1;
                srsCards[docSnap.id] = {
                  cardId: String(d.cardId ?? docSnap.id),
                  itemType: d.itemType === 'mistake' ? 'mistake' : 'trap',
                  itemId: String(d.itemId ?? ''),
                  intervalDays: safeInterval,
                  nextReviewDate: String(d.nextReviewDate ?? toLocalIsoDate()),
                  lastRating:
                    d.lastRating === 'mastered'
                      ? 'mastered'
                      : d.lastRating === 'hard'
                      ? 'hard'
                      : 'good',
                  reviewCount: Number(d.reviewCount ?? 1),
                  updatedAt: new Date().toISOString(),
                };
              });
              setState((prev) => ({ ...prev, srsCards }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/srs_cards`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'ga_streak'), where('ownerId', '==', uid)),
            (snap) => {
              const gaStreakLogs: Record<string, GaStreakEntry> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                const dateKey = String(d.date ?? docSnap.id);
                gaStreakLogs[dateKey] = {
                  date: dateKey,
                  completedAt: String(d.completedAt ?? ''),
                  questionsCount: Number(d.questionsCount ?? 5),
                  correctCount: Number(d.correctCount ?? 0),
                  marksAwarded: Number(d.marksAwarded ?? 0),
                  maxMarks: Number(d.maxMarks ?? 8),
                  accuracyPct: Number(d.accuracyPct ?? 0),
                  durationSeconds: Number(d.durationSeconds ?? 0),
                };
              });
              setState((prev) => ({ ...prev, gaStreakLogs }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/ga_streak`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'trace_tables'), where('ownerId', '==', uid)),
            (snap) => {
              const traceTables: Record<string, DryRunTraceTable> = {};
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                const cols = Array.isArray(d.columns) ? d.columns.map(String) : [];
                const rows: DryRunTraceRow[] = Array.isArray(d.rows)
                  ? d.rows.map((r: unknown, idx: number) => {
                      const obj = (r ?? {}) as { id?: unknown; cells?: unknown };
                      return {
                        id: String(obj.id || `row_${idx}`),
                        cells: Array.isArray(obj.cells) ? obj.cells.map(String) : [],
                      };
                    })
                  : [];
                traceTables[docSnap.id] = {
                  questionId: String(d.questionId ?? docSnap.id),
                  columns: cols,
                  rows,
                  presetName: typeof d.presetName === 'string' ? d.presetName : 'Custom',
                  updatedAt: new Date().toISOString(),
                };
              });
              setState((prev) => ({ ...prev, traceTables }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/trace_tables`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'vault_packs'), where('ownerId', '==', uid)),
            (snap) => {
              const packs: VaultPack[] = [];
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                const rawCards = Array.isArray(d.cards)
                  ? (d.cards as VaultCard[]).map(migrateLegacyVaultCard)
                  : [];
                if (rawCards.length === 0) return;
                const createdMs =
                  typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : Date.now();
                const updatedMs =
                  typeof d.updatedAt?.toMillis === 'function' ? d.updatedAt.toMillis() : createdMs;
                packs.push({
                  packId: String(d.packId ?? docSnap.id),
                  name: String(d.name ?? 'Imported Pack'),
                  source:
                    d.source === 'GitHub Sync' || d.source === 'Custom'
                      ? d.source
                      : 'JSON Import',
                  sourceUrl: typeof d.sourceUrl === 'string' && d.sourceUrl ? d.sourceUrl : undefined,
                  cardCount: rawCards.length,
                  cards: rawCards,
                  createdAt: createdMs,
                  updatedAt: updatedMs,
                });
              });
              packs.sort((a, b) => b.updatedAt - a.updatedAt);
              setState((prev) => ({ ...prev, vaultPacks: packs }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/vault_packs`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            doc(db, 'users', uid, 'daily_progress', 'tracker'),
            (snap) => {
              if (!snap.exists()) return;
              const d = snap.data();
              setState((prev) => ({
                ...prev,
                dailyProgress: {
                  usedDailyDppIds: Array.isArray(d.usedDailyDppIds)
                    ? d.usedDailyDppIds.map(String)
                    : [],
                  usedDailyGaIds: Array.isArray(d.usedDailyGaIds)
                    ? d.usedDailyGaIds.map(String)
                    : [],
                  dailyDppByDate:
                    d.dailyDppByDate && typeof d.dailyDppByDate === 'object'
                      ? (d.dailyDppByDate as Record<string, DailyTestRecord>)
                      : {},
                  dailyGaByDate:
                    d.dailyGaByDate && typeof d.dailyGaByDate === 'object'
                      ? (d.dailyGaByDate as Record<string, DailyTestRecord>)
                      : {},
                },
              }));
            },
            (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/daily_progress/tracker`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            doc(db, 'users', uid, 'rough_work', 'main'),
            (snap) => {
              if (!snap.exists()) return;
              const d = snap.data();
              if (!Array.isArray(d.sheets) || d.sheets.length === 0) return;
              const sheets = d.sheets.slice(0, 12).map((s: unknown, idx: number) => {
                const obj = (s ?? {}) as Record<string, unknown>;
                return {
                  id: typeof obj.id === 'string' && obj.id ? obj.id : `sheet-${idx + 1}`,
                  name: typeof obj.name === 'string' && obj.name ? obj.name : `Sheet ${idx + 1}`,
                  paperStyle:
                    obj.paperStyle === 'grid' || obj.paperStyle === 'blank'
                      ? (obj.paperStyle as 'grid' | 'blank')
                      : ('dot' as const),
                  dataUrl: typeof obj.dataUrl === 'string' ? obj.dataUrl : '',
                  updatedAt:
                    typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
                };
              });
              const activeSheetId =
                typeof d.activeSheetId === 'string' && sheets.some((s) => s.id === d.activeSheetId)
                  ? d.activeSheetId
                  : sheets[0].id;
              setStandaloneRoughWork({
                activeSheetId,
                sheets,
                updatedAt: new Date().toISOString(),
              });
            },
            (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/rough_work/main`)
          )
        );

        unsubscribes.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'test_history'), where('ownerId', '==', uid)),
            (snap) => {
              const entries: TestHistoryEntry[] = [];
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                const responsesObj: Record<string, string> = {};
                if (d.responses && typeof d.responses === 'object') {
                  for (const [k, v] of Object.entries(d.responses as Record<string, unknown>)) {
                    if (typeof v === 'string') responsesObj[k] = v;
                  }
                }
                const completedAtStr = String(d.completedAt ?? new Date().toISOString());
                const dateStr =
                  typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
                    ? d.date
                    : completedAtStr.slice(0, 10);
                entries.push({
                  id: String(d.testId ?? d.id ?? docSnap.id),
                  title: String(d.title ?? 'PYQ Practice Test'),
                  mode:
                    d.mode === 'daily_dpp' ||
                    d.mode === 'daily_ga' ||
                    d.mode === 'concept_drill' ||
                    d.mode === 'timed' ||
                    d.mode === 'practice'
                      ? d.mode
                      : 'practice',
                  date: dateStr,
                  completedAt: completedAtStr,
                  durationSeconds: Number(d.durationSeconds ?? 0),
                  questionIds: Array.isArray(d.questionIds) ? d.questionIds.map(String) : [],
                  responses: responsesObj,
                  gradedMarks: Number(d.gradedMarks ?? d.score ?? 0),
                  gradedMaxMarks: Number(d.gradedMaxMarks ?? 0),
                  totalMaxMarks: Number(d.totalMaxMarks ?? 0),
                  gradedCount: Number(d.gradedCount ?? 0),
                  gradedAttemptedCount: Number(d.gradedAttemptedCount ?? d.attemptedCount ?? 0),
                  pendingKeyCount: Number(d.pendingKeyCount ?? 0),
                  correctCount: Number(d.correctCount ?? 0),
                  wrongCount: Number(d.wrongCount ?? 0),
                  unattemptedCount: Number(d.unattemptedCount ?? 0),
                  penaltyMarks: Number(d.penaltyMarks ?? 0),
                  accuracyPct: Number(d.accuracyPct ?? d.accuracy ?? 0),
                });
              });
              entries.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
              setState((prev) => ({ ...prev, testHistory: entries }));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/test_history`)
          )
        );

        // Real-time Profile listener (/users/{uid}/profile/main)
        const profileRef = doc(db, 'users', uid, 'profile', 'main');
        unsubscribes.push(
          onSnapshot(
            profileRef,
            (snap) => {
              if (!snap.exists()) return;
              if (snap.metadata.hasPendingWrites) return;
              const remoteProfile = sanitizeUserProfile(snap.data());
              const currentLocal = stateRef.current.profile ?? readLocalUserProfile();
              if (shouldApplyRemoteProfile(currentLocal, remoteProfile)) {
                writeLocalUserProfile(remoteProfile);
                setState((prev) => ({ ...prev, profile: remoteProfile }));
              }
            },
            (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/profile/main`)
          )
        );
      } catch (err) {
        setSyncStatus('error');
        console.error('Firestore bootstrap failed:', err);
      }
    });

    return () => {
      unsubAuth();
      clearListeners();
    };
  }, [buildWorkspaceMetaPayload]);

  // Cache-First: Unified IndexedDB GateR + Arshan bank + Firestore custom PYQs + curated baseline, overlaid with verifiedAnswers
  const allQuestions = useMemo(() => {
    const verifiedMap = state.verifiedAnswers;
    const curatedWithKeys = GATE_QUESTION_BANK.map((q) => ({
      ...q,
      hasAnswerKey: true,
      sourceRepo: q.sourceRepo ?? ('seed' as const),
      sourceCategory: q.sourceCategory ?? ('PYQ' as const),
    }));
    const customWithKeys = state.customQuestions.map((q) => ({
      ...q,
      sourceRepo: q.sourceRepo ?? ('custom' as const),
      sourceCategory: q.sourceCategory ?? ('EXTRA_PRACTICE' as const),
      hasAnswerKey:
        q.hasAnswerKey ??
        Boolean(
          q.correctOption ||
            (q.correctOptions && q.correctOptions.length > 0) ||
            typeof q.natAnswer === 'number'
        ),
    }));

    const combined: Question[] = [];
    for (const list of [gaterQuestions, customWithKeys, curatedWithKeys]) {
      for (const q of list) {
        const verified = verifiedMap[q.id];
        combined.push(verified ? applyVerifiedAnswer(q, verified) : q);
      }
    }

    return deduplicateQuestionPool(combined);
  }, [gaterQuestions, state.customQuestions, state.verifiedAnswers]);

  allQuestionsRef.current = allQuestions;

  const verifiedBankCount = useMemo(
    () => allQuestions.filter((q) => questionHasAnswerKey(q)).length,
    [allQuestions]
  );

  // Merge incoming community verified_keys docs into state & recalculate any affected testHistory/dailyProgress live
  const applyCommunityDocsToStore = useCallback(
    (docsMap: Record<string, CommunityVerifiedKeyDoc>) => {
      const mergedDocs: Record<string, CommunityVerifiedKeyDoc> = {
        ...communityDocsRef.current,
      };
      for (const [keyId, docData] of Object.entries(docsMap)) {
        const prevDoc = mergedDocs[keyId];
        if (!prevDoc || (docData.updatedAt ?? 0) >= (prevDoc.updatedAt ?? 0)) {
          mergedDocs[keyId] = docData;
        }
      }
      communityDocsRef.current = mergedDocs;

      const formatByQid = new Map<string, Question['format']>();
      const baseQMap = new Map<string, Question>();
      for (const q of allQuestionsRef.current) {
        formatByQid.set(q.id, q.format);
        baseQMap.set(q.id, q);
      }

      const converted: Record<string, VerifiedAnswerRecord> = {};
      for (const [docKey, docData] of Object.entries(mergedDocs)) {
        const qId = docData.questionId || docKey;
        const rec = communityKeyDocToVerifiedRecord(docData, formatByQid.get(qId));
        if (rec) {
          converted[rec.questionId] = rec;
        }
      }
      communityKeysRef.current = converted;

      const changedHistoryEntries: TestHistoryEntry[] = [];

      setState((prev) => {
        const nextVerified = mergeCommunityAndLocalVerifiedKeys(converted, prev.verifiedAnswers);

        // Build live question map with latest merged keys
        const liveMap = new Map<string, Question>();
        for (const [id, q] of baseQMap.entries()) {
          const v = nextVerified[id];
          liveMap.set(id, v ? applyVerifiedAnswer(q, v) : q);
        }

        let historyChanged = false;
        const nextTestHistory = prev.testHistory.map((entry) => {
          const touchesConverted = entry.questionIds.some((id) => Boolean(converted[id]));
          if (!touchesConverted) return entry;
          const recalc = recalculateTestHistoryEntry(entry, liveMap);
          const didChange =
            recalc.gradedMarks !== entry.gradedMarks ||
            recalc.gradedMaxMarks !== entry.gradedMaxMarks ||
            recalc.pendingKeyCount !== entry.pendingKeyCount ||
            recalc.correctCount !== entry.correctCount ||
            recalc.wrongCount !== entry.wrongCount ||
            recalc.accuracyPct !== entry.accuracyPct;
          if (didChange) {
            historyChanged = true;
            changedHistoryEntries.push(recalc);
            return recalc;
          }
          return entry;
        });

        let dailyChanged = false;
        const recalcDailyMap = (map: Record<string, DailyTestRecord>) => {
          const nextMap: Record<string, DailyTestRecord> = { ...map };
          for (const [dateKey, rec] of Object.entries(map)) {
            if (!rec.completedAt || !rec.responses) continue;
            if (!rec.questionIds.some((id) => Boolean(converted[id]))) continue;
            const qs = rec.questionIds
              .map((id) => liveMap.get(id))
              .filter((q): q is Question => Boolean(q));
            if (qs.length === 0) continue;
            const parsedResponses: Record<string, ReturnType<typeof parseSerializedResponse>> = {};
            for (const q of qs) {
              parsedResponses[q.id] = parseSerializedResponse(q.format, rec.responses[q.id]);
            }
            const summary = gradeTestSessionStrict(qs, parsedResponses);
            if (
              summary.gradedMarks !== rec.score ||
              summary.pendingKeyCount !== (rec.pendingKeyCount ?? 0) ||
              summary.accuracyPct !== rec.accuracy
            ) {
              nextMap[dateKey] = {
                ...rec,
                score: summary.gradedMarks,
                maxMarks: summary.totalMaxMarks,
                gradedMaxMarks: summary.gradedMaxMarks,
                pendingKeyCount: summary.pendingKeyCount,
                accuracy: summary.accuracyPct,
                attemptedCount: summary.gradedAttemptedCount + summary.pendingAttemptedCount,
                correctCount: summary.correctCount,
              };
              dailyChanged = true;
            }
          }
          return nextMap;
        };

        const nextDailyProgress: DailyProgressState = {
          ...prev.dailyProgress,
          dailyDppByDate: recalcDailyMap(prev.dailyProgress.dailyDppByDate),
          dailyGaByDate: recalcDailyMap(prev.dailyProgress.dailyGaByDate),
        };

        return {
          ...prev,
          verifiedAnswers: nextVerified,
          testHistory: historyChanged ? nextTestHistory : prev.testHistory,
          dailyProgress: dailyChanged ? nextDailyProgress : prev.dailyProgress,
        };
      });

      // Persist recalculated test_history rows to Firestore when signed in
      const uid = userRef.current?.uid;
      if (uid && changedHistoryEntries.length > 0) {
        for (const updatedEntry of changedHistoryEntries) {
          const histDocId = sanitizeDocId(updatedEntry.id);
          const histPath = `users/${uid}/test_history/${histDocId}`;
          updateDoc(doc(db, 'users', uid, 'test_history', histDocId), {
            responses: updatedEntry.responses,
            gradedMarks: updatedEntry.gradedMarks,
            gradedMaxMarks: updatedEntry.gradedMaxMarks,
            totalMaxMarks: updatedEntry.totalMaxMarks,
            gradedCount: updatedEntry.gradedCount,
            gradedAttemptedCount: updatedEntry.gradedAttemptedCount,
            pendingKeyCount: updatedEntry.pendingKeyCount,
            correctCount: updatedEntry.correctCount,
            wrongCount: updatedEntry.wrongCount,
            unattemptedCount: updatedEntry.unattemptedCount,
            penaltyMarks: updatedEntry.penaltyMarks,
            accuracyPct: updatedEntry.accuracyPct,
            updatedAt: serverTimestamp(),
          }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, histPath));
        }
      }
    },
    []
  );

  // Global Open Community Official Answer Keys: Instant IndexedDB hydration + live Firestore onSnapshot for ALL users
  useEffect(() => {
    let active = true;

    void readCommunityKeysCache().then((cachedDocs) => {
      if (!active) return;
      if (Object.keys(cachedDocs).length > 0) {
        applyCommunityDocsToStore(cachedDocs);
      }
    });

    const unsub = onSnapshot(
      query(collection(db, 'verified_keys'), limit(5000)),
      (snap) => {
        if (!active) return;
        const docsMap: Record<string, CommunityVerifiedKeyDoc> = {};
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const qId = typeof d.questionId === 'string' && d.questionId ? d.questionId : docSnap.id;
          const correctAnswer = d.correctAnswer;
          const validAnswer =
            (typeof correctAnswer === 'string' && correctAnswer.trim().length > 0) ||
            (Array.isArray(correctAnswer) && correctAnswer.length > 0);
          if (!validAnswer) return;
          docsMap[qId] = {
            questionId: qId,
            correctAnswer: Array.isArray(correctAnswer)
              ? correctAnswer.map(String)
              : String(correctAnswer),
            ...(typeof d.explanation === 'string' && d.explanation.trim()
              ? { explanation: d.explanation.trim() }
              : {}),
            ...(typeof d.updatedByName === 'string' && d.updatedByName.trim()
              ? { updatedByName: d.updatedByName.trim() }
              : {}),
            updatedAt:
              typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt)
                ? d.updatedAt
                : Date.now(),
          };
        });
        void writeCommunityKeysCache({ ...communityDocsRef.current, ...docsMap });
        if (Object.keys(docsMap).length > 0) {
          applyCommunityDocsToStore(docsMap);
        }
      },
      (err) => {
        console.warn('Community verified_keys listener notice:', err);
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [applyCommunityDocsToStore]);

  // Re-apply cached community keys once GateR PYQ bank finishes hydrating so all formats & testHistory recalc cleanly
  useEffect(() => {
    if (gaterQuestions.length > 0 && Object.keys(communityDocsRef.current).length > 0) {
      applyCommunityDocsToStore(communityDocsRef.current);
    }
  }, [gaterQuestions.length, applyCommunityDocsToStore]);

  // Unified Vault Cards: Imported/GitHub Packs + Mined Mistakes (₹0) + Legacy Custom/Traps + 132-Card Master Bundle
  const allVaultCards = useMemo<VaultCard[]>(() => {
    const seen = new Set<string>();
    const merged: VaultCard[] = [];

    const pushUnique = (card: VaultCard) => {
      const fp = cardFingerprint(card.subject, card.title);
      if (seen.has(fp)) return;
      seen.add(fp);
      merged.push(card);
    };

    // 1. User's Bulk JSON Imported & GitHub-Synced Packs (highest priority so user edits/packs surface cleanly)
    for (const pack of state.vaultPacks) {
      for (const card of pack.cards) {
        pushUnique({ ...card, packId: pack.packId, packName: pack.name });
      }
    }

    // 2. Auto-mined local cards from unresolved Mistake Bucket (100% local, ₹0)
    const mistakeCards = mineMistakesToVaultCards(state.mistakes, allQuestions);
    for (const mc of mistakeCards) {
      pushUnique(mc);
    }

    // 3. Legacy customTips & trapsVault cards (preserved for full backward compatibility)
    for (const t of state.customTips) {
      pushUnique(tipItemToVaultCard(t, 'Custom'));
    }
    for (const t of state.trapsVault) {
      pushUnique(tipItemToVaultCard(t, t.trapSource === 'mistake_mined' ? 'My Mistakes' : 'Custom'));
    }

    // 4. Built-in 132-Card Offline Master Bundle (all 11 IIT Madras GATE CSE 2027 subjects)
    for (const masterCard of GATE_2027_MASTER_VAULT) {
      pushUnique(masterCard);
    }

    return merged;
  }, [state.vaultPacks, state.mistakes, allQuestions, state.customTips, state.trapsVault]);

  // Legacy TipItem view derived from unified Vault so DashboardView & RapidRevisionView enjoy all 132+ cards seamlessly
  const allTips = useMemo<TipItem[]>(
    () => allVaultCards.map(vaultCardToTipItem),
    [allVaultCards]
  );

  const existingFingerprints = useMemo(
    () =>
      [...state.customQuestions, ...GATE_QUESTION_BANK].map(
        (q) => q.fingerprint || computeQuestionFingerprint(q.prompt)
      ),
    [state.customQuestions]
  );

  // Auth Actions (Google Sign-In ONLY)
  const handleSignInGoogle = useCallback(async () => {
    setAuthError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In cancelled or blocked.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setAuthError('');
    try {
      await signOutUser();
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  }, []);

  // ===================== MUTATION ACTIONS (REAL-TIME FIRESTORE + LOCAL) =====================

  const toggleTheme = useCallback(() => {
    const nextTheme = stateRef.current.theme === 'dark' ? 'light' : 'dark';
    const next: WarRoomState = {
      ...stateRef.current,
      theme: nextTheme,
      settings: {
        ...stateRef.current.settings,
        themeMode: nextTheme,
      },
    };
    setState(next);
    void persistWorkspaceMeta(next);
  }, [persistWorkspaceMeta]);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      const resolvedTheme =
        mode === 'system'
          ? typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : mode;
      const next: WarRoomState = {
        ...stateRef.current,
        theme: resolvedTheme,
        settings: {
          ...stateRef.current.settings,
          themeMode: mode,
        },
      };
      setState(next);
      void persistWorkspaceMeta(next);
    },
    [persistWorkspaceMeta]
  );

  const setAccentTheme = useCallback(
    (accent: AccentThemeId) => {
      const safe = normalizeAccentThemeId(accent);
      const prevTs = Math.max(
        readLocalAccentSelection().accentUpdatedAt,
        parseAccentUpdatedAt(stateRef.current.settings.accentUpdatedAt)
      );
      const nowMs = Math.max(Date.now(), prevTs + 1);

      // 1. Immediately persist to localStorage & apply synchronously to <html data-accent="...">
      writeLocalAccentSelection(safe, nowMs);
      applyAccentAttributeToDom(safe);

      // 2. Immediately update React state & ref
      const next: WarRoomState = {
        ...stateRef.current,
        settings: {
          ...stateRef.current.settings,
          accentTheme: safe,
          accentUpdatedAt: nowMs,
        },
      };
      stateRef.current = next;
      setState(next);

      // 3. Immediately write to Firestore via merge (zero debounce; never reverts local state on offline/error)
      const uid = userRef.current?.uid;
      if (!uid) return;
      const metaRef = doc(db, 'users', uid, 'meta', 'workspace');
      const writePromise = metaDocExistsRef.current
        ? setDoc(
            metaRef,
            {
              accentTheme: safe,
              accentUpdatedAt: nowMs,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        : setDoc(metaRef, buildWorkspaceMetaPayload(uid, next), { merge: true }).then(() => {
            metaDocExistsRef.current = true;
          });

      void writePromise.catch((err) => {
        console.warn('Firestore accentTheme write failed; preserving localStorage theme:', err);
      });
    },
    [buildWorkspaceMetaPayload]
  );

  const setSimpleMode = useCallback(
    (enabled: boolean) => {
      const next: WarRoomState = {
        ...stateRef.current,
        settings: {
          ...stateRef.current.settings,
          simpleMode: Boolean(enabled),
        },
      };
      setState(next);
      void persistWorkspaceMeta(next);
    },
    [persistWorkspaceMeta]
  );

  const saveStandaloneRoughWork = useCallback(
    (nextRough: StandaloneRoughWorkState) => {
      setStandaloneRoughWork(nextRough);
      void persistStandaloneRoughWork(nextRough);
    },
    [persistStandaloneRoughWork]
  );

  const writeSubtopicProgress = useCallback(async (subtopicId: string, entry: SubtopicProgress) => {
    const uid = userRef.current?.uid;
    if (!uid) return;
    const docId = sanitizeDocId(subtopicId);
    const path = `users/${uid}/syllabus/${docId}`;
    try {
      await setDoc(doc(db, 'users', uid, 'syllabus', docId), {
        ownerId: uid,
        subtopicId: docId,
        status: entry.status,
        confidence: Math.max(1, Math.min(5, Math.round(entry.confidence || 1))),
        lastRevisedAt: (entry.lastRevisedAt ?? '').slice(0, 40),
        notes: (entry.notes ?? '').slice(0, 4000),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const cycleSubtopicStatus = useCallback(
    (subtopicId: string) => {
      const curr = stateRef.current.progress[subtopicId] ?? {
        status: 'not_started' as TopicStatus,
        confidence: 1,
        lastRevisedAt: null,
        notes: '',
      };
      const nextStatus = nextTopicStatus(curr.status);
      const updated: SubtopicProgress = {
        ...curr,
        status: nextStatus,
        lastRevisedAt: nextStatus === 'not_started' ? null : new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        progress: { ...prev.progress, [subtopicId]: updated },
      }));
      void writeSubtopicProgress(subtopicId, updated);
    },
    [writeSubtopicProgress]
  );

  const setSubtopicConfidence = useCallback(
    (subtopicId: string, confidence: number) => {
      const curr = stateRef.current.progress[subtopicId] ?? {
        status: 'not_started' as TopicStatus,
        confidence: 1,
        lastRevisedAt: null,
        notes: '',
      };
      const updated: SubtopicProgress = { ...curr, confidence };
      setState((prev) => ({
        ...prev,
        progress: { ...prev.progress, [subtopicId]: updated },
      }));
      void writeSubtopicProgress(subtopicId, updated);
    },
    [writeSubtopicProgress]
  );

  const markSubtopicRevised = useCallback(
    (subtopicId: string) => {
      const curr = stateRef.current.progress[subtopicId];
      if (!curr) return;
      const updated: SubtopicProgress = {
        ...curr,
        status: curr.status === 'not_started' ? 'concept_done' : curr.status,
        lastRevisedAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        progress: { ...prev.progress, [subtopicId]: updated },
      }));
      void writeSubtopicProgress(subtopicId, updated);
    },
    [writeSubtopicProgress]
  );

  const saveSubtopicNotes = useCallback(
    (subtopicId: string, notes: string) => {
      const curr = stateRef.current.progress[subtopicId] ?? {
        status: 'not_started' as TopicStatus,
        confidence: 1,
        lastRevisedAt: null,
        notes: '',
      };
      const updated: SubtopicProgress = { ...curr, notes };
      setState((prev) => ({
        ...prev,
        progress: { ...prev.progress, [subtopicId]: updated },
      }));
      void writeSubtopicProgress(subtopicId, updated);
    },
    [writeSubtopicProgress]
  );

  const logStudySession = useCallback(
    (
      subjectId: SubjectId,
      minutes: number,
      mode: 'pomodoro' | 'stopwatch',
      meta?: {
        startedAt?: string;
        sessionType?: FocusSessionType;
        goal?: string;
        resumeNote?: string;
        distractions?: number;
        presetLabel?: string;
      }
    ): StudyLogEntry | null => {
      if (minutes <= 0) return null;
      const rounded = Math.max(1, Math.min(720, Math.round(minutes)));
      const now = new Date();
      const cleanStartedAt = meta?.startedAt ? meta.startedAt.slice(0, 40) : undefined;
      const cleanGoal = meta?.goal?.trim() ? meta.goal.trim().slice(0, 200) : undefined;
      const cleanResume = meta?.resumeNote?.trim() ? meta.resumeNote.trim().slice(0, 300) : undefined;
      const cleanPreset = meta?.presetLabel?.trim() ? meta.presetLabel.trim().slice(0, 64) : undefined;
      const cleanDistractions =
        typeof meta?.distractions === 'number' && Number.isFinite(meta.distractions)
          ? Math.max(0, Math.min(500, Math.round(meta.distractions)))
          : undefined;
      const cleanSessionType: FocusSessionType | undefined =
        meta?.sessionType === 'Concept' ||
        meta?.sessionType === 'PYQs' ||
        meta?.sessionType === 'Mock Analysis' ||
        meta?.sessionType === 'Revision'
          ? meta.sessionType
          : undefined;

      const entry: StudyLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: toLocalIsoDate(now),
        subjectId,
        minutes: rounded,
        mode,
        completedAt: now.toISOString(),
        startedAt: cleanStartedAt,
        sessionType: cleanSessionType,
        goal: cleanGoal,
        resumeNote: cleanResume,
        distractions: cleanDistractions,
        presetLabel: cleanPreset,
      };

      setState((prev) => ({
        ...prev,
        studyLogs: [...prev.studyLogs, entry],
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        const path = `users/${uid}/study_logs/${entry.id}`;
        const firestorePayload: Record<string, unknown> = {
          ownerId: uid,
          date: entry.date,
          subjectId: entry.subjectId,
          minutes: entry.minutes,
          mode: entry.mode,
          completedAt: entry.completedAt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (cleanStartedAt) firestorePayload.startedAt = cleanStartedAt;
        if (cleanSessionType) firestorePayload.sessionType = cleanSessionType;
        if (cleanGoal) firestorePayload.goal = cleanGoal;
        if (cleanResume) firestorePayload.resumeNote = cleanResume;
        if (typeof cleanDistractions === 'number') firestorePayload.distractions = cleanDistractions;
        if (cleanPreset) firestorePayload.presetLabel = cleanPreset;

        setDoc(doc(db, 'users', uid, 'study_logs', entry.id), firestorePayload).catch((err) =>
          handleFirestoreError(err, OperationType.CREATE, path)
        );
      }

      return entry;
    },
    []
  );

  const updateStudyLog = useCallback(
    (
      logId: string,
      patch: {
        resumeNote?: string;
        goal?: string;
        sessionType?: FocusSessionType;
      }
    ) => {
      const cleanResume =
        patch.resumeNote !== undefined ? patch.resumeNote.trim().slice(0, 300) : undefined;
      const cleanGoal = patch.goal !== undefined ? patch.goal.trim().slice(0, 200) : undefined;
      const cleanType =
        patch.sessionType === 'Concept' ||
        patch.sessionType === 'PYQs' ||
        patch.sessionType === 'Mock Analysis' ||
        patch.sessionType === 'Revision'
          ? patch.sessionType
          : undefined;

      setState((prev) => ({
        ...prev,
        studyLogs: prev.studyLogs.map((log) => {
          if (log.id !== logId) return log;
          return {
            ...log,
            ...(cleanResume !== undefined ? { resumeNote: cleanResume } : {}),
            ...(cleanGoal !== undefined ? { goal: cleanGoal } : {}),
            ...(cleanType !== undefined ? { sessionType: cleanType } : {}),
          };
        }),
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        const docId = sanitizeDocId(logId);
        const path = `users/${uid}/study_logs/${docId}`;
        const firestorePatch: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };
        if (cleanResume !== undefined) firestorePatch.resumeNote = cleanResume;
        if (cleanGoal !== undefined) firestorePatch.goal = cleanGoal;
        if (cleanType !== undefined) firestorePatch.sessionType = cleanType;

        updateDoc(doc(db, 'users', uid, 'study_logs', docId), firestorePatch).catch((err) =>
          handleFirestoreError(err, OperationType.UPDATE, path)
        );
      }
    },
    []
  );

  const deleteStudyLog = useCallback((logId: string) => {
    setState((prev) => ({
      ...prev,
      studyLogs: prev.studyLogs.filter((l) => l.id !== logId),
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(logId);
      const path = `users/${uid}/study_logs/${docId}`;
      deleteDoc(doc(db, 'users', uid, 'study_logs', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    }
  }, []);

  const writeMistakeEntry = useCallback(async (questionId: string, entry: MistakeEntry) => {
    const uid = userRef.current?.uid;
    if (!uid) return;
    const docId = sanitizeDocId(questionId);
    const path = `users/${uid}/mistakes/${docId}`;
    try {
      await setDoc(doc(db, 'users', uid, 'mistakes', docId), {
        ownerId: uid,
        questionId: docId,
        errorTag: entry.errorTag,
        wrongCount: Math.max(0, Math.min(1000, Math.round(entry.wrongCount))),
        lastAttemptedAt: entry.lastAttemptedAt.slice(0, 40),
        resolved: Boolean(entry.resolved),
        userNote: (entry.userNote ?? '').slice(0, 2000),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const recordQuestionAttempt = useCallback(
    (
      questionId: string,
      isCorrect: boolean,
      marksAwarded: number,
      maxMarks: number,
      selectedAnswer?: string
    ) => {
      const nowIso = new Date().toISOString();
      const existingMistake = stateRef.current.mistakes[questionId];
      let updatedMistake: MistakeEntry | null = null;

      if (!isCorrect && (stateRef.current.settings.autoAddWrongToMistakes ?? true)) {
        updatedMistake = {
          questionId,
          errorTag: existingMistake?.errorTag ?? 'Conceptual Gap',
          wrongCount: (existingMistake?.wrongCount ?? 0) + 1,
          lastAttemptedAt: nowIso,
          resolved: false,
          userNote: existingMistake?.userNote ?? '',
        };
      } else if (isCorrect && existingMistake) {
        updatedMistake = {
          ...existingMistake,
          lastAttemptedAt: nowIso,
          resolved: true,
        };
      }

      const cleanSelected = selectedAnswer ? selectedAnswer.slice(0, 120) : '';
      const attemptRecord: QuestionAttemptRecord = {
        questionId,
        isCorrect,
        marksAwarded,
        maxMarks,
        attemptedAt: nowIso,
        selectedAnswer: cleanSelected || undefined,
      };

      setState((prev) => ({
        ...prev,
        attempts: { ...prev.attempts, [questionId]: attemptRecord },
        mistakes: updatedMistake
          ? { ...prev.mistakes, [questionId]: updatedMistake }
          : prev.mistakes,
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        const docId = sanitizeDocId(questionId);
        const path = `users/${uid}/attempts/${docId}`;
        setDoc(doc(db, 'users', uid, 'attempts', docId), {
          ownerId: uid,
          questionId: docId,
          isCorrect,
          marksAwarded: Math.max(-2, Math.min(2, marksAwarded)),
          maxMarks: maxMarks === 1 ? 1 : 2,
          attemptedAt: nowIso,
          selectedAnswer: cleanSelected,
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));

        if (updatedMistake) {
          void writeMistakeEntry(questionId, updatedMistake);
        }
      }
    },
    [writeMistakeEntry]
  );

  const recordTestHistoryEntry = useCallback((entry: TestHistoryEntry) => {
    const docId = sanitizeDocId(entry.id);
    const cleanResponses: Record<string, string> = {};
    for (const [qId, val] of Object.entries(entry.responses ?? {})) {
      if (typeof val === 'string' && val.trim() !== '') {
        cleanResponses[qId] = val.slice(0, 120);
      }
    }
    const completedAtClean = (entry.completedAt || new Date().toISOString()).slice(0, 40);
    const dateClean =
      typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
        ? entry.date
        : completedAtClean.slice(0, 10);
    const cleanEntry: TestHistoryEntry = {
      id: docId,
      title: (entry.title || 'PYQ Practice Test').slice(0, 180),
      mode:
        entry.mode === 'timed' ||
        entry.mode === 'practice' ||
        entry.mode === 'daily_dpp' ||
        entry.mode === 'daily_ga' ||
        entry.mode === 'concept_drill'
          ? entry.mode
          : 'practice',
      date: dateClean,
      completedAt: completedAtClean,
      durationSeconds: Math.max(0, Math.min(86400, Math.round(entry.durationSeconds || 0))),
      questionIds: entry.questionIds.slice(0, 200),
      responses: cleanResponses,
      gradedMarks: Math.max(-200, Math.min(400, Math.round((entry.gradedMarks || 0) * 100) / 100)),
      gradedMaxMarks: Math.max(0, Math.min(400, Math.round((entry.gradedMaxMarks || 0) * 100) / 100)),
      totalMaxMarks: Math.max(0, Math.min(400, Math.round((entry.totalMaxMarks || 0) * 100) / 100)),
      gradedCount: Math.max(0, Math.min(200, Math.round(entry.gradedCount || 0))),
      gradedAttemptedCount: Math.max(0, Math.min(200, Math.round(entry.gradedAttemptedCount || 0))),
      pendingKeyCount: Math.max(0, Math.min(200, Math.round(entry.pendingKeyCount || 0))),
      correctCount: Math.max(0, Math.min(200, Math.round(entry.correctCount || 0))),
      wrongCount: Math.max(0, Math.min(200, Math.round(entry.wrongCount || 0))),
      unattemptedCount: Math.max(0, Math.min(200, Math.round(entry.unattemptedCount || 0))),
      penaltyMarks: Math.max(0, Math.min(200, Math.round((entry.penaltyMarks || 0) * 100) / 100)),
      accuracyPct: Math.max(0, Math.min(100, Math.round(entry.accuracyPct || 0))),
    };

    setState((prev) => {
      const rest = prev.testHistory.filter((t) => t.id !== docId);
      return {
        ...prev,
        testHistory: [cleanEntry, ...rest].sort((a, b) =>
          b.completedAt.localeCompare(a.completedAt)
        ),
      };
    });

    const uid = userRef.current?.uid;
    if (uid) {
      const path = `users/${uid}/test_history/${docId}`;
      setDoc(doc(db, 'users', uid, 'test_history', docId), {
        ownerId: uid,
        testId: docId,
        title: cleanEntry.title,
        mode: cleanEntry.mode,
        date: cleanEntry.date,
        completedAt: cleanEntry.completedAt,
        durationSeconds: cleanEntry.durationSeconds,
        questionIds: cleanEntry.questionIds,
        responses: cleanEntry.responses,
        gradedMarks: cleanEntry.gradedMarks,
        gradedMaxMarks: cleanEntry.gradedMaxMarks,
        totalMaxMarks: cleanEntry.totalMaxMarks,
        gradedCount: cleanEntry.gradedCount,
        gradedAttemptedCount: cleanEntry.gradedAttemptedCount,
        pendingKeyCount: cleanEntry.pendingKeyCount,
        correctCount: cleanEntry.correctCount,
        wrongCount: cleanEntry.wrongCount,
        unattemptedCount: cleanEntry.unattemptedCount,
        penaltyMarks: cleanEntry.penaltyMarks,
        accuracyPct: cleanEntry.accuracyPct,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, path));
    }
    return cleanEntry;
  }, []);

  const deleteTestHistoryEntry = useCallback((testId: string) => {
    const docId = sanitizeDocId(testId);
    setState((prev) => ({
      ...prev,
      testHistory: prev.testHistory.filter((t) => t.id !== docId && t.id !== testId),
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const path = `users/${uid}/test_history/${docId}`;
      deleteDoc(doc(db, 'users', uid, 'test_history', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    }
  }, []);

  const saveVerifiedAnswer = useCallback(
    async (record: Omit<VerifiedAnswerRecord, 'updatedAt'>): Promise<VerifiedAnswerRecord> => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const docId = sanitizeDocId(record.questionId);
      const prevState = stateRef.current;
      const contributorName =
        (typeof record.updatedByName === 'string' && record.updatedByName.trim()) ||
        resolveContributorDisplayName(prevState.profile, userRef.current);

      const saved: VerifiedAnswerRecord = {
        ...record,
        questionId: record.questionId,
        updatedByName: contributorName,
        updatedAtMs: nowMs,
        updatedAt: nowIso,
      };

      // Update local IndexedDB community keys cache immediately (works offline & instantaneously)
      const communityDoc = verifiedRecordToCommunityKeyDoc(saved, contributorName);
      if (communityDoc) {
        communityDocsRef.current = {
          ...communityDocsRef.current,
          [communityDoc.questionId]: communityDoc,
        };
        communityKeysRef.current = {
          ...communityKeysRef.current,
          [record.questionId]: saved,
        };
        void writeCommunityKeysCache(communityDocsRef.current);
      }

      // Build updated question map so testHistory, attempts, mistakes, and daily tests recalculate immediately
      const liveQuestionMap = new Map<string, Question>();
      for (const q of allQuestions) {
        liveQuestionMap.set(q.id, q.id === record.questionId ? applyVerifiedAnswer(q, saved) : q);
      }

      const updatedQuestion = liveQuestionMap.get(record.questionId);

      // Recalculate any test history entries containing this question
      const changedHistoryIds: TestHistoryEntry[] = [];
      const nextTestHistory = prevState.testHistory.map((entry) => {
        if (!entry.questionIds.includes(record.questionId)) return entry;
        const recalculated = recalculateTestHistoryEntry(entry, liveQuestionMap);
        changedHistoryIds.push(recalculated);
        return recalculated;
      });

      // Find the most recent response for this question (from testHistory or attempts) to sync attempts + mistakes
      let latestRawResponse = prevState.attempts[record.questionId]?.selectedAnswer;
      for (const entry of nextTestHistory) {
        if (entry.responses && entry.responses[record.questionId]) {
          latestRawResponse = entry.responses[record.questionId];
          break;
        }
      }

      // Also recalculate any daily DPP / GA record that includes this question and saved responses
      let dailyChanged = false;
      const recalcDailyMap = (map: Record<string, DailyTestRecord>) => {
        const nextMap: Record<string, DailyTestRecord> = { ...map };
        for (const [dateKey, rec] of Object.entries(map)) {
          if (!rec.completedAt || !rec.questionIds.includes(record.questionId) || !rec.responses) {
            continue;
          }
          const qs = rec.questionIds
            .map((id) => liveQuestionMap.get(id))
            .filter((q): q is Question => Boolean(q));
          if (qs.length === 0) continue;
          const parsedResponses: Record<string, ReturnType<typeof parseSerializedResponse>> = {};
          for (const q of qs) {
            parsedResponses[q.id] = parseSerializedResponse(q.format, rec.responses[q.id]);
          }
          const summary = gradeTestSessionStrict(qs, parsedResponses);
          nextMap[dateKey] = {
            ...rec,
            score: summary.gradedMarks,
            maxMarks: summary.totalMaxMarks,
            gradedMaxMarks: summary.gradedMaxMarks,
            pendingKeyCount: summary.pendingKeyCount,
            accuracy: summary.accuracyPct,
            attemptedCount: summary.gradedAttemptedCount + summary.pendingAttemptedCount,
            correctCount: summary.correctCount,
          };
          dailyChanged = true;
        }
        return nextMap;
      };

      const nextDailyProgress: DailyProgressState = {
        ...prevState.dailyProgress,
        dailyDppByDate: recalcDailyMap(prevState.dailyProgress.dailyDppByDate),
        dailyGaByDate: recalcDailyMap(prevState.dailyProgress.dailyGaByDate),
      };

      setState((prev) => ({
        ...prev,
        verifiedAnswers: {
          ...prev.verifiedAnswers,
          [record.questionId]: saved,
        },
        testHistory: nextTestHistory,
        dailyProgress: dailyChanged ? nextDailyProgress : prev.dailyProgress,
      }));

      // Re-evaluate attempt & Mistake Bucket immediately if the user already answered this question
      if (updatedQuestion && latestRawResponse && latestRawResponse.trim() !== '') {
        const parsedResp = parseSerializedResponse(updatedQuestion.format, latestRawResponse);
        const evalRes = evaluateQuestionStrict(updatedQuestion, parsedResp);
        if (evalRes.status === 'correct' || evalRes.status === 'wrong') {
          recordQuestionAttempt(
            updatedQuestion.id,
            evalRes.status === 'correct',
            evalRes.marksAwarded,
            updatedQuestion.marks,
            latestRawResponse
          );
        }
      }

      const uid = userRef.current?.uid;
      if (uid) {
        // 1. Write directly to top-level shared community bank `verified_keys/{questionId}` (open to all users)
        if (communityDoc) {
          const sharedPath = `verified_keys/${communityDoc.questionId}`;
          try {
            await setDoc(doc(db, 'verified_keys', communityDoc.questionId), communityDoc, {
              merge: true,
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, sharedPath);
          }
        }

        // 2. Also keep personal copy in users/{uid}/verified_answers for AI wrongOptionAnalysis backup
        const path = `users/${uid}/verified_answers/${docId}`;
        try {
          await setDoc(doc(db, 'users', uid, 'verified_answers', docId), {
            ownerId: uid,
            questionId: docId,
            format: record.format,
            correctOption: record.format === 'MCQ' ? (record.correctOption ?? '').slice(0, 4) : '',
            correctOptions:
              record.format === 'MSQ' ? (record.correctOptions ?? []).slice(0, 6) : [],
            natAnswer: record.format === 'NAT' ? Number(record.natAnswer ?? 0) : 0,
            natTolerance:
              record.format === 'NAT'
                ? Math.max(0, Math.min(100, Number(record.natTolerance ?? 0.01)))
                : 0,
            explanation: (record.explanation ?? '').slice(0, 5000),
            wrongOptionAnalysis: (record.wrongOptionAnalysis ?? '').slice(0, 3000),
            source: record.source === 'ai' ? 'ai' : 'manual',
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }

        // Persist recalculated test_history entries to Firestore in real time
        for (const updatedEntry of changedHistoryIds) {
          const histDocId = sanitizeDocId(updatedEntry.id);
          const histPath = `users/${uid}/test_history/${histDocId}`;
          updateDoc(doc(db, 'users', uid, 'test_history', histDocId), {
            responses: updatedEntry.responses,
            gradedMarks: updatedEntry.gradedMarks,
            gradedMaxMarks: updatedEntry.gradedMaxMarks,
            totalMaxMarks: updatedEntry.totalMaxMarks,
            gradedCount: updatedEntry.gradedCount,
            gradedAttemptedCount: updatedEntry.gradedAttemptedCount,
            pendingKeyCount: updatedEntry.pendingKeyCount,
            correctCount: updatedEntry.correctCount,
            wrongCount: updatedEntry.wrongCount,
            unattemptedCount: updatedEntry.unattemptedCount,
            penaltyMarks: updatedEntry.penaltyMarks,
            accuracyPct: updatedEntry.accuracyPct,
            updatedAt: serverTimestamp(),
          }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, histPath));
        }

        if (dailyChanged) {
          void persistDailyProgress(nextDailyProgress);
        }
      }

      return saved;
    },
    [allQuestions, recordQuestionAttempt, persistDailyProgress]
  );

  const verifySinglePyqWithAi = useCallback(
    async (
      question: Question
    ): Promise<{
      ok: boolean;
      verified?: VerifiedAnswerRecord;
      modelUsed?: string;
      quotaExceeded?: boolean;
      message: string;
    }> => {
      try {
        const resp = await fetch('/api/verify-single-pyq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionId: question.id,
            title: question.title || question.sourceTag,
            prompt: question.prompt,
            bodyHtml: question.bodyHtml || '',
            format: question.format,
            marks: question.marks,
            options: question.optionsExtracted ? question.options ?? [] : [],
            sourceUrl: question.sourceUrl || '',
          }),
        });
        const data = (await resp.json()) as {
          ok: boolean;
          modelUsed?: string;
          quotaExceeded?: boolean;
          message?: string;
          verified?: {
            format: 'MCQ' | 'MSQ' | 'NAT';
            correctOption?: string;
            correctOptions?: string[];
            natAnswer?: number;
            natTolerance?: number;
            explanation: string;
            wrongOptionAnalysis: string;
          };
        };

        if (data.quotaExceeded) {
          const msg =
            data.message ||
            'Temporarily busy — try again in a moment, or enter the official key manually.';
          setQuotaNotice(msg);
          return { ok: false, quotaExceeded: true, message: msg };
        }

        if (!data.ok || !data.verified) {
          return {
            ok: false,
            message: data.message || 'Unable to verify this question automatically.',
          };
        }

        const saved = await saveVerifiedAnswer({
          questionId: question.id,
          format: data.verified.format,
          correctOption: data.verified.correctOption || undefined,
          correctOptions:
            data.verified.correctOptions && data.verified.correctOptions.length > 0
              ? data.verified.correctOptions
              : undefined,
          natAnswer: data.verified.format === 'NAT' ? data.verified.natAnswer : undefined,
          natTolerance: data.verified.format === 'NAT' ? data.verified.natTolerance : undefined,
          explanation: data.verified.explanation,
          wrongOptionAnalysis: data.verified.wrongOptionAnalysis,
          source: 'ai',
        });

        setQuotaNotice('');
        return {
          ok: true,
          verified: saved,
          modelUsed: data.modelUsed,
          message: 'Answer key verified and saved permanently.',
        };
      } catch {
        return {
          ok: false,
          message: 'Verification service unreachable right now — you can enter the key manually.',
        };
      }
    },
    [saveVerifiedAnswer]
  );

  const toggleQuestionBookmark = useCallback(
    (questionId: string) => {
      const prev = stateRef.current;
      const exists = prev.bookmarkedQuestions.includes(questionId);
      const nextBookmarks = exists
        ? prev.bookmarkedQuestions.filter((id) => id !== questionId)
        : [...prev.bookmarkedQuestions, questionId];

      let createdMistake: MistakeEntry | null = null;
      const nextMistakes = { ...prev.mistakes };
      if (!exists && !nextMistakes[questionId]) {
        createdMistake = {
          questionId,
          errorTag: 'Conceptual Gap',
          wrongCount: 0,
          lastAttemptedAt: new Date().toISOString(),
          resolved: false,
          userNote: 'Bookmarked for revision',
        };
        nextMistakes[questionId] = createdMistake;
      }

      const nextState: WarRoomState = {
        ...prev,
        bookmarkedQuestions: nextBookmarks,
        mistakes: nextMistakes,
      };
      setState(nextState);
      void persistWorkspaceMeta(nextState);
      if (createdMistake) {
        void writeMistakeEntry(questionId, createdMistake);
      }
    },
    [persistWorkspaceMeta, writeMistakeEntry]
  );

  const updateMistakeTag = useCallback(
    (questionId: string, errorTag: ErrorTag) => {
      const existing = stateRef.current.mistakes[questionId];
      if (!existing) return;
      const updated: MistakeEntry = { ...existing, errorTag };
      setState((prev) => ({
        ...prev,
        mistakes: { ...prev.mistakes, [questionId]: updated },
      }));
      void writeMistakeEntry(questionId, updated);
    },
    [writeMistakeEntry]
  );

  const updateMistakeNote = useCallback(
    (questionId: string, userNote: string) => {
      const existing = stateRef.current.mistakes[questionId];
      if (!existing) return;
      const updated: MistakeEntry = { ...existing, userNote };
      setState((prev) => ({
        ...prev,
        mistakes: { ...prev.mistakes, [questionId]: updated },
      }));
      void writeMistakeEntry(questionId, updated);
    },
    [writeMistakeEntry]
  );

  const toggleMistakeResolved = useCallback(
    (questionId: string) => {
      const existing = stateRef.current.mistakes[questionId];
      if (!existing) return;
      const updated: MistakeEntry = { ...existing, resolved: !existing.resolved };
      setState((prev) => ({
        ...prev,
        mistakes: { ...prev.mistakes, [questionId]: updated },
      }));
      void writeMistakeEntry(questionId, updated);
    },
    [writeMistakeEntry]
  );

  const saveSketchForQuestion = useCallback((questionId: string, dataUrl: string) => {
    if (dataUrl.length > 450000) return;
    setState((prev) => ({
      ...prev,
      savedSketches: { ...prev.savedSketches, [questionId]: dataUrl },
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(questionId);
      const path = `users/${uid}/sketches/${docId}`;
      setDoc(doc(db, 'users', uid, 'sketches', docId), {
        ownerId: uid,
        questionId: docId,
        dataUrl,
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    }
  }, []);

  const deleteSketchForQuestion = useCallback((questionId: string) => {
    setState((prev) => {
      const copy = { ...prev.savedSketches };
      delete copy[questionId];
      return { ...prev, savedSketches: copy };
    });

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(questionId);
      const path = `users/${uid}/sketches/${docId}`;
      deleteDoc(doc(db, 'users', uid, 'sketches', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    }
  }, []);

  const saveTraceTable = useCallback((questionId: string, table: DryRunTraceTable) => {
    const safeCols = table.columns.slice(0, 12).map((c) => String(c).slice(0, 48));
    if (safeCols.length === 0) return;
    const safeRows: DryRunTraceRow[] = table.rows.slice(0, 60).map((r, idx) => ({
      id: String(r.id || `r_${idx}`).slice(0, 48),
      cells: safeCols.map((_, ci) => String(r.cells[ci] ?? '').slice(0, 140)),
    }));
    const normalized: DryRunTraceTable = {
      questionId,
      columns: safeCols,
      rows: safeRows,
      presetName: (table.presetName || 'Custom').slice(0, 64),
      updatedAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      traceTables: { ...prev.traceTables, [questionId]: normalized },
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(questionId);
      const path = `users/${uid}/trace_tables/${docId}`;
      setDoc(doc(db, 'users', uid, 'trace_tables', docId), {
        ownerId: uid,
        questionId: docId,
        presetName: normalized.presetName,
        columns: safeCols,
        rows: safeRows,
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    }
  }, []);

  const deleteTraceTable = useCallback((questionId: string) => {
    setState((prev) => {
      const copy = { ...prev.traceTables };
      delete copy[questionId];
      return { ...prev, traceTables: copy };
    });

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(questionId);
      const path = `users/${uid}/trace_tables/${docId}`;
      deleteDoc(doc(db, 'users', uid, 'trace_tables', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    }
  }, []);

  const recordGaSprintCompletion = useCallback(
    (payload: {
      questionsCount: number;
      correctCount: number;
      marksAwarded: number;
      maxMarks: number;
      accuracyPct: number;
      durationSeconds: number;
    }) => {
      const todayIso = toLocalIsoDate();
      const entry: GaStreakEntry = {
        date: todayIso,
        completedAt: new Date().toISOString(),
        questionsCount: Math.max(1, Math.min(25, Math.round(payload.questionsCount))),
        correctCount: Math.max(0, Math.min(25, Math.round(payload.correctCount))),
        marksAwarded: Math.max(-25, Math.min(50, Math.round(payload.marksAwarded * 100) / 100)),
        maxMarks: Math.max(1, Math.min(50, Math.round(payload.maxMarks * 100) / 100)),
        accuracyPct: Math.max(0, Math.min(100, Math.round(payload.accuracyPct))),
        durationSeconds: Math.max(0, Math.min(3600, Math.round(payload.durationSeconds))),
      };

      setState((prev) => ({
        ...prev,
        gaStreakLogs: {
          ...prev.gaStreakLogs,
          [todayIso]: entry,
        },
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        const path = `users/${uid}/ga_streak/${todayIso}`;
        setDoc(doc(db, 'users', uid, 'ga_streak', todayIso), {
          ownerId: uid,
          ...entry,
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
      }
      return entry;
    },
    []
  );

  const addImportedQuestions = useCallback(
    (questions: Question[]) => {
      if (questions.length === 0) return;
      const existingFp = new Set(
        [...GATE_QUESTION_BANK, ...stateRef.current.customQuestions].map(
          (q) => q.fingerprint || computeQuestionFingerprint(q.prompt)
        )
      );
      const existingIds = new Set([
        ...GATE_QUESTION_BANK.map((q) => q.id),
        ...stateRef.current.customQuestions.map((q) => q.id),
      ]);

      const toAdd: Question[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const fp = q.fingerprint || computeQuestionFingerprint(q.prompt);
        if (existingFp.has(fp)) continue;
        existingFp.add(fp);
        const safeId = sanitizeDocId(
          existingIds.has(q.id) ? `${q.id}_${Date.now()}_${i}` : q.id
        );
        existingIds.add(safeId);
        toAdd.push({ ...q, id: safeId, fingerprint: fp, isCustom: true });
      }

      if (toAdd.length === 0) return;

      setState((prev) => ({
        ...prev,
        customQuestions: [...toAdd, ...prev.customQuestions],
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        for (const q of toAdd) {
          void persistPyqQuestion(uid, q);
        }
      }
    },
    [persistPyqQuestion]
  );

  const toggleTipBookmark = useCallback(
    (tipId: string) => {
      const prev = stateRef.current;
      const exists = prev.bookmarkedTips.includes(tipId);
      const nextState: WarRoomState = {
        ...prev,
        bookmarkedTips: exists
          ? prev.bookmarkedTips.filter((id) => id !== tipId)
          : [...prev.bookmarkedTips, tipId],
      };
      setState(nextState);
      void persistWorkspaceMeta(nextState);
    },
    [persistWorkspaceMeta]
  );

  const addCustomTip = useCallback(
    (tip: Omit<TipItem, 'id' | 'isCustom'>) => {
      const newTip: TipItem = {
        ...tip,
        id: `custom_tip_${Date.now()}`,
        isCustom: true,
      };
      setState((prev) => ({
        ...prev,
        customTips: [newTip, ...prev.customTips],
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        void persistCustomTip(uid, newTip);
      }
    },
    [persistCustomTip]
  );

  const deleteCustomTip = useCallback((tipId: string) => {
    const isVault = stateRef.current.trapsVault.some((t) => t.id === tipId);
    setState((prev) => ({
      ...prev,
      customTips: prev.customTips.filter((t) => t.id !== tipId),
      trapsVault: prev.trapsVault.filter((t) => t.id !== tipId),
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(tipId);
      const col = isVault ? 'traps_vault' : 'custom_tips';
      const path = `users/${uid}/${col}/${docId}`;
      deleteDoc(doc(db, 'users', uid, col, docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    }
  }, []);

  // ===================== UNIFIED VAULT PACK & CARD MUTATIONS (₹0 OFFLINE + FIRESTORE) =====================

  const importVaultPack = useCallback(
    (pack: VaultPack): { addedPacks: number; addedCards: number } => {
      const chunks = splitPackForFirestore(pack, 150);
      setState((prev) => ({
        ...prev,
        vaultPacks: [...chunks, ...prev.vaultPacks],
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        for (const chunk of chunks) {
          void persistVaultPack(uid, chunk, false);
        }
      }
      return {
        addedPacks: chunks.length,
        addedCards: chunks.reduce((acc, c) => acc + c.cardCount, 0),
      };
    },
    [persistVaultPack]
  );

  const deleteVaultPack = useCallback((packId: string) => {
    setState((prev) => ({
      ...prev,
      vaultPacks: prev.vaultPacks.filter((p) => p.packId !== packId),
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(packId);
      const path = `users/${uid}/vault_packs/${docId}`;
      deleteDoc(doc(db, 'users', uid, 'vault_packs', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    }
  }, []);

  const addCustomVaultCard = useCallback(
    (cardInput: Omit<VaultCard, 'id' | 'source' | 'createdAt' | 'packId' | 'packName'>) => {
      const now = Date.now();
      const existingCustomPack = stateRef.current.vaultPacks.find(
        (p) => p.source === 'Custom' && p.cards.length < 150
      );
      const targetPackId = existingCustomPack
        ? existingCustomPack.packId
        : sanitizeDocId(`pack_custom_${now}`);
      const targetPackName = existingCustomPack ? existingCustomPack.name : 'My Custom Cards';

      const newCard: VaultCard = {
        ...cardInput,
        id: sanitizeDocId(`vc_custom_${now}_${Math.random().toString(36).slice(2, 5)}`),
        source: 'Custom',
        packId: targetPackId,
        packName: targetPackName,
        createdAt: now,
      };

      let nextPack: VaultPack;
      let isUpdate = false;
      if (existingCustomPack) {
        isUpdate = true;
        nextPack = {
          ...existingCustomPack,
          cards: [newCard, ...existingCustomPack.cards],
          cardCount: existingCustomPack.cards.length + 1,
          updatedAt: now,
        };
        setState((prev) => ({
          ...prev,
          vaultPacks: prev.vaultPacks.map((p) => (p.packId === targetPackId ? nextPack : p)),
        }));
      } else {
        nextPack = {
          packId: targetPackId,
          name: targetPackName,
          source: 'Custom',
          cardCount: 1,
          cards: [newCard],
          createdAt: now,
          updatedAt: now,
        };
        setState((prev) => ({
          ...prev,
          vaultPacks: [nextPack, ...prev.vaultPacks],
        }));
      }

      const uid = userRef.current?.uid;
      if (uid) {
        void persistVaultPack(uid, nextPack, isUpdate);
      }
      return newCard;
    },
    [persistVaultPack]
  );

  const deleteVaultCard = useCallback(
    (cardId: string) => {
      // Check if card lives inside a VaultPack
      const owningPack = stateRef.current.vaultPacks.find((p) =>
        p.cards.some((c) => c.id === cardId)
      );
      if (owningPack) {
        const remaining = owningPack.cards.filter((c) => c.id !== cardId);
        if (remaining.length === 0) {
          deleteVaultPack(owningPack.packId);
          return;
        }
        const updatedPack: VaultPack = {
          ...owningPack,
          cards: remaining,
          cardCount: remaining.length,
          updatedAt: Date.now(),
        };
        setState((prev) => ({
          ...prev,
          vaultPacks: prev.vaultPacks.map((p) =>
            p.packId === owningPack.packId ? updatedPack : p
          ),
        }));
        const uid = userRef.current?.uid;
        if (uid) {
          void persistVaultPack(uid, updatedPack, true);
        }
        return;
      }

      // Fallback: delete from legacy customTips / trapsVault
      deleteCustomTip(cardId);
    },
    [deleteVaultPack, persistVaultPack, deleteCustomTip]
  );

  const syncVaultFromGithub = useCallback(
    async (
      url: string,
      packName?: string
    ): Promise<{ ok: boolean; addedCards: number; duplicatesSkipped?: number; message: string }> => {
      try {
        const resp = await fetch('/api/sync-vault-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, packName }),
        });
        const data = (await resp.json()) as {
          ok: boolean;
          pack?: VaultPack;
          message?: string;
        };
        if (!data.ok || !data.pack) {
          return {
            ok: false,
            addedCards: 0,
            message: data.message || 'Could not sync bundle from GitHub.',
          };
        }

        // Deduplicate against current Vault cards before saving
        const existingFps = new Set(allVaultCards.map((c) => cardFingerprint(c.subject, c.title)));
        const freshCards = data.pack.cards.filter(
          (c) => !existingFps.has(cardFingerprint(c.subject, c.title))
        );
        const skipped = data.pack.cards.length - freshCards.length;
        if (freshCards.length === 0) {
          return {
            ok: true,
            addedCards: 0,
            duplicatesSkipped: skipped,
            message: `Already up to date (${skipped} cards already in your Vault).`,
          };
        }

        const dedupedPack: VaultPack = {
          ...data.pack,
          cards: freshCards,
          cardCount: freshCards.length,
        };
        importVaultPack(dedupedPack);
        return {
          ok: true,
          addedCards: freshCards.length,
          duplicatesSkipped: skipped,
          message: `Synced ${freshCards.length} new card(s) from GitHub${skipped > 0 ? ` (${skipped} duplicates skipped)` : ''}.`,
        };
      } catch {
        return {
          ok: false,
          addedCards: 0,
          message: 'Network error contacting GitHub sync proxy.',
        };
      }
    },
    [allVaultCards, importVaultPack]
  );

  const recordSrsRating = useCallback(
    (itemType: SrsItemType, itemId: string, rating: SrsRating) => {
      const cardId = makeSrsCardId(itemType, itemId);
      const prev = stateRef.current.srsCards[cardId];
      const todayIso = toLocalIsoDate();
      const updated = computeNextSrsSchedule(prev, itemType, itemId, rating, todayIso);

      setState((curr) => ({
        ...curr,
        srsCards: {
          ...curr.srsCards,
          [cardId]: updated,
        },
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        void persistSrsCard(uid, updated);
      }
      return updated;
    },
    [persistSrsCard]
  );

  const generateFreshTraps = useCallback(
    async (options?: {
      subjectId?: SubjectId | 'all';
      mode?: 'daily' | 'subject' | 'mistakes';
      count?: number;
      skipCooldown?: boolean;
    }): Promise<{ ok: boolean; addedCount: number; fallbackUsed?: boolean; message: string }> => {
      const now = Date.now();
      if (!options?.skipCooldown && now < trapsCooldownUntil) {
        const wait = Math.ceil((trapsCooldownUntil - now) / 1000);
        return {
          ok: false,
          addedCount: 0,
          message: `Cooldown active · Wait ${wait}s before generating again.`,
        };
      }
      if (trapsGenerating) {
        return { ok: false, addedCount: 0, message: 'Already generating traps...' };
      }

      const mode = options?.mode ?? 'daily';
      const count = options?.count ?? 5;
      const subjectId = options?.subjectId ?? 'all';
      const istDate = getIstDateString();

      setTrapsGenerating(true);
      if (!options?.skipCooldown) {
        setTrapsCooldownUntil(Date.now() + TRAPS_COOLDOWN_MS);
      }
      setTrapsNotice('');

      const currState = stateRef.current;
      const existingTitles = [
        ...currState.trapsVault.map((t) => t.title),
        ...currState.customTips.map((t) => t.title),
        ...GATE_2027_MASTER_VAULT.map((t) => t.title),
      ];

      // Determine weakest subjects from syllabus + unresolved mistakes
      const subjectMistakeCounts = new Map<SubjectId, number>();
      const questionMap = new Map(allQuestions.map((q) => [q.id, q]));
      const weakTopics: string[] = [];
      const mistakeSamples: Array<{
        questionId: string;
        subjectId: string;
        subtopic: string;
        errorTag: string;
        promptSnippet: string;
        userNote?: string;
      }> = [];

      const unresolvedMistakes = Object.values(currState.mistakes).filter((m) => !m.resolved);
      for (const m of unresolvedMistakes) {
        const q = questionMap.get(m.questionId);
        if (!q) continue;
        subjectMistakeCounts.set(q.subjectId, (subjectMistakeCounts.get(q.subjectId) ?? 0) + 1);
        if (q.subtopic) weakTopics.push(`${q.subtopic} (${m.errorTag})`);
        if (mistakeSamples.length < 6) {
          mistakeSamples.push({
            questionId: q.id,
            subjectId: q.subjectId,
            subtopic: q.subtopic || 'Core Concept',
            errorTag: m.errorTag,
            promptSnippet: q.prompt.slice(0, 320),
            userNote: m.userNote,
          });
        }
      }

      if (mode === 'mistakes' && mistakeSamples.length === 0) {
        setTrapsGenerating(false);
        const msg = 'No unresolved items in Mistake Bucket yet · Solve PYQs to mine personal traps.';
        setTrapsNotice(msg);
        return { ok: false, addedCount: 0, message: msg };
      }

      const subjects: SubjectId[] =
        subjectId !== 'all'
          ? [subjectId]
          : Array.from(subjectMistakeCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([sid]) => sid)
              .slice(0, 4);

      if (subjects.length === 0) {
        // Fallback to lowest-mastery subjects
        const masteryOrder = [...GATE_2027_SYLLABUS]
          .map((subj) => {
            const mastered = subj.subtopics.filter(
              (st) => currState.progress[st.id]?.status === 'mastered'
            ).length;
            return { id: subj.id, ratio: subj.subtopics.length > 0 ? mastered / subj.subtopics.length : 1 };
          })
          .sort((a, b) => a.ratio - b.ratio)
          .slice(0, 4)
          .map((x) => x.id);
        subjects.push(...masteryOrder);
      }

      try {
        const resp = await fetch('/api/generate-daily-traps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjects,
            weakTopicsFromMistakeBucket: weakTopics.slice(0, 12),
            existingTitles: existingTitles.slice(0, 100),
            count,
            mode,
            mistakeSamples: mode === 'mistakes' ? mistakeSamples : undefined,
          }),
        });

        const data = (await resp.json()) as {
          ok: boolean;
          istDate?: string;
          modelUsed?: string;
          quotaExceeded?: boolean;
          message?: string;
          traps?: Array<{
            subjectId: SubjectId;
            title: string;
            category: TipItem['category'];
            summary: string;
            detail: string;
            formula?: string;
            trapSource?: TrapSourceType;
            generatedDateIst?: string;
            sourceQuestionId?: string;
          }>;
        };

        if (data.ok && Array.isArray(data.traps) && data.traps.length > 0) {
          const syncedDate = data.istDate || istDate;
          const newItems: TipItem[] = data.traps.map((t, idx) => ({
            id: sanitizeDocId(`trap_${syncedDate.replace(/-/g, '')}_${Date.now()}_${idx}`),
            subjectId: t.subjectId,
            title: t.title,
            category: t.category,
            summary: t.summary,
            detail: t.detail,
            formula: t.formula || undefined,
            trapSource: t.trapSource || (mode === 'mistakes' ? 'mistake_mined' : mode === 'subject' ? 'ai_subject' : 'ai_daily'),
            generatedDateIst: syncedDate,
            sourceQuestionId: t.sourceQuestionId,
            isCustom: true,
          }));

          const nextState: WarRoomState = {
            ...stateRef.current,
            lastTrapsIstDate: mode === 'daily' ? syncedDate : stateRef.current.lastTrapsIstDate,
            trapsVault: [...newItems, ...stateRef.current.trapsVault],
          };
          setState(nextState);

          const uid = userRef.current?.uid;
          if (uid) {
            if (mode === 'daily') {
              void persistWorkspaceMeta(nextState);
            }
            for (const item of newItems) {
              void persistTrapVaultItem(uid, item);
            }
          }

          const msg =
            mode === 'mistakes'
              ? `Mined ${newItems.length} personal trap card(s) from your Mistake Bucket.`
              : `Added ${newItems.length} fresh GATE CSE traps to your permanent library.`;
          setTrapsNotice(msg);
          return { ok: true, addedCount: newItems.length, message: msg };
        }

        // Graceful fallback on 429 / offline / unconfigured key: extract local GateR tag insights
        const localFallback = buildLocalTagTrapsFallback(
          allQuestions,
          existingTitles,
          subjectId,
          istDate
        );
        if (localFallback.length > 0) {
          const nextState: WarRoomState = {
            ...stateRef.current,
            trapsVault: [...localFallback, ...stateRef.current.trapsVault],
          };
          setState(nextState);
          const uid = userRef.current?.uid;
          if (uid) {
            for (const item of localFallback) {
              void persistTrapVaultItem(uid, item);
            }
          }
          const msg = `${data.message || 'Serving local GateR insights'} · Added ${localFallback.length} GateR tag traps.`;
          setTrapsNotice(msg);
          return { ok: true, addedCount: localFallback.length, fallbackUsed: true, message: msg };
        }

        const fallbackMsg = data.message || 'Showing your cached Traps & Tips library.';
        setTrapsNotice(fallbackMsg);
        return { ok: false, addedCount: 0, fallbackUsed: true, message: fallbackMsg };
      } catch {
        const localFallback = buildLocalTagTrapsFallback(
          allQuestions,
          existingTitles,
          subjectId,
          istDate
        );
        if (localFallback.length > 0) {
          setState((prev) => ({
            ...prev,
            trapsVault: [...localFallback, ...prev.trapsVault],
          }));
          const msg = `Offline · Extracted ${localFallback.length} high-frequency traps from your local GateR bank.`;
          setTrapsNotice(msg);
          return { ok: true, addedCount: localFallback.length, fallbackUsed: true, message: msg };
        }
        const msg = 'Offline · Showing cached Traps & Tips library.';
        setTrapsNotice(msg);
        return { ok: false, addedCount: 0, fallbackUsed: true, message: msg };
      } finally {
        setTrapsGenerating(false);
      }
    },
    [
      trapsCooldownUntil,
      trapsGenerating,
      allQuestions,
      persistWorkspaceMeta,
      persistTrapVaultItem,
    ]
  );

  // Disabled automatic load-time Gemini API call so opening the Vault is 100% offline, instant, and zero-error!
  const ensureDailyTrapsLoaded = useCallback(() => {
    // Intentionally a zero-API no-op: Vault is powered by the 132-card Offline Master Bundle + JSON/GitHub Packs.
  }, []);

  const buildSanitizedMockFields = useCallback(
    (mock: Omit<MockTestEntry, 'id'>): Record<string, unknown> => {
      const validMockSubjects = new Set([
        'all',
        'ga',
        'em',
        'dl',
        'coa',
        'cprog',
        'ds',
        'algo',
        'toc',
        'cd',
        'os',
        'dbms',
        'cn',
      ]);
      const validParseSources = new Set(['local_deterministic', 'ai_free_tier', 'manual']);
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(mock.date) ? mock.date : toLocalIsoDate();
      const safeName = (mock.name || 'Mock Test').trim().slice(0, 160);
      const safeSource = (mock.source || 'GATE Test Series').trim().slice(0, 120);

      const fields: Record<string, unknown> = {
        name: safeName.length >= 3 ? safeName : `${safeName} Mock`,
        source: safeSource.length >= 1 ? safeSource : 'GATE Test Series',
        date: safeDate,
        type:
          mock.type === 'Topic-Wise Test' || mock.type === 'Subject Test'
            ? mock.type
            : 'Full-Length Mock',
        score: Math.max(-100, Math.min(300, Number(mock.score))),
        maxScore: Math.max(1, Math.min(300, Number(mock.maxScore))),
        accuracy: Math.max(0, Math.min(100, Number(mock.accuracy))),
        unattempted: Math.max(0, Math.min(300, Math.round(Number(mock.unattempted ?? 0)))),
        notes: (mock.notes ?? '').slice(0, 2000),
      };

      const addBounded = (
        key: string,
        val: number | undefined,
        min: number,
        max: number,
        roundInt = false
      ) => {
        if (typeof val !== 'number' || !Number.isFinite(val)) return;
        const clamped = Math.max(min, Math.min(max, val));
        if (roundInt && Math.round(clamped) < min) return;
        fields[key] = roundInt ? Math.round(clamped) : Math.round(clamped * 100) / 100;
      };

      if (mock.subjectId && validMockSubjects.has(mock.subjectId)) {
        fields.subjectId = mock.subjectId;
      }
      if (mock.parseSource && validParseSources.has(mock.parseSource)) {
        fields.parseSource = mock.parseSource;
      }

      addBounded('normalizedScore', mock.normalizedScore, -100, 100);
      addBounded('percentage', mock.percentage, -100, 100);
      addBounded('totalQuestions', mock.totalQuestions, 0, 300, true);
      addBounded('attempted', mock.attempted, 0, 300, true);
      addBounded('correct', mock.correct, 0, 300, true);
      addBounded('wrong', mock.wrong, 0, 300, true);
      addBounded('q1Attempted', mock.q1Attempted, 0, 200, true);
      addBounded('q2Attempted', mock.q2Attempted, 0, 200, true);
      addBounded('q1Correct', mock.q1Correct, 0, 200, true);
      addBounded('q2Correct', mock.q2Correct, 0, 200, true);
      addBounded('q1Wrong', mock.q1Wrong, 0, 200, true);
      addBounded('q2Wrong', mock.q2Wrong, 0, 200, true);
      addBounded('q1Total', mock.q1Total, 0, 200, true);
      addBounded('q2Total', mock.q2Total, 0, 200, true);
      addBounded('positiveMarks', mock.positiveMarks, 0, 300);
      addBounded('penaltyMarks', mock.penaltyMarks, 0, 150);
      addBounded('q1PositiveMarks', mock.q1PositiveMarks, 0, 200);
      addBounded('q2PositiveMarks', mock.q2PositiveMarks, 0, 300);
      addBounded('q1PenaltyMarks', mock.q1PenaltyMarks, 0, 150);
      addBounded('q2PenaltyMarks', mock.q2PenaltyMarks, 0, 150);
      addBounded('durationMinutes', mock.durationMinutes, 0, 600);
      addBounded('timeTakenMinutes', mock.timeTakenMinutes, 0, 600);
      if (typeof mock.rank === 'number' && Number.isFinite(mock.rank) && mock.rank >= 1) {
        addBounded('rank', mock.rank, 1, 500000, true);
      }
      if (
        typeof mock.totalCandidates === 'number' &&
        Number.isFinite(mock.totalCandidates) &&
        mock.totalCandidates >= 1
      ) {
        addBounded('totalCandidates', mock.totalCandidates, 1, 500000, true);
      }
      addBounded('percentile', mock.percentile, 0, 100);
      return fields;
    },
    []
  );

  const addMockTest = useCallback(
    (mock: Omit<MockTestEntry, 'id'>) => {
      const newMock: MockTestEntry = {
        ...mock,
        id: `mock_${Date.now()}`,
      };
      setState((prev) => ({
        ...prev,
        mocks: [...prev.mocks, newMock].sort((a, b) => a.date.localeCompare(b.date)),
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        const path = `users/${uid}/mocks/${newMock.id}`;
        const payload: Record<string, unknown> = {
          ownerId: uid,
          ...buildSanitizedMockFields(newMock),
          createdAt: serverTimestamp(),
        };
        setDoc(doc(db, 'users', uid, 'mocks', newMock.id), payload).catch((err) =>
          handleFirestoreError(err, OperationType.CREATE, path)
        );
      }
    },
    [buildSanitizedMockFields]
  );

  const updateMockTest = useCallback(
    (mockId: string, mock: Omit<MockTestEntry, 'id'>) => {
      const updatedMock: MockTestEntry = {
        ...mock,
        id: mockId,
      };
      setState((prev) => ({
        ...prev,
        mocks: prev.mocks
          .map((m) => (m.id === mockId ? updatedMock : m))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }));

      const uid = userRef.current?.uid;
      if (uid) {
        const docId = sanitizeDocId(mockId);
        const path = `users/${uid}/mocks/${docId}`;
        const updatePayload: Record<string, unknown> = {
          ...buildSanitizedMockFields(updatedMock),
          updatedAt: serverTimestamp(),
        };
        updateDoc(doc(db, 'users', uid, 'mocks', docId), updatePayload).catch((err) =>
          handleFirestoreError(err, OperationType.UPDATE, path)
        );
      }
    },
    [buildSanitizedMockFields]
  );

  const deleteMockTest = useCallback((mockId: string) => {
    setState((prev) => ({
      ...prev,
      mocks: prev.mocks.filter((m) => m.id !== mockId),
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const docId = sanitizeDocId(mockId);
      const path = `users/${uid}/mocks/${docId}`;
      deleteDoc(doc(db, 'users', uid, 'mocks', docId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    }
  }, []);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    const prevProfile = stateRef.current.profile ?? readLocalUserProfile();
    const nextProfile = sanitizeUserProfile({
      ...prevProfile,
      ...patch,
      profileUpdatedAt: Date.now(),
    });

    writeLocalUserProfile(nextProfile);
    setState((prev) => ({
      ...prev,
      profile: nextProfile,
    }));

    const uid = userRef.current?.uid;
    if (uid) {
      const profilePath = `users/${uid}/profile/main`;
      const profilePayload = {
        ownerId: uid,
        displayName: nextProfile.displayName,
        targetGoal: nextProfile.targetGoal,
        bio: nextProfile.bio,
        avatarDataUrl: nextProfile.avatarDataUrl,
        profileUpdatedAt: nextProfile.profileUpdatedAt ?? Date.now(),
        updatedAt: serverTimestamp(),
      };
      setDoc(doc(db, 'users', uid, 'profile', 'main'), profilePayload, { merge: true }).catch((err) =>
        handleFirestoreError(err, OperationType.WRITE, profilePath)
      );

      if (nextProfile.displayName) {
        updateDoc(doc(db, 'users', uid), {
          displayName: nextProfile.displayName.slice(0, 120),
          updatedAt: serverTimestamp(),
        }).catch(() => {
          // root displayName sync is best-effort
        });
      }
    }
  }, []);

  const getOrCreateTodayDailyDpp = useCallback((): {
    todayIst: string;
    record: DailyTestRecord;
    questions: Question[];
    rolledOverPool: boolean;
  } => {
    const todayIst = getIstDateString();
    const cur = stateRef.current;
    const res = selectOrGetDailyDpp({
      todayIst,
      allQuestions,
      dailyProgress: cur.dailyProgress,
      syllabus: GATE_2027_SYLLABUS,
      progress: cur.progress,
      attempts: cur.attempts,
      hideRemoved2027: cur.settings.autoHideRemoved2027 ?? true,
      count: 10,
    });

    if (res.updatedProgress !== cur.dailyProgress) {
      setState((prev) => ({ ...prev, dailyProgress: res.updatedProgress }));
      void persistDailyProgress(res.updatedProgress);
    }

    return {
      todayIst,
      record: res.record,
      questions: res.questions,
      rolledOverPool: res.rolledOverPool,
    };
  }, [allQuestions, persistDailyProgress]);

  const completeTodayDailyDpp = useCallback(
    (payload: {
      dateIst?: string;
      questionIds: string[];
      score: number;
      maxMarks: number;
      accuracy: number;
      attemptedCount: number;
      correctCount: number;
      durationSeconds?: number;
      responses?: Record<string, string>;
    }) => {
      const todayIst = payload.dateIst || getIstDateString();
      const updated = recordDailyTestCompletion({
        kind: 'dpp',
        todayIst,
        dailyProgress: stateRef.current.dailyProgress,
        questionIds: payload.questionIds,
        score: payload.score,
        maxMarks: payload.maxMarks,
        accuracy: payload.accuracy,
        attemptedCount: payload.attemptedCount,
        correctCount: payload.correctCount,
        durationSeconds: payload.durationSeconds,
        responses: payload.responses,
      });
      setState((prev) => ({ ...prev, dailyProgress: updated }));
      void persistDailyProgress(updated);
    },
    [persistDailyProgress]
  );

  const getOrCreateTodayDailyGa = useCallback((): {
    todayIst: string;
    record: DailyTestRecord;
    questions: Question[];
    rolledOverPool: boolean;
  } => {
    const todayIst = getIstDateString();
    const cur = stateRef.current;
    const res = selectOrGetDailyGa({
      todayIst,
      allQuestions,
      dailyProgress: cur.dailyProgress,
      attempts: cur.attempts,
      hideRemoved2027: cur.settings.autoHideRemoved2027 ?? true,
      count: 5,
    });

    if (res.updatedProgress !== cur.dailyProgress) {
      setState((prev) => ({ ...prev, dailyProgress: res.updatedProgress }));
      void persistDailyProgress(res.updatedProgress);
    }

    return {
      todayIst,
      record: res.record,
      questions: res.questions,
      rolledOverPool: res.rolledOverPool,
    };
  }, [allQuestions, persistDailyProgress]);

  const completeTodayDailyGa = useCallback(
    (payload: {
      dateIst?: string;
      questionIds: string[];
      score: number;
      maxMarks: number;
      accuracy: number;
      attemptedCount: number;
      correctCount: number;
      durationSeconds?: number;
      responses?: Record<string, string>;
    }) => {
      const todayIst = payload.dateIst || getIstDateString();
      const updated = recordDailyTestCompletion({
        kind: 'ga',
        todayIst,
        dailyProgress: stateRef.current.dailyProgress,
        questionIds: payload.questionIds,
        score: payload.score,
        maxMarks: payload.maxMarks,
        accuracy: payload.accuracy,
        attemptedCount: payload.attemptedCount,
        correctCount: payload.correctCount,
        durationSeconds: payload.durationSeconds,
        responses: payload.responses,
      });
      setState((prev) => ({ ...prev, dailyProgress: updated }));
      void persistDailyProgress(updated);
    },
    [persistDailyProgress]
  );

  const updateSettings = useCallback(
    (patch: Partial<ExamSettings>) => {
      const nextState: WarRoomState = {
        ...stateRef.current,
        settings: { ...stateRef.current.settings, ...patch },
      };
      setState(nextState);
      void persistWorkspaceMeta(nextState);
    },
    [persistWorkspaceMeta]
  );

  const importFullBackup = useCallback(
    (imported: Partial<WarRoomState>) => {
      const initial = createInitialWarRoomState();
      const merged: WarRoomState = migrateLegacyWarRoomState({
        ...initial,
        ...imported,
        settings: { ...initial.settings, ...(imported.settings ?? {}) },
        progress: { ...initial.progress, ...(imported.progress ?? {}) },
        testHistory: Array.isArray(imported.testHistory) ? imported.testHistory : [],
      });
      setState(merged);

      const uid = userRef.current?.uid;
      if (uid) {
        void persistWorkspaceMeta(merged);
        // Sync imported custom PYQs and syllabus entries
        for (const [subId, entry] of Object.entries(merged.progress)) {
          if (entry.status !== 'not_started' || entry.notes) {
            void writeSubtopicProgress(subId, entry);
          }
        }
        for (const q of merged.customQuestions) {
          void persistPyqQuestion(uid, q);
        }
      }
    },
    [persistWorkspaceMeta, writeSubtopicProgress, persistPyqQuestion]
  );

  const resetAllData = useCallback(async () => {
    const fresh = createInitialWarRoomState();
    const nowMs = Math.max(Date.now(), readLocalAccentSelection().accentUpdatedAt + 1);
    fresh.settings.accentUpdatedAt = nowMs;
    writeLocalAccentSelection(fresh.settings.accentTheme, nowMs);
    setState(fresh);

    const uid = userRef.current?.uid;
    if (!uid) return;

    try {
      await persistWorkspaceMeta(fresh);
      const batch = writeBatch(db);
      for (const subId of Object.keys(stateRef.current.progress)) {
        if (
          stateRef.current.progress[subId].status !== 'not_started' ||
          stateRef.current.progress[subId].notes
        ) {
          batch.delete(doc(db, 'users', uid, 'syllabus', sanitizeDocId(subId)));
        }
      }
      for (const log of stateRef.current.studyLogs) {
        batch.delete(doc(db, 'users', uid, 'study_logs', sanitizeDocId(log.id)));
      }
      for (const qId of Object.keys(stateRef.current.attempts)) {
        batch.delete(doc(db, 'users', uid, 'attempts', sanitizeDocId(qId)));
      }
      for (const qId of Object.keys(stateRef.current.mistakes)) {
        batch.delete(doc(db, 'users', uid, 'mistakes', sanitizeDocId(qId)));
      }
      for (const qId of Object.keys(stateRef.current.savedSketches)) {
        batch.delete(doc(db, 'users', uid, 'sketches', sanitizeDocId(qId)));
      }
      for (const m of stateRef.current.mocks) {
        batch.delete(doc(db, 'users', uid, 'mocks', sanitizeDocId(m.id)));
      }
      for (const cardId of Object.keys(stateRef.current.srsCards)) {
        batch.delete(doc(db, 'users', uid, 'srs_cards', sanitizeDocId(cardId)));
      }
      for (const dateIso of Object.keys(stateRef.current.gaStreakLogs)) {
        batch.delete(doc(db, 'users', uid, 'ga_streak', sanitizeDocId(dateIso)));
      }
      for (const qId of Object.keys(stateRef.current.traceTables)) {
        batch.delete(doc(db, 'users', uid, 'trace_tables', sanitizeDocId(qId)));
      }
      for (const pack of stateRef.current.vaultPacks) {
        batch.delete(doc(db, 'users', uid, 'vault_packs', sanitizeDocId(pack.packId)));
      }
      for (const hist of stateRef.current.testHistory) {
        batch.delete(doc(db, 'users', uid, 'test_history', sanitizeDocId(hist.id)));
      }
      await batch.commit();
    } catch (err) {
      console.error('Error resetting Firestore collections:', err);
    }
  }, [persistWorkspaceMeta]);

  // ===================== FREE-TIER AUTONOMOUS PYQ FETCHER =====================

  const runDailyAutopilot = useCallback(
    async (manual = false): Promise<AutopilotRunResult> => {
      const todayIst = getIstDateString();
      if (!manual && stateRef.current.lastAutopilotIstDate === todayIst) {
        return {
          ok: true,
          addedQuestions: 0,
          addedTip: false,
          cached: true,
          message: `Daily Autopilot already synced for ${todayIst} (IST).`,
        };
      }
      if (autopilotLoading) {
        return { ok: false, addedQuestions: 0, addedTip: false, message: 'Autopilot already running.' };
      }

      setAutopilotLoading(true);
      setAutopilotStatusMsg('Syncing daily PYQ batch...');

      try {
        const resp = await fetch('/api/daily-autopilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ existingFingerprints }),
        });
        const data = (await resp.json()) as {
          ok: boolean;
          istDate?: string;
          cached?: boolean;
          quotaExceeded?: boolean;
          questions?: Question[];
          dailyTrap?: Omit<TipItem, 'id' | 'isCustom'> | null;
          message?: string;
        };

        if (data.quotaExceeded) {
          const msg =
            data.message || 'Temporarily busy — try again in a moment. Using your saved question bank.';
          setQuotaNotice(msg);
          setAutopilotStatusMsg(msg);
          return { ok: false, addedQuestions: 0, addedTip: false, quotaExceeded: true, message: msg };
        }

        if (!data.ok) {
          const msg = data.message || 'Using cached PYQ bank.';
          setAutopilotStatusMsg(msg);
          return { ok: false, addedQuestions: 0, addedTip: false, message: msg };
        }

        const fetchedQs = Array.isArray(data.questions) ? data.questions : [];
        if (fetchedQs.length > 0) {
          addImportedQuestions(fetchedQs);
        }

        let addedTip = false;
        if (data.dailyTrap) {
          addCustomTip(data.dailyTrap);
          addedTip = true;
        }

        const syncedIstDate = data.istDate || todayIst;
        const nextState: WarRoomState = {
          ...stateRef.current,
          lastAutopilotIstDate: syncedIstDate,
        };
        setState(nextState);
        void persistWorkspaceMeta(nextState);

        setQuotaNotice('');
        const msg =
          fetchedQs.length > 0
            ? `Synced ${fetchedQs.length} new PYQs${addedTip ? ' + 1 Daily Trap' : ''} for ${syncedIstDate} (IST).`
            : `Synced for ${syncedIstDate} (IST) · All fetched PYQs already in cache.`;
        setAutopilotStatusMsg(msg);
        return {
          ok: true,
          addedQuestions: fetchedQs.length,
          addedTip,
          cached: data.cached,
          message: msg,
        };
      } catch {
        const msg = 'Autopilot offline · Serving cached PYQ bank.';
        setAutopilotStatusMsg(msg);
        return { ok: false, addedQuestions: 0, addedTip: false, message: msg };
      } finally {
        setAutopilotLoading(false);
      }
    },
    [autopilotLoading, existingFingerprints, addImportedQuestions, addCustomTip, persistWorkspaceMeta]
  );

  // Daily Autopilot now runs strictly on manual click (GateR 3,161+ PYQs auto-sync via IndexedDB with zero quota burn)

  const fetchMoreSubjectPyqs = useCallback(
    async (subjectId: SubjectId): Promise<SubjectFetchResult> => {
      const now = Date.now();
      const cooldownUntil = subjectCooldownUntil[subjectId] ?? 0;
      if (now < cooldownUntil) {
        const wait = Math.ceil((cooldownUntil - now) / 1000);
        return {
          ok: false,
          addedCount: 0,
          cooldown: true,
          retryAfterSeconds: wait,
          message: `Cooldown active. Try again in ${wait}s.`,
        };
      }

      setSubjectFetching(subjectId);
      setSubjectCooldownUntil((prev) => ({
        ...prev,
        [subjectId]: Date.now() + SUBJECT_COOLDOWN_MS,
      }));

      try {
        const resp = await fetch('/api/fetch-subject-pyqs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, existingFingerprints }),
        });
        const data = (await resp.json()) as {
          ok: boolean;
          quotaExceeded?: boolean;
          cooldown?: boolean;
          retryAfterSeconds?: number;
          questions?: Question[];
          message?: string;
        };

        if (data.quotaExceeded) {
          const msg =
            data.message || 'Temporarily busy — try again in a moment. Using your saved question bank.';
          setQuotaNotice(msg);
          return { ok: false, addedCount: 0, quotaExceeded: true, message: msg };
        }

        if (!data.ok) {
          return {
            ok: false,
            addedCount: 0,
            cooldown: data.cooldown,
            retryAfterSeconds: data.retryAfterSeconds,
            message: data.message || 'Could not fetch more PYQs right now.',
          };
        }

        const fetchedQs = Array.isArray(data.questions) ? data.questions : [];
        if (fetchedQs.length > 0) {
          addImportedQuestions(fetchedQs);
        }
        setQuotaNotice('');
        return {
          ok: true,
          addedCount: fetchedQs.length,
          message:
            fetchedQs.length > 0
              ? `Added ${fetchedQs.length} unseen PYQ(s) to your cached bank.`
              : 'All returned PYQs were already in your bank (deduplicated).',
        };
      } catch {
        return {
          ok: false,
          addedCount: 0,
          message: 'Network error · Serving cached PYQ bank.',
        };
      } finally {
        setSubjectFetching(null);
      }
    },
    [subjectCooldownUntil, existingFingerprints, addImportedQuestions]
  );

  const ingestPublicUrl = useCallback(
    async (url: string): Promise<UrlIngestResult> => {
      setUrlIngestLoading(true);
      try {
        const resp = await fetch('/api/ingest-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, existingFingerprints }),
        });
        const data = (await resp.json()) as {
          ok: boolean;
          quotaExceeded?: boolean;
          questions?: Question[];
          message?: string;
        };

        if (data.quotaExceeded) {
          const msg =
            data.message || 'Temporarily busy — try again in a moment. Using your saved question bank.';
          setQuotaNotice(msg);
          return { ok: false, addedCount: 0, quotaExceeded: true, message: msg };
        }

        if (!data.ok) {
          return {
            ok: false,
            addedCount: 0,
            message: data.message || 'Unable to extract questions from that URL.',
          };
        }

        const fetchedQs = Array.isArray(data.questions) ? data.questions : [];
        if (fetchedQs.length > 0) {
          addImportedQuestions(fetchedQs);
        }
        setQuotaNotice('');
        return {
          ok: true,
          addedCount: fetchedQs.length,
          message: `Extracted and saved ${fetchedQs.length} structured GATE question(s) into your bank.`,
        };
      } catch {
        return {
          ok: false,
          addedCount: 0,
          message: 'Network error while importing URL.',
        };
      } finally {
        setUrlIngestLoading(false);
      }
    },
    [existingFingerprints, addImportedQuestions]
  );

  return {
    state,
    user,
    authReady,
    syncStatus,
    authError,
    quotaNotice,
    autopilotLoading,
    autopilotStatusMsg,
    subjectFetching,
    subjectCooldownUntil,
    urlIngestLoading,
    trapsGenerating,
    trapsCooldownUntil,
    trapsNotice,
    gaterSyncStatus,
    gaterCount: gaterRawCount || gaterQuestions.length,
    arshanCount,
    enrichedCount,
    verifiedBankCount,
    syncProgressMsg,
    gaterSyncedAt,
    gaterError,
    allQuestions,
    allTips,
    allVaultCards,
    signInWithGoogle: handleSignInGoogle,
    signOut: handleSignOut,
    syncGateRFromRepo,
    syncAllRepos,
    saveVerifiedAnswer,
    verifySinglePyqWithAi,
    runDailyAutopilot,
    fetchMoreSubjectPyqs,
    ingestPublicUrl,
    generateFreshTraps,
    ensureDailyTrapsLoaded,
    recordSrsRating,
    toggleTheme,
    setThemeMode,
    setAccentTheme,
    setSimpleMode,
    standaloneRoughWork,
    saveStandaloneRoughWork,
    getOrCreateTodayDailyDpp,
    completeTodayDailyDpp,
    getOrCreateTodayDailyGa,
    completeTodayDailyGa,
    cycleSubtopicStatus,
    setSubtopicConfidence,
    markSubtopicRevised,
    saveSubtopicNotes,
    logStudySession,
    updateStudyLog,
    deleteStudyLog,
    recordQuestionAttempt,
    recordTestHistoryEntry,
    deleteTestHistoryEntry,
    toggleQuestionBookmark,
    updateMistakeTag,
    updateMistakeNote,
    toggleMistakeResolved,
    saveSketchForQuestion,
    deleteSketchForQuestion,
    saveTraceTable,
    deleteTraceTable,
    recordGaSprintCompletion,
    addImportedQuestions,
    toggleTipBookmark,
    addCustomTip,
    deleteCustomTip,
    importVaultPack,
    deleteVaultPack,
    addCustomVaultCard,
    deleteVaultCard,
    syncVaultFromGithub,
    addMockTest,
    updateMockTest,
    deleteMockTest,
    updateProfile,
    updateSettings,
    importFullBackup,
    resetAllData,
  };
}
