import type { AccentThemeId } from '../types/index.ts';
import { VALID_ACCENT_THEMES } from './themeEngine.ts';

export const ACCENT_THEME_STORAGE_KEY = 'gate27_accent_theme';
export const ACCENT_UPDATED_AT_STORAGE_KEY = 'gate27_accent_updated_at';
export const LEGACY_THEME_BOOT_STORAGE_KEY = 'gate27_theme_boot_v1';
export const LEGACY_WAR_ROOM_STORAGE_KEY = 'gate27_war_room_state_v2';

export interface StorageReader {
  getItem(key: string): string | null;
}

export interface StorageReadWriter extends StorageReader {
  setItem(key: string, value: string): void;
}

export interface LocalAccentSelection {
  accentTheme: AccentThemeId;
  accentUpdatedAt: number;
  hasExplicitLocalSelection: boolean;
}

export interface RemoteAccentSyncInput {
  localTheme: AccentThemeId;
  localUpdatedAt: number;
  remoteTheme: unknown;
  remoteUpdatedAt: unknown;
  hasPendingWrites: boolean;
}

export interface RemoteAccentSyncDecision {
  accentTheme: AccentThemeId;
  accentUpdatedAt: number;
  shouldApplyRemote: boolean;
  shouldPushLocalToRemote: boolean;
}

export function isValidAccentTheme(raw: unknown): raw is AccentThemeId {
  return (
    typeof raw === 'string' &&
    (VALID_ACCENT_THEMES as readonly string[]).includes(raw)
  );
}

export function parseAccentUpdatedAt(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.min(9_999_999_999_999, Math.floor(raw));
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(9_999_999_999_999, Math.floor(parsed));
    }
  }
  return 0;
}

function getDefaultStorage(): StorageReadWriter | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Synchronously reads the user's persisted accent theme and timestamp.
 * Priority:
 * 1. Canonical `gate27_accent_theme` + `gate27_accent_updated_at`
 * 2. Boot cache `gate27_theme_boot_v1` (`.accent`)
 * 3. Legacy state blob `gate27_war_room_state_v2` (`.settings.accentTheme`)
 * 4. Default `'brown'` with timestamp `0`
 */
export function readLocalAccentSelection(
  storage?: StorageReader | null
): LocalAccentSelection {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) {
    return {
      accentTheme: 'brown',
      accentUpdatedAt: 0,
      hasExplicitLocalSelection: false,
    };
  }

  try {
    const directAccent = store.getItem(ACCENT_THEME_STORAGE_KEY);
    const directUpdatedAt = parseAccentUpdatedAt(
      store.getItem(ACCENT_UPDATED_AT_STORAGE_KEY)
    );

    if (isValidAccentTheme(directAccent)) {
      return {
        accentTheme: directAccent,
        accentUpdatedAt: directUpdatedAt,
        hasExplicitLocalSelection: true,
      };
    }

    const bootRaw = store.getItem(LEGACY_THEME_BOOT_STORAGE_KEY);
    if (bootRaw) {
      const boot = JSON.parse(bootRaw) as { accent?: unknown } | null;
      if (boot && isValidAccentTheme(boot.accent)) {
        return {
          accentTheme: boot.accent,
          accentUpdatedAt: directUpdatedAt,
          hasExplicitLocalSelection: boot.accent !== 'brown' || directUpdatedAt > 0,
        };
      }
    }

    const stateRaw = store.getItem(LEGACY_WAR_ROOM_STORAGE_KEY);
    if (stateRaw) {
      const parsed = JSON.parse(stateRaw) as {
        settings?: { accentTheme?: unknown; accentUpdatedAt?: unknown };
      } | null;
      if (parsed?.settings && isValidAccentTheme(parsed.settings.accentTheme)) {
        const legacyTs = parseAccentUpdatedAt(parsed.settings.accentUpdatedAt);
        return {
          accentTheme: parsed.settings.accentTheme,
          accentUpdatedAt: Math.max(directUpdatedAt, legacyTs),
          hasExplicitLocalSelection:
            parsed.settings.accentTheme !== 'brown' || Math.max(directUpdatedAt, legacyTs) > 0,
        };
      }
    }
  } catch {
    // Ignore corrupt JSON or restricted storage environments
  }

  return {
    accentTheme: 'brown',
    accentUpdatedAt: 0,
    hasExplicitLocalSelection: false,
  };
}

/**
 * Atomically writes the canonical accent theme + monotonic timestamp into localStorage
 * and keeps the boot cache (`gate27_theme_boot_v1`) synchronized.
 */
export function writeLocalAccentSelection(
  accent: AccentThemeId,
  updatedAtMs: number,
  storage?: StorageReadWriter | null
): { accentTheme: AccentThemeId; accentUpdatedAt: number } {
  const safeAccent: AccentThemeId = isValidAccentTheme(accent) ? accent : 'brown';
  const safeTs = parseAccentUpdatedAt(updatedAtMs);
  const store = storage === undefined ? getDefaultStorage() : storage;

  if (store) {
    try {
      store.setItem(ACCENT_THEME_STORAGE_KEY, safeAccent);
      if (safeTs > 0) {
        store.setItem(ACCENT_UPDATED_AT_STORAGE_KEY, String(safeTs));
      }

      let existingMode: 'light' | 'dark' | 'system' = 'light';
      const bootRaw = store.getItem(LEGACY_THEME_BOOT_STORAGE_KEY);
      if (bootRaw) {
        try {
          const parsed = JSON.parse(bootRaw) as { mode?: unknown } | null;
          if (
            parsed?.mode === 'dark' ||
            parsed?.mode === 'light' ||
            parsed?.mode === 'system'
          ) {
            existingMode = parsed.mode;
          }
        } catch {
          // ignore invalid boot cache
        }
      }
      store.setItem(
        LEGACY_THEME_BOOT_STORAGE_KEY,
        JSON.stringify({ mode: existingMode, accent: safeAccent })
      );
    } catch {
      // ignore storage quota errors
    }
  }

  return { accentTheme: safeAccent, accentUpdatedAt: safeTs };
}

/**
 * Applies `data-accent` directly to `document.documentElement` synchronously.
 */
export function applyAccentAttributeToDom(accent: AccentThemeId): AccentThemeId {
  const safeAccent: AccentThemeId = isValidAccentTheme(accent) ? accent : 'brown';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-accent', safeAccent);
  }
  return safeAccent;
}

/**
 * Race-safe Firestore onSnapshot reconciliation for `accentTheme`:
 * 1. Skips optimistic local snapshots (`hasPendingWrites === true`).
 * 2. NEVER overwrites a valid local theme with `'brown'` if remote `accentTheme` is missing/invalid.
 * 3. Only applies remote `accentTheme` when `remoteUpdatedAt > localUpdatedAt`
 *    (or on a fresh device with `localUpdatedAt === 0` receiving a valid non-default legacy remote theme).
 * 4. Signals `shouldPushLocalToRemote` when a newer local selection should heal an older/missing remote doc.
 */
export function resolveRemoteAccentSync(
  input: RemoteAccentSyncInput
): RemoteAccentSyncDecision {
  const safeLocalTheme: AccentThemeId = isValidAccentTheme(input.localTheme)
    ? input.localTheme
    : 'brown';
  const localTs = parseAccentUpdatedAt(input.localUpdatedAt);

  if (input.hasPendingWrites) {
    return {
      accentTheme: safeLocalTheme,
      accentUpdatedAt: localTs,
      shouldApplyRemote: false,
      shouldPushLocalToRemote: false,
    };
  }

  if (!isValidAccentTheme(input.remoteTheme)) {
    return {
      accentTheme: safeLocalTheme,
      accentUpdatedAt: localTs,
      shouldApplyRemote: false,
      shouldPushLocalToRemote: localTs > 0 || safeLocalTheme !== 'brown',
    };
  }

  const remoteTheme = input.remoteTheme;
  const remoteTs = parseAccentUpdatedAt(input.remoteUpdatedAt);

  if (remoteTs > localTs) {
    return {
      accentTheme: remoteTheme,
      accentUpdatedAt: remoteTs,
      shouldApplyRemote: true,
      shouldPushLocalToRemote: false,
    };
  }

  if (remoteTs === 0 && localTs === 0) {
    // Legacy Firestore document without timestamp on a fresh device:
    // adopt a valid non-brown remote theme, but never let a legacy 'brown' doc clobber a non-brown local theme.
    if (safeLocalTheme === 'brown' && remoteTheme !== 'brown') {
      return {
        accentTheme: remoteTheme,
        accentUpdatedAt: 0,
        shouldApplyRemote: true,
        shouldPushLocalToRemote: false,
      };
    }
    return {
      accentTheme: safeLocalTheme,
      accentUpdatedAt: 0,
      shouldApplyRemote: false,
      shouldPushLocalToRemote: safeLocalTheme !== 'brown' && remoteTheme !== safeLocalTheme,
    };
  }

  // Local timestamp is newer than or equal to remote timestamp: preserve local strictly.
  const localIsStrictlyNewer = localTs > remoteTs;
  return {
    accentTheme: safeLocalTheme,
    accentUpdatedAt: localTs,
    shouldApplyRemote: false,
    shouldPushLocalToRemote:
      localIsStrictlyNewer && (remoteTheme !== safeLocalTheme || remoteTs === 0),
  };
}
