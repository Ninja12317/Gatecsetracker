import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Zap,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Clock,
  ArrowRight,
  Layers,
  ExternalLink,
} from 'lucide-react';
import type {
  Question,
  SrsItemType,
  SrsRating,
  TipItem,
  WarRoomState,
} from '../types';
import { SUBJECT_MAP } from '../data/syllabus';
import { RichQuestionContent } from './RichQuestionContent';
import { CodeBlock } from './CodeBlock';
import { toLocalIsoDate } from '../utils/gateMath';
import { isSrsCardDueToday, makeSrsCardId } from '../utils/examPolish';

interface RapidRevisionViewProps {
  state: WarRoomState;
  allQuestions: Question[];
  allTips: TipItem[];
  onRecordSrsRating: (itemType: SrsItemType, itemId: string, rating: SrsRating) => void;
  onGoToPyq: () => void;
}

type DeckFilter = 'due' | 'mistakes' | 'traps';

interface FlashCardItem {
  cardId: string;
  itemType: SrsItemType;
  itemId: string;
  subjectCode: string;
  subjectName: string;
  badge: string;
  title: string;
  frontHtml?: string;
  frontText: string;
  codeSnippet?: string;
  answerHeadline: string;
  backDetail: string;
  extraNote?: string;
  sketchDataUrl?: string;
  sourceUrl?: string;
  dueToday: boolean;
  intervalDays?: number;
  reviewCount: number;
}

export const RapidRevisionView: React.FC<RapidRevisionViewProps> = ({
  state,
  allQuestions,
  allTips,
  onRecordSrsRating,
  onGoToPyq,
}) => {
  const [deckFilter, setDeckFilter] = useState<DeckFilter>('due');
  const [flipped, setFlipped] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [sessionReviewed, setSessionReviewed] = useState(0);

  const todayIso = toLocalIsoDate();

  const allCards = useMemo<FlashCardItem[]>(() => {
    const qMap = new Map(allQuestions.map((q) => [q.id, q]));
    const cards: FlashCardItem[] = [];

    // 1. Unresolved Mistake Bucket cards
    for (const m of Object.values(state.mistakes)) {
      if (m.resolved) continue;
      const q = qMap.get(m.questionId);
      if (!q) continue;
      const cardId = makeSrsCardId('mistake', q.id);
      const srs = state.srsCards[cardId];
      const subj = SUBJECT_MAP[q.subjectId];
      const answerStr =
        q.format === 'MCQ'
          ? `Option ${q.correctOption || 'Verify on GateOverflow'}`
          : q.format === 'MSQ'
          ? `Options ${q.correctOptions?.join(', ') || 'Verify on GateOverflow'}`
          : typeof q.natAnswer === 'number'
          ? `${q.natAnswer}${q.natUnit ? ` ${q.natUnit}` : ''}`
          : 'Verify on GateOverflow';

      cards.push({
        cardId,
        itemType: 'mistake',
        itemId: q.id,
        subjectCode: subj?.shortName ?? q.subjectId.toUpperCase(),
        subjectName: subj?.name ?? q.subjectId,
        badge: `Mistake · ${m.errorTag}`,
        title: q.title || `${q.subtopic} (${q.sourceTag})`,
        frontHtml: q.bodyHtml,
        frontText: q.prompt,
        codeSnippet: q.codeSnippet,
        answerHeadline: `${q.format} (${q.marks}M) · Answer: ${answerStr}`,
        backDetail: q.explanation || q.wrongOptionAnalysis || 'Review official proof via GateOverflow.',
        extraNote: m.userNote || undefined,
        sketchDataUrl: state.savedSketches[q.id],
        sourceUrl: q.sourceUrl,
        dueToday: isSrsCardDueToday(srs, todayIso),
        intervalDays: srs?.intervalDays,
        reviewCount: srs?.reviewCount ?? 0,
      });
    }

    // 2. Saved/Dynamic Traps & Bookmarked Tips
    const prioritizedTips = [
      ...state.trapsVault,
      ...state.customTips,
      ...allTips.filter((t) => state.bookmarkedTips.includes(t.id)),
      ...allTips.slice(0, 12),
    ];
    const seenTipIds = new Set<string>();
    for (const tip of prioritizedTips) {
      if (seenTipIds.has(tip.id)) continue;
      seenTipIds.add(tip.id);
      const cardId = makeSrsCardId('trap', tip.id);
      const srs = state.srsCards[cardId];
      const subj = SUBJECT_MAP[tip.subjectId];
      cards.push({
        cardId,
        itemType: 'trap',
        itemId: tip.id,
        subjectCode: subj?.shortName ?? tip.subjectId.toUpperCase(),
        subjectName: subj?.name ?? tip.subjectId,
        badge: tip.category,
        title: tip.title,
        frontText: tip.summary || tip.title,
        answerHeadline: tip.formula ? `Formula / Invariant: ${tip.formula}` : 'Exam Proof & Counter-Example',
        backDetail: tip.detail,
        sourceUrl: tip.sourceUrl,
        dueToday: isSrsCardDueToday(srs, todayIso),
        intervalDays: srs?.intervalDays,
        reviewCount: srs?.reviewCount ?? 0,
      });
    }

    return cards;
  }, [allQuestions, allTips, state.mistakes, state.srsCards, state.savedSketches, state.trapsVault, state.customTips, state.bookmarkedTips, todayIso]);

  const deck = useMemo(() => {
    if (deckFilter === 'mistakes') return allCards.filter((c) => c.itemType === 'mistake');
    if (deckFilter === 'traps') return allCards.filter((c) => c.itemType === 'trap');
    return allCards.filter((c) => c.dueToday);
  }, [allCards, deckFilter]);

  const dueCount = useMemo(() => allCards.filter((c) => c.dueToday).length, [allCards]);
  const mistakeCount = useMemo(() => allCards.filter((c) => c.itemType === 'mistake').length, [allCards]);
  const trapCount = useMemo(() => allCards.filter((c) => c.itemType === 'trap').length, [allCards]);

  const safeIdx = deck.length > 0 ? cursor % deck.length : 0;
  const activeCard = deck[safeIdx] ?? null;

  const handleRate = useCallback(
    (rating: SrsRating) => {
      if (!activeCard) return;
      onRecordSrsRating(activeCard.itemType, activeCard.itemId, rating);
      setSessionReviewed((n) => n + 1);
      setFlipped(false);
      if (deckFilter !== 'due') {
        setCursor((c) => c + 1);
      }
    },
    [activeCard, onRecordSrsRating, deckFilter]
  );

  // Keyboard shortcuts: Space to flip, 1=Hard, 2=Good, 3=Mastered
  useEffect(() => {
    if (!(state.settings.enableKeyboardShortcuts ?? true)) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((v) => !v);
      } else if (flipped && e.key === '1') {
        handleRate('hard');
      } else if (flipped && e.key === '2') {
        handleRate('good');
      } else if (flipped && e.key === '3') {
        handleRate('mastered');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, handleRate, state.settings.enableKeyboardShortcuts]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-[28px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] p-5 sm:p-6 shadow-warm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[11px] font-semibold text-[#8E620C] dark:text-[#E0A92E] mb-2">
            <Zap className="w-3.5 h-3.5" />
            Spaced-Repetition Deck · 1d / 3d / 7d / 14d
          </div>
          <h1 className="fluid-heading font-display font-bold text-[#1C1613] dark:text-[#F5F0E8]">
            Rapid-Fire Flash Revision
          </h1>
          <p className="text-sm text-[#61554D] dark:text-[#A99B8E] mt-1">
            Flip through Mistake Bucket traps and high-yield exam pitfalls. Rate recall to schedule your next review automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] px-3.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
              Reviewed Now
            </p>
            <p className="text-base font-display font-bold tabular-nums text-[#6E261A] dark:text-[#E0A92E]">
              {sessionReviewed}
            </p>
          </div>
          <div className="rounded-[18px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-3.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#8E620C] dark:text-[#D9B664]">
              Due Today
            </p>
            <p className="text-base font-display font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
              {dueCount}
            </p>
          </div>
        </div>
      </section>

      {/* Deck Selector Pills — Single-Row Horizontally Scrollable Rail */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar py-1 px-1 -mx-1 sm:mx-0 sm:px-0">
          <div className="inline-flex flex-nowrap items-center gap-1 p-1 rounded-full bg-[#EFE9DF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520]">
            {[
              { id: 'due' as const, label: `Due Today (${dueCount})`, icon: Clock },
              { id: 'mistakes' as const, label: `Mistake Bucket (${mistakeCount})`, icon: AlertTriangle },
              { id: 'traps' as const, label: `Saved Traps (${trapCount})`, icon: Sparkles },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = deckFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={(e) => {
                    setDeckFilter(tab.id);
                    setCursor(0);
                    setFlipped(false);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all press-tactile ${
                    active
                      ? 'bg-white dark:bg-[#1C1714] text-[#6E261A] dark:text-[#E0A92E] shadow-sm font-semibold'
                      : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeCard && (
          <span className="text-xs font-mono text-[#61554D] dark:text-[#A99B8E] tabular-nums shrink-0">
            Card {safeIdx + 1} / {deck.length} · <span className="hidden sm:inline">Space to flip · 1/2/3 to rate</span><span className="sm:hidden">Tap to flip</span>
          </span>
        )}
      </div>

      {/* Main Flashcard Stage */}
      {!activeCard ? (
        <div className="rounded-[28px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] p-10 text-center shadow-warm space-y-4">
          <div className="h-14 w-14 mx-auto rounded-full bg-[#ECF4EE] dark:bg-[#1D2D22] text-[#2E5E3E] dark:text-[#63A87A] flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              {deckFilter === 'due'
                ? 'All Due Flashcards Cleared for Today!'
                : 'No Items in This Deck Yet'}
            </h2>
            <p className="text-sm text-[#61554D] dark:text-[#A99B8E] max-w-md mx-auto">
              {deckFilter === 'mistakes'
                ? 'Your Mistake Bucket is clean. Solve PYQs in PYQ Studio to capture tricky questions for spaced revision.'
                : 'Switch to Saved Traps for extra review or jump back to PYQ Studio for a timed sprint.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            {deckFilter !== 'traps' && trapCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDeckFilter('traps');
                  setCursor(0);
                  setFlipped(false);
                }}
                className="px-4 py-2 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] press-tactile"
              >
                Browse All Traps ({trapCount})
              </button>
            )}
            <button
              type="button"
              onClick={onGoToPyq}
              className="px-5 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold inline-flex items-center gap-2 press-tactile"
            >
              Open PYQ Studio
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="rounded-[28px] bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] shadow-warm overflow-hidden">
            {/* Card Metadata Strip */}
            <div className="px-5 sm:px-6 py-3.5 bg-[#FAF8F4] dark:bg-[#241D19] border-b border-[#EFE9DF] dark:border-[#2E2520] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-white text-[11px] font-bold">
                  {activeCard.subjectCode}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[11px] font-semibold text-[#8E620C] dark:text-[#E0A92E]">
                  {activeCard.badge}
                </span>
                {activeCard.intervalDays && (
                  <span className="px-2.5 py-1 rounded-full bg-[#EFE9DF] dark:bg-[#2E2520] text-[11px] font-mono text-[#61554D] dark:text-[#A99B8E]">
                    Interval: {activeCard.intervalDays}d · Reviews: {activeCard.reviewCount}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setFlipped((v) => !v)}
                className="px-3 py-1.5 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] text-xs font-semibold text-[#6E261A] dark:text-[#E0A92E] inline-flex items-center gap-1.5 press-tactile"
              >
                <RotateCw className="w-3.5 h-3.5" />
                {flipped ? 'Show Front' : 'Flip Card'}
              </button>
            </div>

            {/* Card Content */}
            <div className="p-6 sm:p-8 min-h-[260px] flex flex-col justify-between gap-5">
              <div className="pyq-reading-measure space-y-4">
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  {activeCard.title}
                </h2>

                {!flipped ? (
                  <div className="space-y-3">
                    <RichQuestionContent
                      html={activeCard.frontHtml}
                      plainText={activeCard.frontText}
                      className="text-sm sm:text-[15px]"
                    />
                    {activeCard.codeSnippet && (
                      <CodeBlock code={activeCard.codeSnippet} label="Code Snippet" />
                    )}
                    <p className="text-xs text-[#61554D] dark:text-[#A99B8E] pt-3 italic">
                      Recall the exact theorem, edge case, or final answer — then flip to verify.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-[20px] bg-[#ECF4EE] dark:bg-[#1C2A21] border border-[#C6DEC9] dark:border-[#2F4D39] px-4 py-3 text-sm font-semibold text-[#2E5E3E] dark:text-[#7AC493]">
                      {activeCard.answerHeadline}
                    </div>
                    <p className="text-sm leading-relaxed text-[#1C1613] dark:text-[#F5F0E8] whitespace-pre-wrap">
                      {activeCard.backDetail}
                    </p>
                    {activeCard.extraNote && (
                      <div className="rounded-[18px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-4 py-3 text-xs text-[#7A5610] dark:text-[#F0D594]">
                        <strong>Your Mistake Note:</strong> {activeCard.extraNote}
                      </div>
                    )}
                    {activeCard.sketchDataUrl && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                          Saved Rough-Work Sketch
                        </p>
                        <img
                          src={activeCard.sketchDataUrl}
                          alt="Saved Rough-Work Sketch"
                          className="max-h-56 rounded-[16px] border border-[#E8E0D5] dark:border-[#352A24] bg-white"
                        />
                      </div>
                    )}
                    {activeCard.sourceUrl && (
                      <a
                        href={activeCard.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6E261A] dark:text-[#E0A92E] hover:underline"
                      >
                        Open Official GateOverflow Proof
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Action Bar */}
              <div className="pt-4 border-t border-[#EFE9DF] dark:border-[#2E2520]">
                {!flipped ? (
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCursor((c) => c + 1);
                        setFlipped(false);
                      }}
                      className="px-4 py-2.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-xs font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] press-tactile"
                    >
                      Skip for Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipped(true)}
                      className="px-6 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm press-tactile"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Reveal Proof &amp; Answer
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleRate('hard')}
                      className="rounded-[18px] py-3 px-3 bg-[#FDECEB] hover:bg-[#F9D8D6] dark:bg-[#3A1E1B] dark:hover:bg-[#492522] border border-[#F2C6C2] dark:border-[#63322D] text-[#B83227] dark:text-[#F09A91] text-center press-tactile"
                    >
                      <p className="text-xs font-bold">Hard (1)</p>
                      <p className="text-[10px] opacity-85">Repeat in 1d</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate('good')}
                      className="rounded-[18px] py-3 px-3 bg-[#FDF6E3] hover:bg-[#F8EBC7] dark:bg-[#2C2215] dark:hover:bg-[#3B2E1B] border border-[#EED89A] dark:border-[#5C441B] text-[#8E620C] dark:text-[#E0A92E] text-center press-tactile"
                    >
                      <p className="text-xs font-bold">Good (2)</p>
                      <p className="text-[10px] opacity-85">
                        Next: {!activeCard.intervalDays || activeCard.intervalDays <= 1 ? '3d' : activeCard.intervalDays <= 3 ? '7d' : '14d'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate('mastered')}
                      className="rounded-[18px] py-3 px-3 bg-[#ECF4EE] hover:bg-[#DCECE0] dark:bg-[#1C2A21] dark:hover:bg-[#24382B] border border-[#C6DEC9] dark:border-[#2F4D39] text-[#2E5E3E] dark:text-[#7AC493] text-center press-tactile"
                    >
                      <p className="text-xs font-bold">Mastered (3)</p>
                      <p className="text-[10px] opacity-85">Push to 14d</p>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
