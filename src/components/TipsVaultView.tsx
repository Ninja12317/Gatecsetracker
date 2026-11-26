import React, { useState, useMemo, useEffect } from 'react';
import {
  Bookmark,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  Loader2,
  AlertTriangle,
  Archive,
} from 'lucide-react';
import type { SubjectId, TipItem } from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';

interface TipsVaultViewProps {
  allTips: TipItem[];
  bookmarkedTips: string[];
  unresolvedMistakesCount: number;
  lastTrapsIstDate: string;
  trapsGenerating: boolean;
  trapsCooldownUntil: number;
  trapsNotice: string;
  onEnsureDailyTraps: () => void;
  onGenerateFreshTraps: (options?: {
    subjectId?: SubjectId | 'all';
    mode?: 'daily' | 'subject' | 'mistakes';
    count?: number;
  }) => Promise<{ ok: boolean; addedCount: number; fallbackUsed?: boolean; message: string }>;
  onToggleBookmark: (tipId: string) => void;
  onAddCustomTip: (tip: Omit<TipItem, 'id' | 'isCustom'>) => void;
  onDeleteCustomTip: (tipId: string) => void;
}

type CategoryFilter = 'All' | 'Exam Trap' | 'Formula' | 'Shortcut' | 'Edge Case' | 'Bookmarked';

export const TipsVaultView: React.FC<TipsVaultViewProps> = ({
  allTips,
  bookmarkedTips,
  unresolvedMistakesCount,
  lastTrapsIstDate,
  trapsGenerating,
  trapsCooldownUntil,
  trapsNotice,
  onEnsureDailyTraps,
  onGenerateFreshTraps,
  onToggleBookmark,
  onAddCustomTip,
  onDeleteCustomTip,
}) => {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const [spotlightOffset, setSpotlightOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | 'all'>('all');
  const [genSubject, setGenSubject] = useState<SubjectId | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [showAddForm, setShowAddForm] = useState(false);
  const [cooldownSecs, setCooldownSecs] = useState(0);

  // Add Custom Trick Form state
  const [formSubject, setFormSubject] = useState<SubjectId>('algo');
  const [formCategory, setFormCategory] = useState<TipItem['category']>('Shortcut');
  const [formTitle, setFormTitle] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formDetail, setFormDetail] = useState('');
  const [formFormula, setFormFormula] = useState('');
  const [formError, setFormError] = useState('');

  // Auto-daily IST refresh (runs at most once per calendar day if today's pack isn't cached)
  useEffect(() => {
    onEnsureDailyTraps();
  }, [onEnsureDailyTraps]);

  // Live 10-second cooldown countdown ticker
  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, Math.ceil((trapsCooldownUntil - Date.now()) / 1000));
      setCooldownSecs(rem);
    };
    tick();
    if (trapsCooldownUntil <= Date.now()) return;
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [trapsCooldownUntil]);

  const spotlightTip =
    allTips[((dayOfYear + spotlightOffset) % allTips.length + allTips.length) % allTips.length];

  const dynamicCount = useMemo(
    () => allTips.filter((t) => Boolean(t.trapSource)).length,
    [allTips]
  );

  const filteredTips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTips.filter((t) => {
      if (subjectFilter !== 'all' && t.subjectId !== subjectFilter) return false;
      if (categoryFilter === 'Bookmarked' && !bookmarkedTips.includes(t.id)) return false;
      if (
        categoryFilter !== 'All' &&
        categoryFilter !== 'Bookmarked' &&
        t.category !== categoryFilter
      ) {
        return false;
      }
      if (q) {
        const hay = `${t.title} ${t.summary} ${t.detail} ${t.formula ?? ''} ${SUBJECT_MAP[t.subjectId].name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allTips, subjectFilter, categoryFilter, search, bookmarkedTips]);

  const handleCreateTip = (e: React.FormEvent) => {
    e.preventDefault();
    if (formTitle.trim().length < 3 || formDetail.trim().length < 8) {
      setFormError('Please provide both a clear title (3+ chars) and conceptual detail (8+ chars).');
      return;
    }
    onAddCustomTip({
      subjectId: formSubject,
      category: formCategory,
      title: formTitle.trim(),
      summary: formSummary.trim() || formDetail.trim().slice(0, 120),
      detail: formDetail.trim(),
      formula: formFormula.trim() || undefined,
    });
    setFormTitle('');
    setFormSummary('');
    setFormDetail('');
    setFormFormula('');
    setFormError('');
    setShowAddForm(false);
  };

  const sourceBadgeLabel = (tip: TipItem): string | null => {
    if (tip.trapSource === 'ai_daily') return 'AI Daily';
    if (tip.trapSource === 'ai_subject') return 'AI Subject';
    if (tip.trapSource === 'mistake_mined') return 'Mistake-Mined';
    if (tip.trapSource === 'local_mined') return 'GateR Mined';
    if (tip.isCustom) return 'Custom';
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Dynamic AI + PYQ-Mined Daily Traps Generator Bar */}
      <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[11px] font-semibold text-[#8E620C] dark:text-[#E0A92E]">
                <Sparkles className="w-3.5 h-3.5" />
                Dynamic Daily Traps Engine · 100% Free Tier
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-[11px] font-mono text-[#61554D] dark:text-[#A99B8E]">
                <Archive className="w-3 h-3" />
                {allTips.length} Archived ({dynamicCount} Dynamic)
              </span>
              {lastTrapsIstDate && (
                <span className="text-[11px] font-mono text-[#2E5E3E] dark:text-[#7BB88F]">
                  ● IST Pack: {lastTrapsIstDate}
                </span>
              )}
            </div>
            <h1 className="fluid-heading font-display font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              Daily Traps &amp; Tips Library
            </h1>
            <p className="text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E]">
              Auto-refreshes once daily (IST) into your permanent Firestore archive. Generate fresh exam traps or mine personal traps directly from your Mistake Bucket.
            </p>
          </div>

          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-1 -mx-1 sm:mx-0 sm:px-0 shrink-0">
            <select
              value={genSubject}
              onChange={(e) => setGenSubject(e.target.value as SubjectId | 'all')}
              aria-label="Choose subject for fresh traps generation"
              className="shrink-0 h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-3.5 text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8]"
            >
              <option value="all">Weakest Subjects (Auto)</option>
              {GATE_2027_SYLLABUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.shortName}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={trapsGenerating || cooldownSecs > 0}
              onClick={() =>
                void onGenerateFreshTraps({
                  subjectId: genSubject,
                  mode: genSubject === 'all' ? 'daily' : 'subject',
                  count: 5,
                })
              }
              data-testid="generate-fresh-traps-btn"
              className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold disabled:opacity-60 press-tactile whitespace-nowrap"
            >
              {trapsGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {trapsGenerating
                ? 'Generating...'
                : cooldownSecs > 0
                ? `Wait ${cooldownSecs}s`
                : 'Generate 5 Fresh Traps'}
            </button>

            <button
              type="button"
              disabled={trapsGenerating || cooldownSecs > 0}
              onClick={() =>
                void onGenerateFreshTraps({
                  subjectId: 'all',
                  mode: 'mistakes',
                  count: 5,
                })
              }
              data-testid="mine-mistakes-traps-btn"
              className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#FDF6E3] hover:bg-[#F7EAC2] dark:bg-[#2C2215] dark:hover:bg-[#3A2D1B] border border-[#EED89A] dark:border-[#5C441B] text-[#6E261A] dark:text-[#E0A92E] text-xs font-semibold disabled:opacity-60 press-tactile whitespace-nowrap"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Mine From My Mistakes ({unresolvedMistakesCount})
            </button>
          </div>
        </div>

        {trapsNotice && (
          <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] px-4 py-2.5 text-xs font-medium text-[#6E261A] dark:text-[#E0A92E]">
            {trapsNotice}
          </div>
        )}
      </section>

      {/* Daily Rotating Trap of the Day Spotlight */}
      {spotlightTip && (
        <section className="rounded-[28px] squircle border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#241D19] p-6 shadow-warm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-[#EED89A]/80 dark:border-[#3A2E28]">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] font-semibold">
                Daily Spotlight
              </span>
              <span className="font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                {SUBJECT_MAP[spotlightTip.subjectId].name}
              </span>
              <span aria-hidden="true" className="text-[#A99B8E]">·</span>
              <span className="text-[#8B6209] dark:text-[#E0A92E] font-semibold">
                {spotlightTip.category}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSpotlightOffset((o) => o - 1)}
                aria-label="Previous spotlight tip"
                className="h-8 w-8 flex items-center justify-center rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#D8CBB8] press-tactile"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSpotlightOffset((o) => o + 1)}
                aria-label="Next spotlight tip"
                className="h-8 w-8 flex items-center justify-center rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#D8CBB8] press-tactile"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              {spotlightTip.title}
            </h2>
            <p className="text-sm text-[#61554D] dark:text-[#D8CBB8] leading-relaxed">
              {spotlightTip.detail}
            </p>
            {spotlightTip.formula && (
              <div className="rounded-[20px] squircle border border-[#EED89A] dark:border-[#4A3820] bg-[#FFFFFF] dark:bg-[#16100D] px-4 py-3 font-mono text-xs text-[#6E261A] dark:text-[#E5B23A]">
                {spotlightTip.formula}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Search, Filter & Add Custom Trick Toolbar */}
      <section className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="h-4 w-4 text-[#8C7E75] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search formulas, traps, theorems..."
                aria-label="Search formula vault"
                className="w-full h-10 pl-10 pr-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] text-xs text-[#1C1613] dark:text-[#F5F0E8] placeholder-[#8C7E75]"
              />
            </div>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value as SubjectId | 'all')}
              aria-label="Filter tips by subject"
              className="h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8]"
            >
              <option value="all">All 11 Subjects</option>
              {GATE_2027_SYLLABUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm((s) => !s)}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile whitespace-nowrap shrink-0"
          >
            {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showAddForm ? 'Close Form' : 'Add Custom Trick'}
          </button>
        </div>

        <div
          className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1"
          role="tablist"
          aria-label="Tip categories"
        >
          {(['All', 'Exam Trap', 'Formula', 'Shortcut', 'Edge Case', 'Bookmarked'] as const).map(
            (cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={(e) => {
                    setCategoryFilter(cat);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold press-tactile whitespace-nowrap ${
                    active
                      ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] border border-[#E8E0D5] dark:border-[#2E2520] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                  }`}
                >
                  {cat}
                  {cat === 'Bookmarked' ? ` (${bookmarkedTips.length})` : ''}
                </button>
              );
            }
          )}
        </div>

        {/* Add Custom Trick Form */}
        <div className="accordion-grid" data-open={showAddForm ? 'true' : 'false'}>
          <div className="accordion-inner">
            <form
              onSubmit={handleCreateTip}
              className="pt-4 mt-2 border-t border-[#E8E0D5] dark:border-[#2E2520] space-y-3.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="custom-tip-subject"
                    className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5"
                  >
                    Subject
                  </label>
                  <select
                    id="custom-tip-subject"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value as SubjectId)}
                    className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    {GATE_2027_SYLLABUS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="custom-tip-category"
                    className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5"
                  >
                    Category
                  </label>
                  <select
                    id="custom-tip-category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TipItem['category'])}
                    className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    <option value="Shortcut">Shortcut</option>
                    <option value="Formula">Formula</option>
                    <option value="Exam Trap">Exam Trap</option>
                    <option value="Edge Case">Edge Case</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="custom-tip-title"
                    className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5"
                  >
                    Title *
                  </label>
                  <input
                    id="custom-tip-title"
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Pumping Lemma adversary choice"
                    className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="custom-tip-detail"
                    className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5"
                  >
                    Explanation / Conceptual Rule *
                  </label>
                  <textarea
                    id="custom-tip-detail"
                    value={formDetail}
                    onChange={(e) => setFormDetail(e.target.value)}
                    rows={3}
                    placeholder="Write the exact rule, counterexample, or edge case..."
                    className="w-full rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] p-3.5 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="custom-tip-formula"
                      className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5"
                    >
                      Formula / One-Line Invariant (Optional)
                    </label>
                    <input
                      id="custom-tip-formula"
                      type="text"
                      value={formFormula}
                      onChange={(e) => setFormFormula(e.target.value)}
                      placeholder="e.g. T(n) = aT(n/b) + f(n)"
                      className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="custom-tip-summary"
                      className="block text-xs font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1.5"
                    >
                      Short Summary (Optional)
                    </label>
                    <input
                      id="custom-tip-summary"
                      type="text"
                      value={formSummary}
                      onChange={(e) => setFormSummary(e.target.value)}
                      placeholder="1-line memory hook"
                      className="w-full h-10 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-4 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                    />
                  </div>
                </div>
              </div>

              {formError && (
                <p className="text-xs font-semibold text-[#B83227] dark:text-[#F08A80]">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Formula & Edge-Case Vault Grid */}
      {filteredTips.length === 0 ? (
        <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-12 text-center shadow-warm">
          <p className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
            No matching tips or formulas found.
          </p>
          <p className="mt-1 text-xs text-[#61554D] dark:text-[#A99B8E]">
            Adjust your subject/category filters or generate fresh traps above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTips.map((tip) => {
            const isBookmarked = bookmarkedTips.includes(tip.id);
            const sourceTag = sourceBadgeLabel(tip);
            const categoryTone =
              tip.category === 'Exam Trap'
                ? 'text-[#B83227] dark:text-[#F08A80]'
                : tip.category === 'Formula'
                ? 'text-[#6E261A] dark:text-[#E59283]'
                : tip.category === 'Shortcut'
                ? 'text-[#2E5E3E] dark:text-[#7BB88F]'
                : 'text-[#B58210] dark:text-[#E0A92E]';

            return (
              <article
                key={tip.id}
                className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm card-lift flex flex-col justify-between gap-3.5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] font-mono font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                        {SUBJECT_MAP[tip.subjectId].code}
                      </span>
                      <span className={`font-bold ${categoryTone}`}>{tip.category}</span>
                      {sourceTag && (
                        <span className="px-2 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[10px] font-semibold text-[#8E620C] dark:text-[#E0A92E]">
                          {sourceTag}
                        </span>
                      )}
                      {tip.generatedDateIst && (
                        <span className="font-mono text-[10px] opacity-75">
                          {tip.generatedDateIst}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(tip.id)}
                        aria-label={
                          isBookmarked ? `Remove bookmark for ${tip.title}` : `Bookmark ${tip.title}`
                        }
                        className={`p-1.5 rounded-full transition-colors ${
                          isBookmarked
                            ? 'text-[#C89216] dark:text-[#E0A92E]'
                            : 'text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                        }`}
                      >
                        <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
                      </button>
                      {tip.isCustom && (
                        <button
                          type="button"
                          onClick={() => onDeleteCustomTip(tip.id)}
                          aria-label={`Delete custom tip ${tip.title}`}
                          className="p-1.5 rounded-full text-[#A99B8E] hover:text-[#B83227]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-2 font-display text-[15px] font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    {tip.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#61554D] dark:text-[#B8A99A] leading-relaxed">
                    {tip.detail}
                  </p>
                </div>

                {tip.formula && (
                  <div className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] px-3.5 py-2.5 font-mono text-[11px] text-[#6E261A] dark:text-[#E5B23A] overflow-x-auto">
                    {tip.formula}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
