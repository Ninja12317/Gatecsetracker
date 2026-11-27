import type { AuthUserSummary, UserProfile } from '../types/index.ts';

export const PROFILE_DISPLAY_NAME_MAX = 80;
export const PROFILE_TARGET_GOAL_MAX = 120;
export const PROFILE_BIO_MAX = 300;
export const PROFILE_AVATAR_DATA_URL_MAX = 35000;
export const PROFILE_AVATAR_MAX_BYTES = 25 * 1024; // 25 KB ceiling
export const PROFILE_AVATAR_DIMENSION = 160;
export const PROFILE_AVATAR_DATA_URL_REGEX =
  /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

export function createEmptyUserProfile(): UserProfile {
  return {
    displayName: '',
    targetGoal: '',
    bio: '',
    avatarDataUrl: '',
    profileUpdatedAt: 0,
  };
}

export function isValidAvatarDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (value.length > PROFILE_AVATAR_DATA_URL_MAX) return false;
  return PROFILE_AVATAR_DATA_URL_REGEX.test(value);
}

export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return 0;
  const b64 = dataUrl.slice(commaIdx + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function sanitizeUserProfile(raw: unknown): UserProfile {
  if (!raw || typeof raw !== 'object') {
    return createEmptyUserProfile();
  }
  const obj = raw as Record<string, unknown>;
  const displayName =
    typeof obj.displayName === 'string'
      ? obj.displayName.trim().slice(0, PROFILE_DISPLAY_NAME_MAX)
      : '';
  const targetGoal =
    typeof obj.targetGoal === 'string'
      ? obj.targetGoal.trim().slice(0, PROFILE_TARGET_GOAL_MAX)
      : '';
  const bio =
    typeof obj.bio === 'string'
      ? obj.bio.trim().slice(0, PROFILE_BIO_MAX)
      : '';
  const avatarDataUrl = isValidAvatarDataUrl(obj.avatarDataUrl)
    ? obj.avatarDataUrl
    : '';
  const rawTs = Number(obj.profileUpdatedAt);
  const profileUpdatedAt =
    Number.isFinite(rawTs) && rawTs >= 0 && rawTs <= 9999999999999
      ? Math.floor(rawTs)
      : 0;

  return {
    displayName,
    targetGoal,
    bio,
    avatarDataUrl,
    profileUpdatedAt,
  };
}

export interface EffectiveUserProfile {
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  targetGoal: string;
  bio: string;
  hasCustomAvatar: boolean;
}

export function resolveEffectiveProfile(
  profile: UserProfile | undefined,
  authUser: AuthUserSummary | null
): EffectiveUserProfile {
  const clean = sanitizeUserProfile(profile);
  const displayName =
    clean.displayName ||
    authUser?.displayName?.trim() ||
    "GATE '27 Aspirant";
  const avatarUrl = clean.avatarDataUrl || authUser?.photoURL || null;
  const alphaWords: string[] = displayName.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  const firstWord = alphaWords[0];
  const secondWord = alphaWords[1];
  const initials =
    firstWord && secondWord
      ? `${firstWord.charAt(0)}${secondWord.charAt(0)}`.toUpperCase()
      : firstWord
      ? firstWord.slice(0, 2).toUpperCase()
      : displayName.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'G7';

  return {
    displayName,
    avatarUrl,
    initials,
    targetGoal: clean.targetGoal,
    bio: clean.bio,
    hasCustomAvatar: Boolean(clean.avatarDataUrl),
  };
}

export function shouldApplyRemoteProfile(
  localProfile: UserProfile | undefined,
  remoteProfile: UserProfile | undefined
): boolean {
  if (!remoteProfile) return false;
  const localTs = localProfile?.profileUpdatedAt ?? 0;
  const remoteTs = remoteProfile.profileUpdatedAt ?? 0;
  if (localTs === 0) return true;
  return remoteTs >= localTs;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image file contents.'));
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function compressAvatarFileToDataUrl(file: File): Promise<{
  dataUrl: string;
  byteSize: number;
  format: 'webp' | 'jpeg';
}> {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WebP).');
  }

  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error('Unable to read image dimensions.');
  }

  // Center-crop square to 160x160 so avatars stay sharp and compact (< 25 KB)
  const side = Math.min(srcW, srcH);
  const sx = Math.floor((srcW - side) / 2);
  const sy = Math.floor((srcH - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_AVATAR_DIMENSION;
  canvas.height = PROFILE_AVATAR_DIMENSION;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing is unavailable in this browser.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Warm neutral fill behind transparent PNGs
  ctx.fillStyle = '#FAF8F4';
  ctx.fillRect(0, 0, PROFILE_AVATAR_DIMENSION, PROFILE_AVATAR_DIMENSION);
  ctx.drawImage(
    img,
    sx,
    sy,
    side,
    side,
    0,
    0,
    PROFILE_AVATAR_DIMENSION,
    PROFILE_AVATAR_DIMENSION
  );

  const attempts: Array<{ mime: 'image/webp' | 'image/jpeg'; format: 'webp' | 'jpeg'; quality: number }> = [
    { mime: 'image/webp', format: 'webp', quality: 0.82 },
    { mime: 'image/webp', format: 'webp', quality: 0.68 },
    { mime: 'image/webp', format: 'webp', quality: 0.52 },
    { mime: 'image/jpeg', format: 'jpeg', quality: 0.78 },
    { mime: 'image/jpeg', format: 'jpeg', quality: 0.62 },
    { mime: 'image/jpeg', format: 'jpeg', quality: 0.45 },
    { mime: 'image/jpeg', format: 'jpeg', quality: 0.32 },
  ];

  let smallestFallback: { dataUrl: string; byteSize: number; format: 'webp' | 'jpeg' } | null = null;

  for (const attempt of attempts) {
    const dataUrl = canvas.toDataURL(attempt.mime, attempt.quality);
    if (!PROFILE_AVATAR_DATA_URL_REGEX.test(dataUrl)) continue;
    const byteSize = estimateDataUrlBytes(dataUrl);
    if (
      !smallestFallback ||
      dataUrl.length < smallestFallback.dataUrl.length
    ) {
      smallestFallback = { dataUrl, byteSize, format: attempt.format };
    }
    if (
      byteSize <= PROFILE_AVATAR_MAX_BYTES &&
      dataUrl.length <= PROFILE_AVATAR_DATA_URL_MAX
    ) {
      return { dataUrl, byteSize, format: attempt.format };
    }
  }

  if (
    smallestFallback &&
    smallestFallback.dataUrl.length <= PROFILE_AVATAR_DATA_URL_MAX
  ) {
    return smallestFallback;
  }

  throw new Error('Image is too complex to compress under 25 KB. Try a simpler photo.');
}
