import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export type PwaPlatformHint = 'ios' | 'android' | 'desktop';

// Capture beforeinstallprompt globally as early as module load so it is never missed across tab switches
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

function notifyPromptListeners() {
  for (const listener of promptListeners) {
    listener(globalDeferredPrompt);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    globalDeferredPrompt = event as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    notifyPromptListeners();
  });
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  );
  return mediaStandalone || iosStandalone;
}

function detectPlatformHint(): PwaPlatformHint {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

function detectInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export interface PwaInstallController {
  canPromptNatively: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  swActive: boolean;
  platformHint: PwaPlatformHint;
  isInIframe: boolean;
  guideOpen: boolean;
  openGuide: () => void;
  closeGuide: () => void;
  triggerInstall: () => Promise<'accepted' | 'dismissed' | 'fallback'>;
}

export function usePwaInstall(): PwaInstallController {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandalone());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swActive, setSwActive] = useState<boolean>(false);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);

  const platformHint = detectPlatformHint();
  const isInIframe = detectInIframe();

  useEffect(() => {
    const listener = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
    };
    promptListeners.add(listener);
    if (globalDeferredPrompt !== deferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
    }

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setGuideOpen(false);
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const onDisplayChange = () => setIsInstalled(detectStandalone());
    mediaQuery?.addEventListener?.('change', onDisplayChange);

    // Inspect service worker registration state without throwing in restricted sandboxes
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg && (reg.active || reg.waiting || reg.installing)) {
            setSwActive(true);
          }
        })
        .catch(() => undefined);
    }

    return () => {
      promptListeners.delete(listener);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      mediaQuery?.removeEventListener?.('change', onDisplayChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'fallback'> => {
    const promptEvent = globalDeferredPrompt || deferredPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          globalDeferredPrompt = null;
          notifyPromptListeners();
          setIsInstalled(true);
          return 'accepted';
        }
        return 'dismissed';
      } catch {
        setGuideOpen(true);
        return 'fallback';
      }
    }
    setGuideOpen(true);
    return 'fallback';
  }, [deferredPrompt]);

  const openGuide = useCallback(() => setGuideOpen(true), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  return {
    canPromptNatively: Boolean(deferredPrompt),
    isInstalled,
    isOnline,
    swActive,
    platformHint,
    isInIframe,
    guideOpen,
    openGuide,
    closeGuide,
    triggerInstall,
  };
}
