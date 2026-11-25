import React, { useEffect } from 'react';
import {
  X,
  Download,
  Smartphone,
  Monitor,
  Share,
  MoreVertical,
  WifiOff,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import type { PwaPlatformHint } from '../hooks/usePwaInstall';

interface PwaInstallModalProps {
  open: boolean;
  onClose: () => void;
  platformHint: PwaPlatformHint;
  isInIframe: boolean;
  isInstalled: boolean;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  open,
  onClose,
  platformHint,
  isInIframe,
  isInstalled,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 no-print flex items-center justify-center p-4 bg-[#1C1613]/45 dark:bg-black/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Install GATE '27 App"
        data-testid="pwa-install-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[28px] squircle bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] shadow-warm-lg overflow-hidden"
      >
        {/* Header with bespoke GATE CSE '27 icon */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-[#EFE9DF] dark:border-[#2E2520]">
          <div className="flex items-center gap-3.5">
            <img
              src="/icon.svg"
              alt="GATE CSE '27 App Icon"
              className="h-12 w-12 rounded-[14px] shadow-sm border border-[#C89216]/40 shrink-0"
            />
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Install GATE &apos;27 App
              </h2>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                Full-screen standalone app · Offline PYQs &amp; Focus Timer
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="h-8 w-8 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] flex items-center justify-center press-tactile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {isInstalled ? (
            <div className="rounded-[20px] bg-[#EBF5EE] dark:bg-[#152B1D] border border-[#B9D6C2] dark:border-[#254A33] p-4 flex items-center gap-3 text-xs font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>GATE &apos;27 is already installed and running as a standalone app.</span>
            </div>
          ) : (
            <>
              {isInIframe && (
                <div className="rounded-[18px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-4 py-3 text-xs text-[#7D570A] dark:text-[#E8BF5A] flex items-start gap-2.5">
                  <ExternalLink className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Browser install prompts are paused inside embedded preview frames. Open the deployed app URL directly in Chrome, Edge, or Safari to install in 2 taps.
                  </span>
                </div>
              )}

              {/* Platform-Tailored 2-Step Instructions */}
              <div className="space-y-2.5">
                {platformHint === 'ios' ? (
                  <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">
                      <Smartphone className="w-4 h-4" />
                      iPhone &amp; iPad (Safari) — 2 Quick Steps
                    </div>
                    <ol className="text-xs text-[#1C1613] dark:text-[#F5F0E8] space-y-2 pl-4 list-decimal">
                      <li>
                        Open the deployed URL in <strong>Safari</strong> and tap the{' '}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EFE9DF] dark:bg-[#1C1714] font-semibold">
                          <Share className="w-3 h-3" /> Share
                        </span>{' '}
                        button at the bottom bar.
                      </li>
                      <li>
                        Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> →{' '}
                        <strong>Add</strong>.
                      </li>
                    </ol>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">
                        <Smartphone className="w-4 h-4" />
                        Android (Chrome / Edge)
                      </div>
                      <ol className="text-xs text-[#1C1613] dark:text-[#F5F0E8] space-y-1.5 pl-4 list-decimal">
                        <li>
                          Open the deployed URL in Chrome and tap the{' '}
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#EFE9DF] dark:bg-[#1C1714] font-semibold">
                            <MoreVertical className="w-3 h-3" /> Menu
                          </span>{' '}
                          icon at the top-right.
                        </li>
                        <li>
                          Tap <strong>&ldquo;Install app&rdquo;</strong> or{' '}
                          <strong>&ldquo;Add to Home screen&rdquo;</strong>.
                        </li>
                      </ol>
                    </div>

                    <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">
                        <Monitor className="w-4 h-4" />
                        Desktop (Chrome / Edge / Brave)
                      </div>
                      <ol className="text-xs text-[#1C1613] dark:text-[#F5F0E8] space-y-1.5 pl-4 list-decimal">
                        <li>
                          Open the deployed URL directly and look for the{' '}
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EFE9DF] dark:bg-[#1C1714] font-semibold">
                            <Download className="w-3 h-3" /> Install
                          </span>{' '}
                          icon in the right side of the address bar.
                        </li>
                        <li>
                          Click <strong>Install</strong> to pin GATE &apos;27 to your dock, taskbar, or Start menu.
                        </li>
                      </ol>
                    </div>
                  </div>
                )}

                <div className="rounded-[16px] bg-[#F4EFE6] dark:bg-[#241D19] px-3.5 py-2.5 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                  Includes 3 long-press app shortcuts: <strong>Start Focus Timer</strong>,{' '}
                  <strong>PYQ Studio</strong>, and <strong>Mock Logs</strong>.
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 bg-[#FAF8F4] dark:bg-[#16110E] border-t border-[#EFE9DF] dark:border-[#2E2520]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export const OfflineStatusBanner: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  if (isOnline) return null;
  return (
    <div
      role="status"
      data-testid="offline-status-banner"
      className="no-print border-b border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] px-4 py-1.5 text-center text-xs font-medium text-[#7D570A] dark:text-[#E8BF5A]"
    >
      <span className="inline-flex items-center gap-1.5">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        Offline Mode — Cached GateR PYQs, Focus Timer, Calculator &amp; local study logs stay active.
      </span>
    </div>
  );
};
