import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: '⌘ / Ctrl + K', action: 'Open Quick Command Palette' },
  { keys: 'Z', action: 'Toggle Zen Fullscreen Mode (in Focus Studio)' },
  { keys: 'C', action: 'Toggle GATE Scientific Calculator' },
  { keys: 'S', action: 'Toggle Split-Pane Rough-Work Sketchpad (in PYQ session)' },
  { keys: 'N / P', action: 'Next / Previous Question (in PYQ session)' },
  { keys: 'B', action: 'Bookmark Question for Mistake Bucket (in PYQ session)' },
  { keys: 'Esc', action: 'Close active dialog, drawer, or Zen Fullscreen' },
];

export const InfoModal: React.FC<InfoModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1613]/45 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="About GATE '27 War Room and Keyboard Shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] shadow-warm-lg overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19]">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
            <h2 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              GATE &apos;27 // WAR ROOM · Shortcuts &amp; Info
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close info modal"
            className="p-1.5 rounded-full text-[#61554D] hover:text-[#1C1613] dark:text-[#A99B8E] dark:hover:text-[#F5F0E8]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="text-sm text-[#61554D] dark:text-[#D8CBB8] leading-relaxed">
              A 70-day GATE CSE 2027 execution command center combining the official IIT Madras
              syllabus tracker, GO Classes &amp; GATE Overflow style CBT practice studio, 60fps
              HTML5 rough-work sketchpad, virtual scientific calculator, and ROI mock analytics.
            </p>
            <p className="mt-3 text-xs font-semibold text-[#6E261A] dark:text-[#E0A92E]">
              Built by Nihal Pawar · Real-Time Cloud Firestore + Local-First Persistence
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-[#61554D] dark:text-[#A99B8E] mb-2.5">
              Keyboard Shortcuts
            </h3>
            <div className="divide-y divide-[#EFE9DF] dark:divide-[#2E2520] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[20px] overflow-hidden">
              {SHORTCUTS.map((sc) => (
                <div
                  key={sc.keys}
                  className="flex items-center justify-between px-4 py-2.5 text-xs"
                >
                  <span className="text-[#1C1613] dark:text-[#D8CBB8]">{sc.action}</span>
                  <kbd className="font-mono font-semibold text-[11px] px-2.5 py-0.5 rounded-full border border-[#E8E0D5] dark:border-[#3A2E28] bg-[#FAF8F4] dark:bg-[#241D19] text-[#6E261A] dark:text-[#E0A92E] whitespace-nowrap ml-4">
                    {sc.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
