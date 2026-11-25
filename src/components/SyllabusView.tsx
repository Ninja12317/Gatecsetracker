import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  Search,
  StickyNote,
  RefreshCw,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
import type { SubjectId, Subtopic, SubtopicProgress, TopicStatus } from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import { computeSubjectMastery, needsSpacedRevision } from '../utils/gateMath';

interface SyllabusViewProps {
  progress: Record<string, SubtopicProgress>;
  focusedSubjectId: SubjectId | null;
  onClearFocusedSubject: () => void;
  onCycleStatus: (subtopicId: string) => void;
  onSetConfidence: (subtopicId: string, confidence: number) => void;
  onMarkRevised: (subtopicId: string) => void;
  onSaveNotes: (subtopicId: string, notes: string) => void;
}

type SyllabusFilter = 'all' | 'high_roi_weak' | 'needs_revision' | 'incomplete';

const STATUS_META: Record<TopicStatus, { label: string; className: string }> = {
  not_started: {
    label: 'Not Started',
    className:
      'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] text-[#61554D] dark:text-[#A99B8E]',
  },
  concept_done: {
    label: 'Concept Done',
    className:
      'border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]',
  },
  pyqs_done: {
    label: 'PYQs Done',
    className:
      'border-[#DFB8AE] dark:border-[#632A20] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#E59283]',
  },
  mastered: {
    label: 'Mastered',
    className:
      'border-[#B9D6C2] dark:border-[#254A33] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]',
  },
};

function formatLastRevised(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return '1d ago';
  return `${diffDays}d ago`;
}

export const SyllabusView: React.FC<SyllabusViewProps> = ({
  progress,
  focusedSubjectId,
  onClearFocusedSubject,
  onCycleStatus,
  onSetConfidence,
  onMarkRevised,
  onSaveNotes,
}) => {
  const [filter, setFilter] = useState<SyllabusFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GATE_2027_SYLLABUS.map((s) => [s.id, true]))
  );
  const [activeNoteSubtopic, setActiveNoteSubtopic] = useState<Subtopic | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [noteSavedToast, setNoteSavedToast] = useState(false);

  // If navigated via Subject Card or Command Palette to a specific subject, expand & scroll to it
  useEffect(() => {
    if (!focusedSubjectId) return;
    setExpandedSubjects((prev) => ({ ...prev, [focusedSubjectId]: true }));
    const el = document.getElementById(`subject-section-${focusedSubjectId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    onClearFocusedSubject();
  }, [focusedSubjectId, onClearFocusedSubject]);

  const toggleSubject = (id: string) => {
    setExpandedSubjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openNotesDrawer = (sub: Subtopic) => {
    setActiveNoteSubtopic(sub);
    setDraftNote(progress[sub.id]?.notes ?? '');
    setNoteSavedToast(false);
  };

  const handleSaveNote = () => {
    if (!activeNoteSubtopic) return;
    onSaveNotes(activeNoteSubtopic.id, draftNote);
    setNoteSavedToast(true);
    window.setTimeout(() => setNoteSavedToast(false), 1800);
  };

  const counts = useMemo(() => {
    const allSubs = GATE_2027_SYLLABUS.flatMap((s) => s.subtopics);
    let revDue = 0;
    let incomplete = 0;
    let highRoiWeak = 0;
    for (const sub of allSubs) {
      const p = progress[sub.id];
      const status = p?.status ?? 'not_started';
      if (needsSpacedRevision(p)) revDue++;
      if (status !== 'mastered') incomplete++;
      if (
        sub.highRoi &&
        (status === 'not_started' || status === 'concept_done' || (p?.confidence ?? 1) <= 3)
      ) {
        highRoiWeak++;
      }
    }
    return { total: allSubs.length, revDue, incomplete, highRoiWeak };
  }, [progress]);

  const trimmedSearch = search.trim().toLowerCase();

  const matchesFilter = (sub: Subtopic): boolean => {
    const p = progress[sub.id];
    const status = p?.status ?? 'not_started';

    if (trimmedSearch) {
      const subj = SUBJECT_MAP[sub.subjectId];
      const hay = `${sub.title} ${subj.name} ${subj.code}`.toLowerCase();
      if (!hay.includes(trimmedSearch)) return false;
    }

    switch (filter) {
      case 'all':
        return true;
      case 'high_roi_weak':
        return Boolean(
          sub.highRoi &&
            (status === 'not_started' || status === 'concept_done' || (p?.confidence ?? 1) <= 3)
        );
      case 'needs_revision':
        return needsSpacedRevision(p);
      case 'incomplete':
        return status !== 'mastered';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls & Filter Bar */}
      <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-[-0.02em] text-[#1C1613] dark:text-[#F5F0E8]">
              Official IIT Madras GATE 2027 CSE Syllabus
            </h1>
            <p className="text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E] mt-1">
              11 sections · 100 marks · Click any stage pill to cycle status. Topics unrevised for 7+ days are flagged automatically.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="h-4 w-4 text-[#8C7E75] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter subtopics or subject..."
              aria-label="Filter syllabus subtopics"
              className="w-full h-10 pl-10 pr-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] text-xs text-[#1C1613] dark:text-[#F5F0E8] placeholder-[#8C7E75]"
            />
          </div>
        </div>

        {/* Segmented Filter Pills */}
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Syllabus filters">
          {[
            { id: 'all' as const, label: `All (${counts.total})` },
            { id: 'high_roi_weak' as const, label: `High-ROI Weak Areas (${counts.highRoiWeak})` },
            { id: 'needs_revision' as const, label: `Needs Revision (${counts.revDue})` },
            { id: 'incomplete' as const, label: `Incomplete (${counts.incomplete})` },
          ].map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold press-tactile whitespace-nowrap ${
                  active
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                    : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] border border-[#E8E0D5] dark:border-[#2E2520] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 11 Subject Accordion Sections with Smooth CSS Grid Expand/Collapse */}
      <div className="space-y-4">
        {GATE_2027_SYLLABUS.map((subject, idx) => {
          const visibleSubtopics = subject.subtopics.filter(matchesFilter);
          if (visibleSubtopics.length === 0) return null;
          const mastery = computeSubjectMastery(subject, progress);
          const isOpen = expandedSubjects[subject.id] ?? true;

          return (
            <section
              key={subject.id}
              id={`subject-section-${subject.id}`}
              className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] shadow-warm overflow-hidden"
            >
              {/* Subject Section Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-[#F4EFE6]/70 dark:bg-[#241D19]">
                <button
                  type="button"
                  onClick={() => toggleSubject(subject.id)}
                  aria-expanded={isOpen}
                  className="flex items-center gap-2.5 text-left min-w-0 rounded-full"
                >
                  <ChevronDown
                    className={`h-4 w-4 text-[#6E261A] dark:text-[#E0A92E] shrink-0 transition-transform duration-300 ease-apple ${
                      isOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                  <span className="font-mono text-xs font-bold text-[#8C7E75] dark:text-[#A99B8E] tabular-nums">
                    {String(idx + 1).padStart(2, '0')}.
                  </span>
                  <span className="font-display text-[15px] font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    {subject.name}
                  </span>
                  <span className="font-mono text-xs text-[#61554D] dark:text-[#A99B8E] tabular-nums">
                    · {subject.weightage} Marks
                  </span>
                </button>

                <div className="flex flex-wrap items-center gap-3">
                  {subject.update2027Note && (
                    <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#332714] text-[11px] font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                      {subject.update2027Note}
                    </span>
                  )}

                  <div className="flex items-center gap-2.5 min-w-[120px]">
                    <div className="h-1.5 flex-1 rounded-full bg-[#E8E0D5] dark:bg-[#352A24] overflow-hidden">
                      <div
                        className="h-full w-full origin-left rounded-full bg-[#C89216] dark:bg-[#E0A92E] transition-transform duration-300 ease-apple"
                        style={{ transform: `scaleX(${Math.max(0.02, mastery / 100)})` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8] w-9 text-right">
                      {mastery}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Smooth GPU Accordion Container */}
              <div className="accordion-grid" data-open={isOpen ? 'true' : 'false'}>
                <div className="accordion-inner">
                  <div className="divide-y divide-[#EFE9DF] dark:divide-[#2E2520] border-t border-[#E8E0D5] dark:border-[#2E2520]">
                    {visibleSubtopics.map((sub) => {
                      const p = progress[sub.id] ?? {
                        status: 'not_started' as TopicStatus,
                        confidence: 2,
                        lastRevisedAt: null,
                        notes: '',
                      };
                      const statusInfo = STATUS_META[p.status];
                      const revDue = needsSpacedRevision(p);

                      return (
                        <div
                          key={sub.id}
                          className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-5 py-3.5 hover:bg-[#FAF8F4] dark:hover:bg-[#221B17] transition-colors"
                        >
                          {/* Topic Title & Metadata */}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-[#1C1613] dark:text-[#F5F0E8] leading-snug">
                              {sub.title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                              {sub.highRoi && (
                                <span className="font-semibold text-[#6E261A] dark:text-[#E0A92E]">
                                  High-ROI
                                </span>
                              )}
                              {sub.highRoi && <span aria-hidden="true">·</span>}
                              <span className="font-mono tabular-nums">
                                Revised: {formatLastRevised(p.lastRevisedAt)}
                              </span>
                              {revDue && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 font-semibold text-[#B58210] dark:text-[#E0A92E]">
                                    <AlertTriangle className="h-3 w-3" />
                                    Revision Due (7d+)
                                  </span>
                                </>
                              )}
                              {p.notes.trim() && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-[#61554D] dark:text-[#D8CBB8] truncate max-w-[260px]">
                                    Note: {p.notes}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Interactive Controls: Stage Cycler, Confidence 1-5, Revise Now, Notes */}
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onCycleStatus(sub.id)}
                              aria-label={`Cycle status for ${sub.title}, currently ${statusInfo.label}`}
                              className={`h-8 px-3 rounded-full border text-xs font-semibold press-tactile whitespace-nowrap min-w-[110px] text-center ${statusInfo.className}`}
                            >
                              {statusInfo.label}
                            </button>

                            {/* 1-5 Confidence Selector */}
                            <div
                              className="flex items-center gap-0.5 border border-[#E8E0D5] dark:border-[#2E2520] rounded-full p-0.5 bg-[#FAF8F4] dark:bg-[#130F0D]"
                              role="group"
                              aria-label={`Confidence rating for ${sub.title}`}
                            >
                              {[1, 2, 3, 4, 5].map((level) => {
                                const active = p.confidence >= level;
                                return (
                                  <button
                                    key={level}
                                    type="button"
                                    onClick={() => onSetConfidence(sub.id, level)}
                                    aria-label={`Set confidence ${level} out of 5 for ${sub.title}`}
                                    className={`h-6 w-6 rounded-full font-mono text-[11px] font-semibold transition-colors ${
                                      active
                                        ? 'bg-[#C89216] dark:bg-[#E0A92E] text-[#1C1613]'
                                        : 'text-[#8C7E75] dark:text-[#7E7065] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                                    }`}
                                  >
                                    {level}
                                  </button>
                                );
                              })}
                            </div>

                            {revDue && (
                              <button
                                type="button"
                                onClick={() => onMarkRevised(sub.id)}
                                title="Mark revised today"
                                aria-label={`Mark ${sub.title} revised today`}
                                className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] text-xs font-semibold hover:bg-[#F7EAC2] press-tactile"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Revise
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openNotesDrawer(sub)}
                              aria-label={`Open personal notes for ${sub.title}`}
                              className={`inline-flex items-center gap-1 h-8 px-3 rounded-full border text-xs font-semibold press-tactile ${
                                p.notes.trim()
                                  ? 'border-[#DFB8AE] dark:border-[#632A20] bg-[#F8EAE6] dark:bg-[#331A16] text-[#6E261A] dark:text-[#E59283]'
                                  : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                              }`}
                            >
                              <StickyNote className="h-3 w-3" />
                              Notes
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Inline Personal Notes Curved Slide-Over Drawer */}
      {activeNoteSubtopic && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#1C1613]/45 p-3 sm:p-4"
          onClick={() => setActiveNoteSubtopic(null)}
        >
          <div
            role="dialog"
            aria-label={`Personal notes for ${activeNoteSubtopic.title}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full rounded-[28px] squircle bg-[#FFFFFF] dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] shadow-warm-lg flex flex-col overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19]">
              <div>
                <div className="text-xs font-medium text-[#6E261A] dark:text-[#E0A92E]">
                  {SUBJECT_MAP[activeNoteSubtopic.subjectId].name}
                </div>
                <h3 className="mt-0.5 font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  {activeNoteSubtopic.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveNoteSubtopic(null)}
                aria-label="Close notes drawer"
                className="p-1.5 rounded-full text-[#61554D] hover:text-[#1C1613] hover:bg-[#EFE9DF] dark:text-[#A99B8E] dark:hover:text-[#F5F0E8] dark:hover:bg-[#312722]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 p-5 flex flex-col gap-3">
              <label
                htmlFor="subtopic-notes-textarea"
                className="text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
              >
                Personal Short Notes, Formulas &amp; PYQ Edge Cases
              </label>
              <textarea
                id="subtopic-notes-textarea"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={12}
                placeholder="Write key theorems, recurring PYQ traps, textbook page refs (Cormen / Galvin / Silberschatz / Tanenbaum)..."
                className="flex-1 w-full rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] p-4 text-sm font-mono text-[#1C1613] dark:text-[#F5F0E8] placeholder-[#8C7E75] resize-none"
              />
            </div>

            <div className="px-5 py-4 border-t border-[#E8E0D5] dark:border-[#2E2520] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
                {noteSavedToast ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                ) : (
                  ''
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveNoteSubtopic(null)}
                  className="px-4 py-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="px-5 py-2 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold press-tactile"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
