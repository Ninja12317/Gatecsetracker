import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCENT_THEME_STORAGE_KEY,
  ACCENT_UPDATED_AT_STORAGE_KEY,
  LEGACY_THEME_BOOT_STORAGE_KEY,
  LEGACY_WAR_ROOM_STORAGE_KEY,
  isValidAccentTheme,
  readLocalAccentSelection,
  resolveRemoteAccentSync,
  writeLocalAccentSelection,
} from './accentThemePersistence.ts';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  };
}

test('isValidAccentTheme validates all 8 curated themes and rejects invalid values', () => {
  for (const id of ['brown', 'green', 'red', 'blue', 'teal', 'graphite', 'navy', 'olive']) {
    assert.equal(isValidAccentTheme(id), true);
  }
  assert.equal(isValidAccentTheme('purple'), false);
  assert.equal(isValidAccentTheme(''), false);
  assert.equal(isValidAccentTheme(undefined), false);
  assert.equal(isValidAccentTheme(null), false);
});

test('readLocalAccentSelection prioritizes canonical gate27_accent_theme over legacy keys', () => {
  const storage = createMemoryStorage({
    [ACCENT_THEME_STORAGE_KEY]: 'teal',
    [ACCENT_UPDATED_AT_STORAGE_KEY]: '1730000005000',
    [LEGACY_THEME_BOOT_STORAGE_KEY]: JSON.stringify({ mode: 'dark', accent: 'brown' }),
    [LEGACY_WAR_ROOM_STORAGE_KEY]: JSON.stringify({ settings: { accentTheme: 'red' } }),
  });

  const result = readLocalAccentSelection(storage);
  assert.equal(result.accentTheme, 'teal');
  assert.equal(result.accentUpdatedAt, 1730000005000);
  assert.equal(result.hasExplicitLocalSelection, true);
});

test('readLocalAccentSelection falls back cleanly to legacy keys when canonical key is absent', () => {
  const bootOnly = createMemoryStorage({
    [LEGACY_THEME_BOOT_STORAGE_KEY]: JSON.stringify({ mode: 'light', accent: 'navy' }),
  });
  assert.equal(readLocalAccentSelection(bootOnly).accentTheme, 'navy');

  const stateOnly = createMemoryStorage({
    [LEGACY_WAR_ROOM_STORAGE_KEY]: JSON.stringify({
      settings: { accentTheme: 'olive', accentUpdatedAt: 1730000001234 },
    }),
  });
  const fromState = readLocalAccentSelection(stateOnly);
  assert.equal(fromState.accentTheme, 'olive');
  assert.equal(fromState.accentUpdatedAt, 1730000001234);
});

test('writeLocalAccentSelection syncs canonical keys and preserves themeMode in boot cache', () => {
  const storage = createMemoryStorage({
    [LEGACY_THEME_BOOT_STORAGE_KEY]: JSON.stringify({ mode: 'dark', accent: 'brown' }),
  });

  writeLocalAccentSelection('blue', 1730000099999, storage);

  assert.equal(storage.getItem(ACCENT_THEME_STORAGE_KEY), 'blue');
  assert.equal(storage.getItem(ACCENT_UPDATED_AT_STORAGE_KEY), '1730000099999');
  assert.deepEqual(JSON.parse(storage.getItem(LEGACY_THEME_BOOT_STORAGE_KEY) || '{}'), {
    mode: 'dark',
    accent: 'blue',
  });
});

test('resolveRemoteAccentSync NEVER overwrites valid local theme when remote accentTheme is missing or undefined', () => {
  const decision = resolveRemoteAccentSync({
    localTheme: 'green',
    localUpdatedAt: 1730000050000,
    remoteTheme: undefined,
    remoteUpdatedAt: undefined,
    hasPendingWrites: false,
  });

  assert.equal(decision.accentTheme, 'green');
  assert.equal(decision.shouldApplyRemote, false);
  assert.equal(decision.shouldPushLocalToRemote, true);
});

test('resolveRemoteAccentSync skips snapshot when hasPendingWrites is true', () => {
  const decision = resolveRemoteAccentSync({
    localTheme: 'red',
    localUpdatedAt: 1730000050000,
    remoteTheme: 'brown',
    remoteUpdatedAt: 1730000099999,
    hasPendingWrites: true,
  });

  assert.equal(decision.accentTheme, 'red');
  assert.equal(decision.shouldApplyRemote, false);
  assert.equal(decision.shouldPushLocalToRemote, false);
});

test('resolveRemoteAccentSync rejects stale remote snapshot with older or missing timestamp', () => {
  // Stale remote snapshot with older timestamp
  const stale = resolveRemoteAccentSync({
    localTheme: 'teal',
    localUpdatedAt: 1730000050000,
    remoteTheme: 'brown',
    remoteUpdatedAt: 1730000040000,
    hasPendingWrites: false,
  });
  assert.equal(stale.accentTheme, 'teal');
  assert.equal(stale.shouldApplyRemote, false);
  assert.equal(stale.shouldPushLocalToRemote, true);

  // Legacy remote doc with 'brown' and no timestamp must NOT overwrite freshly picked 'blue'
  const legacyRemote = resolveRemoteAccentSync({
    localTheme: 'blue',
    localUpdatedAt: 1730000050000,
    remoteTheme: 'brown',
    remoteUpdatedAt: undefined,
    hasPendingWrites: false,
  });
  assert.equal(legacyRemote.accentTheme, 'blue');
  assert.equal(legacyRemote.shouldApplyRemote, false);
  assert.equal(legacyRemote.shouldPushLocalToRemote, true);
});

test('resolveRemoteAccentSync applies remote theme when remoteUpdatedAt is strictly newer', () => {
  const decision = resolveRemoteAccentSync({
    localTheme: 'green',
    localUpdatedAt: 1730000050000,
    remoteTheme: 'graphite',
    remoteUpdatedAt: 1730000080000,
    hasPendingWrites: false,
  });

  assert.equal(decision.accentTheme, 'graphite');
  assert.equal(decision.accentUpdatedAt, 1730000080000);
  assert.equal(decision.shouldApplyRemote, true);
  assert.equal(decision.shouldPushLocalToRemote, false);
});

test('resolveRemoteAccentSync adopts legacy remote non-brown theme on a fresh device (localUpdatedAt=0)', () => {
  const decision = resolveRemoteAccentSync({
    localTheme: 'brown',
    localUpdatedAt: 0,
    remoteTheme: 'navy',
    remoteUpdatedAt: undefined,
    hasPendingWrites: false,
  });

  assert.equal(decision.accentTheme, 'navy');
  assert.equal(decision.shouldApplyRemote, true);
  assert.equal(decision.shouldPushLocalToRemote, false);
});
