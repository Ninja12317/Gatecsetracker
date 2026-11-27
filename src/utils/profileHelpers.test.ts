import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_AVATAR_DATA_URL_MAX,
  PROFILE_BIO_MAX,
  PROFILE_DISPLAY_NAME_MAX,
  PROFILE_TARGET_GOAL_MAX,
  createEmptyUserProfile,
  estimateDataUrlBytes,
  isValidAvatarDataUrl,
  resolveEffectiveProfile,
  sanitizeUserProfile,
  shouldApplyRemoteProfile,
} from './profileHelpers.ts';

test('sanitizeUserProfile clamps field lengths and rejects malformed avatar URLs', () => {
  const validTinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  const clean = sanitizeUserProfile({
    displayName: `  ${'A'.repeat(120)}  `,
    targetGoal: 'G'.repeat(200),
    bio: 'B'.repeat(450),
    avatarDataUrl: validTinyPng,
    profileUpdatedAt: 1710000000123.9,
  });

  assert.equal(clean.displayName.length, PROFILE_DISPLAY_NAME_MAX);
  assert.equal(clean.targetGoal.length, PROFILE_TARGET_GOAL_MAX);
  assert.equal(clean.bio.length, PROFILE_BIO_MAX);
  assert.equal(clean.avatarDataUrl, validTinyPng);
  assert.equal(clean.profileUpdatedAt, 1710000000123);

  const rejectedSvg = sanitizeUserProfile({
    displayName: 'Nihal',
    avatarDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
  });
  assert.equal(rejectedSvg.avatarDataUrl, '');

  const rejectedOversize = sanitizeUserProfile({
    avatarDataUrl: `data:image/webp;base64,${'A'.repeat(PROFILE_AVATAR_DATA_URL_MAX + 10)}`,
  });
  assert.equal(rejectedOversize.avatarDataUrl, '');
  assert.equal(isValidAvatarDataUrl('https://evil.example/avatar.png'), false);
  assert.equal(isValidAvatarDataUrl(''), true);
});

test('resolveEffectiveProfile prioritizes custom profile over Google auth and falls back cleanly', () => {
  const validWebp = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const authUser = {
    uid: 'u1',
    displayName: 'Google Name',
    email: 'user@example.com',
    photoURL: 'https://lh3.googleusercontent.com/photo.jpg',
  };

  // Fallback when signed out and no custom profile
  const guest = resolveEffectiveProfile(createEmptyUserProfile(), null);
  assert.equal(guest.displayName, "GATE '27 Aspirant");
  assert.equal(guest.avatarUrl, null);
  assert.equal(guest.initials, 'GA');
  assert.equal(guest.hasCustomAvatar, false);

  // Google user with no custom overrides
  const googleOnly = resolveEffectiveProfile(createEmptyUserProfile(), authUser);
  assert.equal(googleOnly.displayName, 'Google Name');
  assert.equal(googleOnly.avatarUrl, authUser.photoURL);
  assert.equal(googleOnly.initials, 'GN');
  assert.equal(googleOnly.hasCustomAvatar, false);

  // Custom overrides win over Google auth
  const custom = resolveEffectiveProfile(
    {
      displayName: 'Nihal Pawar',
      targetGoal: 'GATE CSE 2027 · AIR < 100',
      bio: 'CS Final Year',
      avatarDataUrl: validWebp,
      profileUpdatedAt: 5000,
    },
    authUser
  );
  assert.equal(custom.displayName, 'Nihal Pawar');
  assert.equal(custom.avatarUrl, validWebp);
  assert.equal(custom.initials, 'NP');
  assert.equal(custom.targetGoal, 'GATE CSE 2027 · AIR < 100');
  assert.equal(custom.bio, 'CS Final Year');
  assert.equal(custom.hasCustomAvatar, true);
});

test('shouldApplyRemoteProfile preserves newer local edits and estimateDataUrlBytes calculates size', () => {
  assert.equal(
    shouldApplyRemoteProfile(
      { displayName: 'Local', targetGoal: '', bio: '', avatarDataUrl: '', profileUpdatedAt: 2000 },
      { displayName: 'Stale', targetGoal: '', bio: '', avatarDataUrl: '', profileUpdatedAt: 1000 }
    ),
    false
  );
  assert.equal(
    shouldApplyRemoteProfile(
      { displayName: 'Local', targetGoal: '', bio: '', avatarDataUrl: '', profileUpdatedAt: 1000 },
      { displayName: 'Newer', targetGoal: '', bio: '', avatarDataUrl: '', profileUpdatedAt: 2000 }
    ),
    true
  );
  assert.equal(
    shouldApplyRemoteProfile(
      createEmptyUserProfile(),
      { displayName: 'Remote', targetGoal: '', bio: '', avatarDataUrl: '', profileUpdatedAt: 0 }
    ),
    true
  );

  const bytes = estimateDataUrlBytes('data:image/png;base64,AAAA');
  assert.equal(bytes, 3);
});
