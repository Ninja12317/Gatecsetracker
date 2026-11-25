import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  LayoutDashboard,
  ListChecks,
  TerminalSquare,
  Lightbulb,
  LineChart,
  Settings,
  Calculator,
  Sun,
  Moon,
  BookOpen,
  Zap,
  Info,
  Timer,
  FlaskConical,
  Flame,
} from 'lucide-react';
import type { NavView, SubjectId } from '../types';
import { GATE_2027_SYLLABUS } from '../data/syllabus';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onNavigate: (view: NavView) => void;
  onJumpToSubject: (subjectId: SubjectId) => void;
  onLaunchDailyDpp: () => void;
  onLaunchGaSprint?: () => void;
  onToggleTheme: () => void;
  onToggleCalculator: () => void;
  onOpenInfo: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  category: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  theme,
  onNavigate,
  onJumpToSubject,
  onLaunchDailyDpp,
  onLaunchGaSprint,
  onToggleTheme,
  onToggleCalculator,
  onOpenInfo,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  if (!open) return null;

  const commands: CommandItem[] = [
    {
      id: 'cmd-dpp',
      label: 'Launch Daily Mixed DPP (10 Weak-Area Questions)',
      category: 'Quick Action',
      keywords: 'dpp pyq practice sprint daily test',
      icon: Zap,
      action: () => {
        onLaunchDailyDpp();
        onClose();
      },
    },
    ...(onLaunchGaSprint
      ? [
          {
            id: 'cmd-ga-sprint',
            label: 'Start Daily 10-Min GA Lock-In Sprint (5 Qs)',
            category: 'Quick Action',
            keywords: 'ga general aptitude streak sprint 10 min 15 marks',
            icon: Flame,
            action: () => {
              onLaunchGaSprint();
              onClose();
            },
          },
        ]
      : []),
    {
      id: 'cmd-calc',
      label: 'Toggle GATE Scientific Calculator',
      category: 'Tool',
      keywords: 'calculator math scientific virtual',
      icon: Calculator,
      action: () => {
        onToggleCalculator();
        onClose();
      },
    },
    {
      id: 'cmd-theme',
      label: theme === 'dark' ? 'Switch to Warm Ivory Light Mode' : 'Switch to Espresso Dark Mode',
      category: 'Appearance',
      keywords: 'dark light theme color mode',
      icon: theme === 'dark' ? Sun : Moon,
      action: () => {
        onToggleTheme();
        onClose();
      },
    },
    {
      id: 'nav-dashboard',
      label: 'Sprint Overview & Syllabus Radar',
      category: 'Navigation',
      keywords: 'home dashboard overview countdown syllabus',
      icon: LayoutDashboard,
      action: () => {
        onNavigate('dashboard');
        onClose();
      },
    },
    {
      id: 'nav-focus',
      label: 'Focus Studio, Deep-Work Timer & 70-Day Heatmap',
      category: 'Navigation',
      keywords: 'focus timer pomodoro stopwatch soundscape brown noise rain heatmap zen streak',
      icon: Timer,
      action: () => {
        onNavigate('focus');
        onClose();
      },
    },
    {
      id: 'nav-syllabus',
      label: 'GATE 2027 CSE Syllabus & Mastery Tracker',
      category: 'Navigation',
      keywords: 'syllabus subjects topics checklist revision',
      icon: ListChecks,
      action: () => {
        onNavigate('syllabus');
        onClose();
      },
    },
    {
      id: 'nav-pyq',
      label: 'PYQ Studio, Sketchpad & Mistake Bucket',
      category: 'Navigation',
      keywords: 'pyq questions sketchpad canvas mistakes go classes gate overflow',
      icon: TerminalSquare,
      action: () => {
        onNavigate('pyq');
        onClose();
      },
    },
    {
      id: 'nav-cslab',
      label: 'CS Lab — TOC Matrix, COA Cache, IEEE-754, CN CIDR & Code Trace',
      category: 'Navigation',
      keywords: 'cs lab toc closure decidability coa cache virtual memory ieee754 twos complement cidr ipv4 fragmentation flowchart code trace',
      icon: FlaskConical,
      action: () => {
        onNavigate('cslab');
        onClose();
      },
    },
    {
      id: 'nav-revision',
      label: 'Rapid-Fire Flash Revision (SRS Deck)',
      category: 'Navigation',
      keywords: 'revision flashcards srs spaced repetition mistakes traps',
      icon: Zap,
      action: () => {
        onNavigate('revision');
        onClose();
      },
    },
    {
      id: 'nav-tips',
      label: 'Exam Traps, Shortcuts & Formula Vault',
      category: 'Navigation',
      keywords: 'tips tricks traps formulas shortcuts',
      icon: Lightbulb,
      action: () => {
        onNavigate('tips');
        onClose();
      },
    },
    {
      id: 'nav-mocks',
      label: 'Mock Test Log & High-ROI Analytics',
      category: 'Navigation',
      keywords: 'mocks score analytics charts roi',
      icon: LineChart,
      action: () => {
        onNavigate('mocks');
        onClose();
      },
    },
    {
      id: 'nav-settings',
      label: 'Settings, Cloud Sync & JSON Backup',
      category: 'Navigation',
      keywords: 'settings export import json backup admit card sync',
      icon: Settings,
      action: () => {
        onNavigate('settings');
        onClose();
      },
    },
    {
      id: 'cmd-info',
      label: 'Keyboard Shortcuts & About (Built by Nihal Pawar)',
      category: 'Help',
      keywords: 'shortcuts help info nihal pawar about',
      icon: Info,
      action: () => {
        onOpenInfo();
        onClose();
      },
    },
    ...GATE_2027_SYLLABUS.map((subj) => ({
      id: `subj-${subj.id}`,
      label: `${subj.code} — ${subj.name} (${subj.weightage} Marks)`,
      category: 'Jump to Subject',
      keywords: `${subj.code} ${subj.name} ${subj.shortName} syllabus`,
      icon: BookOpen,
      action: () => {
        onJumpToSubject(subj.id);
        onClose();
      },
    })),
  ];

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(trimmed) ||
          c.category.toLowerCase().includes(trimmed) ||
          c.keywords.toLowerCase().includes(trimmed)
      )
    : commands;

  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && filtered[safeIndex]) {
      e.preventDefault();
      filtered[safeIndex].action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#1C1613]/45 pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command Palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] overflow-hidden shadow-warm-lg"
      >
        <div className="flex items-center gap-3 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] px-5 py-3.5">
          <Search className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to a subject, launch Daily DPP, open calculator..."
            aria-label="Search commands and subjects"
            className="w-full bg-transparent text-sm text-[#1C1613] dark:text-[#F5F0E8] placeholder-[#8C7E75] focus:outline-none"
          />
          <kbd className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-[#E8E0D5] dark:border-[#3A2E28] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#A99B8E]">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#61554D] dark:text-[#A99B8E]">
              No matching commands or subjects found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === safeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.action}
                  className={`flex w-full items-center justify-between px-3.5 py-2.5 rounded-[16px] text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-[#FDF6E3] text-[#6E261A] dark:bg-[#332714] dark:text-[#E0A92E]'
                      : 'text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="h-4 w-4 shrink-0 opacity-85" />
                    <span className="truncate font-medium">{item.label}</span>
                  </span>
                  <span className="text-[11px] text-[#61554D] dark:text-[#A99B8E] shrink-0 ml-3">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
