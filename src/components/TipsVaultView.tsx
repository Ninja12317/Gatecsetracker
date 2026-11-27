import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Bookmark,
  BookmarkCheck,
  Plus,
  Trash2,
  X,
  Upload,
  Github,
  FileDown,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  Layers,
  AlertTriangle,
  ArrowUpRight,
  Star,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  FileJson,
} from 'lucide-react';
import type {
  GateSubject,
  SubjectId,
  VaultCard,
  VaultKind,
  VaultPack,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import {
  AI_BULK_VAULT_PROMPT,
  VALID_VAULT_KINDS,
  VAULT_KIND_LABELS,
  isRemovedInGate2027,
  parseAndCategorizeBulkJson,
} from '../utils/vaultImporter';
import { downloadVaultCheatSheetPdf } from '../utils/pdfExporter';
import { CodeBlock } from './CodeBlock';
import { FormulaBlock, MathText } from './MathText';

interface TipsVaultViewProps {
  allVaultCards: VaultCard[];
  vaultPacks: VaultPack[];
  bookmarkedTips: string[];
  unresolvedMistakesCount: number;
  onToggleBookmark: (cardId: string) => void;
  onImportVaultPack: (pack: VaultPack) => { addedPacks: number; addedCards: number };
  onDeleteVaultPack: (packId: string) => void;
  onAddCustomVaultCard: (
    card: Omit<VaultCard, 'id' | 'source' | 'createdAt' | 'packId' | 'packName'>
  ) => void;
  onDeleteVaultCard: (cardId: string) => void;
  onSyncVaultFromGithub: (
    url: string,
    packName?: string
  ) => Promise<{ ok: boolean; addedCards: number; duplicatesSkipped?: number; message: string }>;
  onDrillMatchingPyqs?: (card: VaultCard) => void;
  onNotify?: (msg: string) => void;
}

type KindFilter = VaultKind | 'ALL' | 'HIGH_YIELD' | 'BOOKMARKED' | 'MY_MISTAKES';

const KIND_BADGE_STYLE: Record<VaultKind, string> = {
  FORMULA:
    'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A] dark:border-[#5C441B]',
  TRAP:
    'bg-[#FCEBE9] dark:bg-[#2C1816] text-[#B83227] dark:text-[#E87A70] border-[#EBC5C0] dark:border-[#5A2925]',
  SHORTCUT:
    'bg-[#EBF4EE] dark:bg-[#17281E] text-[#2E5E3E] dark:text-[#7BB88F] border-[#C5DEC9] dark:border-[#2C4E38]',
  TIP:
    'bg-[#F4EFE6] dark:bg-[#261E1A] text-[#6E261A] dark:text-[#E5B29E] border-[#E8E0D5] dark:border-[#3A2E28]',
  COUNTER_EXAMPLE:
    'bg-[#F6EDE4] dark:bg-[#2B1F16] text-[#8A4212] dark:text-[#E3A06A] border-[#E5D2BF] dark:border-[#543A26]',
  EDGE_CASE:
    'bg-[#F3ECEA] dark:bg-[#291E1C] text-[#6E261A] dark:text-[#E09A89] border-[#E4D4CE] dark:border-[#4D342F]',
};

const SOURCE_BADGE_STYLE: Record<VaultCard['source'], string> = {
  'Master Bundle':
    'bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] border-[#E8E0D5] dark:border-[#352B25]',
  'JSON Import':
    'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A] dark:border-[#5C441B]',
  'GitHub Sync':
    'bg-[#EBF4EE] dark:bg-[#17281E] text-[#2E5E3E] dark:text-[#7BB88F] border-[#C5DEC9] dark:border-[#2C4E38]',
  'My Mistakes':
    'bg-[#FCEBE9] dark:bg-[#2C1816] text-[#B83227] dark:text-[#E87A70] border-[#EBC5C0] dark:border-[#5A2925]',
  Custom:
    'bg-[#F4EFE6] dark:bg-[#261E1A] text-[#6E261A] dark:text-[#E5B29E] border-[#E8E0D5] dark:border-[#3A2E28]',
};

const FormulaLatexBlock: React.FC<{ latex: string; compact?: boolean; darkSurface?: boolean }> = React.memo(
  ({ latex, compact = false, darkSurface = false }) => {
    return (
      <div
        data-no-swipe="true"
        data-testid="vault-katex-formula"
        className={`rounded-[16px] border overflow-x-auto no-scrollbar ${
          darkSurface
            ? 'border-[#4D3A24] bg-[#1B130F] text-[#F5EFE4]'
            : 'border-[#EED89A] dark:border-[#4F3B19] bg-[#FDF6E3]/85 dark:bg-[#241C11] text-[#1C1613] dark:text-[#F5F0E8]'
        } ${compact ? 'px-3.5 py-2.5 text-xs' : 'px-3.5 py-2.5 text-sm'}`}
      >
        <FormulaBlock
          latex={latex}
          compact={compact}
          darkSurface={darkSurface}
          className="[&_.katex]:text-[0.94em]"
        />
      </div>
    );
  }
);
FormulaLatexBlock.displayName = 'FormulaLatexBlock';

const InlineCodeText: React.FC<{ text: string; darkSurface?: boolean }> = React.memo(
  ({ text, darkSurface = false }) => (
    <MathText text={text} darkSurface={darkSurface} inline />
  )
);
InlineCodeText.displayName = 'InlineCodeText';

function getDeterministicDailyIndex(total: number): number {
  if (total <= 0) return 0;
  const now = new Date();
  const daySeed = now.getFullYear() * 1000 + now.getMonth() * 40 + now.getDate();
  return daySeed % total;
}

const PAGE_BATCH_SIZE = 36;

export const TipsVaultView: React.FC<TipsVaultViewProps> = ({
  allVaultCards,
  vaultPacks,
  bookmarkedTips,
  unresolvedMistakesCount,
  onToggleBookmark,
  onImportVaultPack,
  onDeleteVaultPack,
  onAddCustomVaultCard,
  onDeleteVaultCard,
  onSyncVaultFromGithub,
  onDrillMatchingPyqs,
  onNotify,
}) => {
  // Filters & Active Recall UI state (ZERO API calls on mount!)
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [packFilter, setPackFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [hideRemoved2027, setHideRemoved2027] = useState(false);
  const [activeRecallMode, setActiveRecallMode] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [visibleLimit, setVisibleLimit] = useState(PAGE_BATCH_SIZE);

  // Offline Daily Spotlight state
  const spotlightPool = useMemo(
    () => allVaultCards.filter((c) => c.highYield && !c.outOf2027Syllabus),
    [allVaultCards]
  );
  const [spotlightOffset, setSpotlightOffset] = useState(0);
  const spotlightCard = useMemo(() => {
    const pool = spotlightPool.length > 0 ? spotlightPool : allVaultCards;
    if (pool.length === 0) return null;
    const base = getDeterministicDailyIndex(pool.length);
    const idx = ((base + spotlightOffset) % pool.length + pool.length) % pool.length;
    return pool[idx];
  }, [spotlightPool, allVaultCards, spotlightOffset]);

  // Modals & local status toast
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [packsModalOpen, setPacksModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [localToast, setLocalToast] = useState<string>('');
  const [exportingPdf, setExportingPdf] = useState(false);

  // Bulk JSON Importer state
  const [bulkJsonText, setBulkJsonText] = useState('');
  const [bulkPackName, setBulkPackName] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // GitHub Sync state
  const [githubUrl, setGithubUrl] = useState('');
  const [githubPackName, setGithubPackName] = useState('');
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [githubFeedback, setGithubFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );

  // Custom Card Form state
  const [newSubject, setNewSubject] = useState<GateSubject>('os');
  const [newSubtopic, setNewSubtopic] = useState('');
  const [newKind, setNewKind] = useState<VaultKind>('TRAP');
  const [newHighYield, setNewHighYield] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newFormulaLatex, setNewFormulaLatex] = useState('');
  const [newCodeSnippet, setNewCodeSnippet] = useState('');
  const [newCommonTrap, setNewCommonTrap] = useState('');
  const [newGateTruth, setNewGateTruth] = useState('');
  const [newQuickExample, setNewQuickExample] = useState('');
  const [newKeywords, setNewKeywords] = useState('');

  const showToast = useCallback(
    (msg: string) => {
      setLocalToast(msg);
      onNotify?.(msg);
      window.setTimeout(() => {
        setLocalToast((prev) => (prev === msg ? '' : prev));
      }, 4200);
    },
    [onNotify]
  );

  // Per-subject live counts
  const subjectCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const s of GATE_2027_SYLLABUS) counts[s.id] = 0;
    for (const c of allVaultCards) {
      if (hideRemoved2027 && c.outOf2027Syllabus) continue;
      counts.all += 1;
      counts[c.subject] = (counts[c.subject] ?? 0) + 1;
    }
    return counts;
  }, [allVaultCards, hideRemoved2027]);

  const bookmarkSet = useMemo(() => new Set(bookmarkedTips), [bookmarkedTips]);

  // Filtered vault cards
  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allVaultCards.filter((card) => {
      if (hideRemoved2027 && card.outOf2027Syllabus) return false;
      if (subjectFilter !== 'all' && card.subject !== subjectFilter) return false;
      if (packFilter !== 'ALL') {
        if (packFilter === 'MASTER') {
          if (card.source !== 'Master Bundle') return false;
        } else if (card.packId !== packFilter) {
          return false;
        }
      }
      if (kindFilter === 'HIGH_YIELD' && !card.highYield) return false;
      if (kindFilter === 'BOOKMARKED' && !bookmarkSet.has(card.id)) return false;
      if (kindFilter === 'MY_MISTAKES' && card.source !== 'My Mistakes') return false;
      if (
        kindFilter !== 'ALL' &&
        kindFilter !== 'HIGH_YIELD' &&
        kindFilter !== 'BOOKMARKED' &&
        kindFilter !== 'MY_MISTAKES' &&
        card.kind !== kindFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        card.title.toLowerCase().includes(q) ||
        card.subtopic.toLowerCase().includes(q) ||
        card.gateTruth.toLowerCase().includes(q) ||
        (card.commonTrap?.toLowerCase().includes(q) ?? false) ||
        (card.formulaLatex?.toLowerCase().includes(q) ?? false) ||
        (card.quickExample?.toLowerCase().includes(q) ?? false) ||
        card.tagMatchKeywords.some((kw) => kw.toLowerCase().includes(q)) ||
        (SUBJECT_MAP[card.subject]?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    allVaultCards,
    hideRemoved2027,
    subjectFilter,
    packFilter,
    kindFilter,
    bookmarkSet,
    search,
  ]);

  const displayedCards = useMemo(
    () => filteredCards.slice(0, visibleLimit),
    [filteredCards, visibleLimit]
  );

  // Live Dry-Run Preview for Bulk JSON Importer
  const bulkDryRun = useMemo(() => {
    if (!bulkJsonText.trim()) return null;
    return parseAndCategorizeBulkJson(bulkJsonText, {
      packName: bulkPackName.trim() || undefined,
      source: 'JSON Import',
      existingCards: allVaultCards,
    });
  }, [bulkJsonText, bulkPackName, allVaultCards]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_BULK_VAULT_PROMPT);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2400);
    } catch {
      showToast('Copy blocked by browser — select text manually.');
    }
  };

  const handleUploadJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!bulkPackName.trim()) {
      setBulkPackName(file.name.replace(/\.json$/i, '').slice(0, 80));
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBulkJsonText(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmBulkImport = () => {
    if (!bulkDryRun || !bulkDryRun.ok || !bulkDryRun.pack) return;
    const res = onImportVaultPack(bulkDryRun.pack);
    setBulkModalOpen(false);
    setBulkJsonText('');
    setBulkPackName('');
    showToast(
      `Imported ${res.addedCards} card(s) into "${bulkDryRun.pack.name}" · Synced permanently!`
    );
  };

  const handleGithubSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim() || githubSyncing) return;
    setGithubSyncing(true);
    setGithubFeedback(null);
    const res = await onSyncVaultFromGithub(githubUrl.trim(), githubPackName.trim() || undefined);
    setGithubSyncing(false);
    if (res.ok) {
      setGithubFeedback({ type: 'ok', msg: res.message });
      setGithubUrl('');
      setGithubPackName('');
      showToast(res.message);
    } else {
      setGithubFeedback({ type: 'err', msg: res.message });
    }
  };

  const handleExportCheatSheetPdf = async () => {
    if (exportingPdf || filteredCards.length === 0) return;
    setExportingPdf(true);
    const subjLabel =
      subjectFilter === 'all'
        ? 'All 11 GATE CSE 2027 Subjects'
        : SUBJECT_MAP[subjectFilter]?.name ?? subjectFilter.toUpperCase();
    const kindLabel =
      kindFilter === 'ALL'
        ? 'All Cards'
        : kindFilter === 'HIGH_YIELD'
        ? 'High-Yield Only'
        : kindFilter === 'BOOKMARKED'
        ? 'Bookmarked Only'
        : kindFilter === 'MY_MISTAKES'
        ? 'Mistake-Mined Traps'
        : VAULT_KIND_LABELS[kindFilter];
    const res = await downloadVaultCheatSheetPdf(filteredCards, {
      title: `GATE CSE 2027 · ${subjLabel} Formula & Trap Sheet`,
      subtitle: `${filteredCards.length} Cards · Filter: ${kindLabel} · IIT Madras 2027 Syllabus`,
    });
    setExportingPdf(false);
    if (res.ok) {
      showToast(`Downloaded ${res.filename} (${res.pageCount} A4 pages).`);
    } else {
      showToast(res.error || 'Could not export PDF.');
    }
  };

  const handleCreateCustomCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newGateTruth.trim()) return;
    const combined = `${newTitle} ${newSubtopic} ${newCommonTrap} ${newGateTruth}`;
    const kws = newKeywords
      .split(/[,;]/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 2);

    onAddCustomVaultCard({
      subject: newSubject,
      subtopic: newSubtopic.trim() || SUBJECT_MAP[newSubject]?.shortName || 'Core Concepts',
      tagMatchKeywords:
        kws.length > 0 ? kws.slice(0, 8) : [newTitle.trim().toLowerCase().slice(0, 32)],
      kind: newKind,
      highYield: newHighYield,
      title: newTitle.trim().slice(0, 180),
      formulaLatex: newFormulaLatex.trim() || undefined,
      codeSnippet: newCodeSnippet.trim() || undefined,
      commonTrap: newCommonTrap.trim() || undefined,
      gateTruth: newGateTruth.trim(),
      quickExample: newQuickExample.trim() || undefined,
      outOf2027Syllabus: isRemovedInGate2027(combined) || undefined,
    });

    setNewTitle('');
    setNewSubtopic('');
    setNewFormulaLatex('');
    setNewCodeSnippet('');
    setNewCommonTrap('');
    setNewGateTruth('');
    setNewQuickExample('');
    setNewKeywords('');
    setAddModalOpen(false);
    showToast('Added custom card to your permanent Vault.');
  };

  const toggleRevealCard = (cardId: string) => {
    setRevealedIds((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const toggleRecallMode = () => {
    setActiveRecallMode((prev) => {
      if (prev) setRevealedIds({});
      return !prev;
    });
  };

  const importedCardCount = useMemo(
    () => vaultPacks.reduce((acc, p) => acc + p.cardCount, 0),
    [vaultPacks]
  );

  return (
    <div className="space-y-5" data-testid="formula-trap-vault">
      {/* Top Vault Hero & Single-Row Scrollable Action Strip */}
      <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 sm:p-6 shadow-warm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A] dark:border-[#5C441B]">
                <Sparkles className="h-3 w-3" />
                100% Offline Master Bundle · Zero API Errors
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#F4EFE6] dark:bg-[#241D19] text-[#6E261A] dark:text-[#E5B29E] border border-[#E8E0D5] dark:border-[#352B25]">
                {allVaultCards.length} Cards
              </span>
              {vaultPacks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPacksModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBF4EE] dark:bg-[#17281E] text-[#2E5E3E] dark:text-[#7BB88F] border border-[#C5DEC9] dark:border-[#2C4E38] press-tactile"
                >
                  <Layers className="h-3 w-3" />
                  {vaultPacks.length} Pack{vaultPacks.length > 1 ? 's' : ''} ({importedCardCount})
                </button>
              )}
            </div>
            <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
              Traps, Tricks &amp;{' '}
              <span className="text-[#6E261A] dark:text-[#E0A92E]">Formula Vault</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E]">
              IIT Madras GATE CSE 2027 offline formula bank, bulk JSON auto-categorizer (50–500+ cards), zero-cost GitHub sync, Active-Recall mode &amp; A4 Cheat Sheet PDF export.
            </p>
          </div>

          {/* Single-Row Horizontally Scrollable Action Pills */}
          <div
            data-no-swipe="true"
            className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 shrink-0"
          >
            <button
              type="button"
              data-testid="vault-open-bulk-import"
              onClick={() => setBulkModalOpen(true)}
              className="shrink-0 whitespace-nowrap h-10 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B24937] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-warm press-tactile"
            >
              <Upload className="h-3.5 w-3.5" />
              Import JSON (50–500+)
            </button>

            <button
              type="button"
              data-testid="vault-open-github-sync"
              onClick={() => {
                setGithubFeedback(null);
                setGithubModalOpen(true);
              }}
              className="shrink-0 whitespace-nowrap h-10 px-3.5 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] text-[#1C1613] dark:text-[#F5F0E8] text-xs font-semibold inline-flex items-center gap-1.5 press-tactile"
            >
              <Github className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
              GitHub Sync (₹0)
            </button>

            <button
              type="button"
              data-testid="vault-export-a4-pdf"
              disabled={exportingPdf || filteredCards.length === 0}
              onClick={() => void handleExportCheatSheetPdf()}
              className="shrink-0 whitespace-nowrap h-10 px-3.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] hover:bg-[#F8EBC6] text-[#8B6209] dark:text-[#E0A92E] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 press-tactile"
            >
              {exportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              A4 Cheat Sheet PDF ({filteredCards.length})
            </button>

            <button
              type="button"
              data-testid="vault-open-add-card"
              onClick={() => setAddModalOpen(true)}
              className="shrink-0 whitespace-nowrap h-10 px-3.5 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FFFFFF] dark:bg-[#1C1714] hover:border-[#6E261A] text-[#1C1613] dark:text-[#F5F0E8] text-xs font-semibold inline-flex items-center gap-1.5 press-tactile"
            >
              <Plus className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
              Add Card
            </button>
          </div>
        </div>

        {/* Local Toast Feedback Banner */}
        {localToast && (
          <div
            role="status"
            data-testid="vault-toast"
            className="rounded-full bg-[#241914] text-[#FAF5EB] border border-[#C89216]/50 px-4 py-2 text-xs font-medium inline-flex items-center gap-2"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-[#7BB88F] shrink-0" />
            <span>{localToast}</span>
          </div>
        )}
      </div>

      {/* Offline Deterministic Daily Spotlight Card (Dark Matte Roasted Cocoa Bento Tile) */}
      {spotlightCard && (
        <div className="rounded-[28px] squircle border border-[#352A24] bg-[#241914] text-[#FAF5EB] p-4 sm:p-5 shadow-warm-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#382B24]">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#C89216]/20 text-[#E5B23A] border border-[#C89216]/40 whitespace-nowrap shrink-0">
                Daily Spotlight · Offline
              </span>
              <span className="text-xs font-mono font-semibold text-[#D8CBB8] truncate">
                {SUBJECT_MAP[spotlightCard.subject]?.code ?? spotlightCard.subject.toUpperCase()} ·{' '}
                {spotlightCard.subtopic}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                aria-label="Previous spotlight card"
                onClick={() => setSpotlightOffset((n) => n - 1)}
                className="h-7 w-7 rounded-full border border-[#3E3028] bg-[#2C221D] hover:border-[#C89216] flex items-center justify-center text-[#D8CBB8] press-tactile"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Shuffle spotlight card"
                onClick={() => setSpotlightOffset((n) => n + Math.max(3, Math.floor(Math.random() * 29)))}
                className="h-7 w-7 rounded-full border border-[#3E3028] bg-[#2C221D] hover:border-[#C89216] flex items-center justify-center text-[#E5B23A] press-tactile"
              >
                <Shuffle className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Next spotlight card"
                onClick={() => setSpotlightOffset((n) => n + 1)}
                className="h-7 w-7 rounded-full border border-[#3E3028] bg-[#2C221D] hover:border-[#C89216] flex items-center justify-center text-[#D8CBB8] press-tactile"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-8 space-y-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#FAF8F4]">
                <InlineCodeText text={spotlightCard.title} darkSurface />
              </h2>
              {spotlightCard.commonTrap && (
                <p className="text-xs text-[#F0A39A] leading-relaxed">
                  <span className="font-semibold text-[#E87A70]">Common Trap:</span>{' '}
                  <InlineCodeText text={spotlightCard.commonTrap} darkSurface />
                </p>
              )}
              <p className="text-xs sm:text-sm text-[#E8DFD3] leading-relaxed">
                <span className="font-semibold text-[#E5B23A]">GATE Truth:</span>{' '}
                <InlineCodeText text={spotlightCard.gateTruth} darkSurface />
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-2">
              {spotlightCard.formulaLatex && (
                <FormulaLatexBlock latex={spotlightCard.formulaLatex} compact darkSurface />
              )}
              {onDrillMatchingPyqs && (
                <button
                  type="button"
                  onClick={() => onDrillMatchingPyqs(spotlightCard)}
                  className="h-9 px-3.5 rounded-full bg-[#C89216] hover:bg-[#B18012] text-[#1C1613] text-xs font-bold inline-flex items-center justify-center gap-1.5 press-tactile"
                >
                  Drill Matching GateR PYQs
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search + Active Recall + Single-Row Scrollable Subject & Kind Filter Rails */}
      <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5 sm:p-4 shadow-warm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="h-4 w-4 text-[#8C7E75] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="vault-search-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleLimit(PAGE_BATCH_SIZE);
              }}
              placeholder="Search formulas, traps, keywords (e.g. TLB, LALR, BCNF, Rice, Belady)..."
              className="w-full h-10 pl-9 pr-8 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs sm:text-sm text-[#1C1613] dark:text-[#F5F0E8] placeholder:text-[#8C7E75] focus:outline-none focus:border-[#6E261A] dark:focus:border-[#E0A92E]"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-[#E8E0D5]/60 dark:hover:bg-[#352B25] flex items-center justify-center text-[#61554D]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Active Recall Mode + 2027 Filter Toggles */}
          <div
            data-no-swipe="true"
            className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar shrink-0"
          >
            <button
              type="button"
              data-testid="vault-active-recall-toggle"
              onClick={toggleRecallMode}
              className={`shrink-0 whitespace-nowrap h-10 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors press-tactile ${
                activeRecallMode
                  ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white border-[#6E261A] dark:border-[#9E3E2E]'
                  : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352B25]'
              }`}
            >
              {activeRecallMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {activeRecallMode ? 'Recall Mode ON' : 'Active Recall'}
            </button>

            <button
              type="button"
              onClick={() => setHideRemoved2027((v) => !v)}
              className={`shrink-0 whitespace-nowrap h-10 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors press-tactile ${
                hideRemoved2027
                  ? 'bg-[#EBF4EE] dark:bg-[#17281E] text-[#2E5E3E] dark:text-[#7BB88F] border-[#C5DEC9] dark:border-[#2C4E38]'
                  : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] border-[#E8E0D5] dark:border-[#352B25]'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {hideRemoved2027 ? '2027 Syllabus Strict' : 'Show All Tags'}
            </button>

            {vaultPacks.length > 0 && (
              <button
                type="button"
                onClick={() => setPacksModalOpen(true)}
                className="shrink-0 whitespace-nowrap h-10 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-[#6E261A] dark:text-[#E0A92E] press-tactile"
              >
                <Layers className="h-3.5 w-3.5" />
                Packs ({vaultPacks.length})
              </button>
            )}
          </div>
        </div>

        {/* Single-Row Horizontally Scrollable Subject Tabs (All + 11 Official Subjects) */}
        <div
          data-no-swipe="true"
          data-testid="vault-subject-rail"
          className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
        >
          <button
            type="button"
            onClick={() => {
              setSubjectFilter('all');
              setVisibleLimit(PAGE_BATCH_SIZE);
            }}
            className={`shrink-0 whitespace-nowrap h-8 px-3 rounded-full text-xs font-semibold transition-colors press-tactile ${
              subjectFilter === 'all'
                ? 'bg-[#6E261A] dark:bg-[#E0A92E] text-white dark:text-[#1C1613]'
                : 'bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613]'
            }`}
          >
            All ({subjectCounts.all ?? 0})
          </button>
          {GATE_2027_SYLLABUS.map((subj) => (
            <button
              key={subj.id}
              type="button"
              onClick={() => {
                setSubjectFilter(subj.id);
                setVisibleLimit(PAGE_BATCH_SIZE);
              }}
              className={`shrink-0 whitespace-nowrap h-8 px-3 rounded-full text-xs font-semibold transition-colors press-tactile ${
                subjectFilter === subj.id
                  ? 'bg-[#6E261A] dark:bg-[#E0A92E] text-white dark:text-[#1C1613]'
                  : 'bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613]'
              }`}
            >
              {subj.code} ({subjectCounts[subj.id] ?? 0})
            </button>
          ))}
        </div>

        {/* Single-Row Horizontally Scrollable Kind & Special Filters */}
        <div
          data-no-swipe="true"
          data-testid="vault-kind-rail"
          className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5"
        >
          {(
            [
              { id: 'ALL', label: 'All Types' },
              { id: 'FORMULA', label: 'Formulas' },
              { id: 'TRAP', label: 'Exam Traps' },
              { id: 'SHORTCUT', label: 'Shortcuts' },
              { id: 'COUNTER_EXAMPLE', label: 'Counter-Examples' },
              { id: 'EDGE_CASE', label: 'Edge Cases' },
              { id: 'TIP', label: 'Strategy Tips' },
              { id: 'HIGH_YIELD', label: '★ High-Yield' },
              { id: 'BOOKMARKED', label: `Bookmarked (${bookmarkedTips.length})` },
              {
                id: 'MY_MISTAKES',
                label: `My Mistakes (${unresolvedMistakesCount})`,
              },
            ] as Array<{ id: KindFilter; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setKindFilter(item.id);
                setVisibleLimit(PAGE_BATCH_SIZE);
              }}
              className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full text-[11px] font-semibold border transition-colors press-tactile ${
                kindFilter === item.id
                  ? 'bg-[#241914] dark:bg-[#F5F0E8] text-[#FAF8F4] dark:text-[#1C1613] border-[#241914] dark:border-[#F5F0E8]'
                  : 'bg-[#FAF8F4] dark:bg-[#1C1714] text-[#61554D] dark:text-[#A99B8E] border-[#E8E0D5] dark:border-[#352B25] hover:border-[#C89216]'
              }`}
            >
              {item.label}
            </button>
          ))}

          {packFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setPackFilter('ALL')}
              className="shrink-0 whitespace-nowrap h-7 px-2.5 rounded-full text-[11px] font-semibold bg-[#FDF6E3] text-[#8B6209] border border-[#EED89A] inline-flex items-center gap-1"
            >
              Pack Filter Active
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Results Count Header */}
      <div className="flex items-center justify-between px-1 text-xs text-[#61554D] dark:text-[#A99B8E]">
        <span>
          Showing <strong className="text-[#1C1613] dark:text-[#F5F0E8] font-mono">{displayedCards.length}</strong> of{' '}
          <strong className="text-[#1C1613] dark:text-[#F5F0E8] font-mono">{filteredCards.length}</strong> matching cards
          {activeRecallMode && ' · Tap "Reveal GATE Truth" on any card to test recall'}
        </span>
        {(search || subjectFilter !== 'all' || kindFilter !== 'ALL' || packFilter !== 'ALL') && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSubjectFilter('all');
              setKindFilter('ALL');
              setPackFilter('ALL');
            }}
            className="text-[#6E261A] dark:text-[#E0A92E] font-semibold hover:underline"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Vault Card Grid */}
      {displayedCards.length === 0 ? (
        <div className="rounded-[26px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-10 text-center space-y-2">
          <p className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
            No Vault Cards Match This Filter
          </p>
          <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
            Clear your search or import a bulk JSON pack of 50–500+ cards to expand this subject.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayedCards.map((card) => {
            const subj = SUBJECT_MAP[card.subject];
            const isBookmarked = bookmarkSet.has(card.id);
            const isHidden = activeRecallMode && !revealedIds[card.id];
            const canDelete =
              card.source === 'JSON Import' ||
              card.source === 'GitHub Sync' ||
              card.source === 'Custom';

            return (
              <article
                key={card.id}
                data-testid="vault-card"
                className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 sm:p-5 shadow-warm flex flex-col justify-between gap-3.5 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="space-y-3">
                  {/* Card Top Meta Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#6E261A] dark:bg-[#9E3E2E] text-white">
                        {subj?.code ?? card.subject.toUpperCase()}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${KIND_BADGE_STYLE[card.kind]}`}
                      >
                        {VAULT_KIND_LABELS[card.kind]}
                      </span>
                      {card.highYield && (
                        <span
                          title="High-Yield IIT Madras GATE Concept"
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A] dark:border-[#5C441B]"
                        >
                          <Star className="h-2.5 w-2.5 fill-current" />
                          High-Yield
                        </span>
                      )}
                      {card.outOf2027Syllabus && (
                        <span
                          data-testid="vault-2027-removed-badge"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FCEBE9] dark:bg-[#2C1816] text-[#B83227] dark:text-[#E87A70] border border-[#EBC5C0] dark:border-[#5A2925]"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Removed in 2027
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark card'}
                        onClick={() => onToggleBookmark(card.id)}
                        className={`h-8 w-8 rounded-full flex items-center justify-center border transition-colors press-tactile ${
                          isBookmarked
                            ? 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#C89216] border-[#EED89A] dark:border-[#5C441B]'
                            : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#8C7E75] border-[#E8E0D5] dark:border-[#352B25] hover:text-[#6E261A]'
                        }`}
                      >
                        {isBookmarked ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label="Delete custom card"
                          onClick={() => onDeleteVaultCard(card.id)}
                          className="h-8 w-8 rounded-full flex items-center justify-center border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-[#8C7E75] hover:text-[#B83227] hover:border-[#B83227]/40 press-tactile"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Subtopic & Title */}
                  <div>
                    <p className="text-[11px] font-medium text-[#8C7E75] dark:text-[#A99B8E]">
                      {card.subtopic}
                      {card.packName ? ` · ${card.packName}` : ''}
                    </p>
                    <h3 className="mt-0.5 font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8] leading-snug">
                      <InlineCodeText text={card.title} />
                    </h3>
                  </div>

                  {/* Common Trap Callout (Always visible even in Recall Mode as the active-recall prompt!) */}
                  {card.commonTrap && (
                    <div className="rounded-[16px] border border-[#EBC5C0] dark:border-[#4F2521] bg-[#FCEBE9]/60 dark:bg-[#261513] px-3.5 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#B83227] dark:text-[#E87A70]">
                        Common Exam Trap
                      </p>
                      <p className="mt-0.5 text-xs text-[#3C221E] dark:text-[#F2D8D5] leading-relaxed">
                        <InlineCodeText text={card.commonTrap} />
                      </p>
                    </div>
                  )}

                  {/* Active Recall Veil OR Full Formula + Code + GATE Truth */}
                  {isHidden ? (
                    <button
                      type="button"
                      data-testid="vault-reveal-truth-btn"
                      onClick={() => toggleRevealCard(card.id)}
                      className="w-full rounded-[18px] border border-dashed border-[#C89216] bg-[#FDF6E3]/65 dark:bg-[#241C11] px-4 py-5 text-center space-y-1 hover:bg-[#FDF6E3] dark:hover:bg-[#2C2215] transition-colors press-tactile"
                    >
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">
                        <Eye className="h-4 w-4" />
                        Tap to Reveal GATE Truth &amp; Formula
                      </span>
                      <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                        Test yourself aloud before checking the exact rule.
                      </p>
                    </button>
                  ) : (
                    <div className="space-y-2.5">
                      {card.formulaLatex && <FormulaLatexBlock latex={card.formulaLatex} />}

                      {card.codeSnippet && (
                        <div data-no-swipe="true">
                          <CodeBlock code={card.codeSnippet} label="GATE Snippet" />
                        </div>
                      )}

                      <div className="rounded-[16px] border border-[#C5DEC9] dark:border-[#2A4734] bg-[#EBF4EE]/55 dark:bg-[#15241A] px-3.5 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#2E5E3E] dark:text-[#7BB88F]">
                            Exact GATE Truth
                          </p>
                          {activeRecallMode && (
                            <button
                              type="button"
                              onClick={() => toggleRevealCard(card.id)}
                              className="text-[10px] font-semibold text-[#61554D] dark:text-[#A99B8E] hover:underline"
                            >
                              Hide Again
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-xs sm:text-[13px] text-[#1C1613] dark:text-[#EFEAE2] leading-relaxed">
                          <InlineCodeText text={card.gateTruth} />
                        </p>
                      </div>

                      {card.quickExample && (
                        <div className="rounded-[14px] border border-[#E8E0D5] dark:border-[#322823] bg-[#FAF8F4] dark:bg-[#241D19] px-3 py-2 text-xs text-[#61554D] dark:text-[#C5B8AA] leading-relaxed">
                          <span className="font-semibold text-[#6E261A] dark:text-[#E0A92E]">
                            Quick Example:{' '}
                          </span>
                          <InlineCodeText text={card.quickExample} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer: Source Pill + Drill Matching GateR PYQs */}
                <div className="pt-2.5 border-t border-[#EFE8DC] dark:border-[#2A221D] flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${SOURCE_BADGE_STYLE[card.source]}`}
                  >
                    {card.source}
                  </span>

                  {onDrillMatchingPyqs && !card.outOf2027Syllabus && (
                    <button
                      type="button"
                      data-testid="vault-drill-pyq-btn"
                      onClick={() => onDrillMatchingPyqs(card)}
                      className="h-7 px-3 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] hover:bg-[#6E261A] hover:text-white dark:hover:bg-[#E0A92E] dark:hover:text-[#1C1613] text-[#6E261A] dark:text-[#E0A92E] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors press-tactile"
                    >
                      Drill Matching PYQs
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Load More Pagination for 132–600+ Cards */}
      {displayedCards.length < filteredCards.length && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleLimit((n) => n + PAGE_BATCH_SIZE)}
            className="h-10 px-6 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FFFFFF] dark:bg-[#1C1714] hover:border-[#6E261A] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] shadow-warm press-tactile"
          >
            Load More Cards ({filteredCards.length - displayedCards.length} remaining)
          </button>
        </div>
      )}

      {/* ==================== MODAL 1: MASSIVE BULK JSON IMPORTER (50–500+ CARDS) ==================== */}
      {bulkModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-import-title"
          data-testid="vault-bulk-import-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1C1613]/60 backdrop-blur-xs p-2 sm:p-4"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm-lg space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="bulk-import-title"
                  className="font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  Bulk JSON Importer &amp; Smart Auto-Categorizer
                </h2>
                <p className="mt-0.5 text-xs text-[#61554D] dark:text-[#A99B8E]">
                  Paste or upload 50–500+ AI-generated cards at once. Auto-detects subjects &amp; card kinds, flags removed 2027 topics, deduplicates, and syncs across devices.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close bulk importer"
                onClick={() => setBulkModalOpen(false)}
                className="h-8 w-8 rounded-full border border-[#E8E0D5] dark:border-[#352B25] flex items-center justify-center text-[#61554D] hover:text-[#1C1613] shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Prompt Copy + File Upload Row */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyPrompt()}
                className="h-9 px-3.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] text-xs font-semibold inline-flex items-center gap-1.5 press-tactile"
              >
                {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedPrompt ? 'AI Prompt Copied!' : 'Copy 50-Card AI JSON Prompt'}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json,text/plain"
                onChange={handleUploadJsonFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3.5 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] text-xs font-semibold inline-flex items-center gap-1.5 press-tactile"
              >
                <FileJson className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
                Upload .json File
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                Pack Name (Optional — makes packs easy to manage or remove later)
              </label>
              <input
                type="text"
                data-testid="bulk-pack-name-input"
                value={bulkPackName}
                onChange={(e) => setBulkPackName(e.target.value)}
                placeholder="e.g. GO Classes OS + CN Formula Mega Pack"
                className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#6E261A]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                Paste JSON Array or <code className="font-mono text-[#6E261A] dark:text-[#E0A92E]">{`{ "cards": [...] }`}</code>
              </label>
              <textarea
                data-testid="bulk-json-textarea"
                rows={8}
                value={bulkJsonText}
                onChange={(e) => setBulkJsonText(e.target.value)}
                placeholder='[{"subject":"os","title":"TLB Miss EMAT","formulaLatex":"...","commonTrap":"...","gateTruth":"..."}]'
                className="w-full rounded-[20px] border border-[#E8E0D5] dark:border-[#352B25] bg-[#1E1815] text-[#F5EFE6] placeholder:text-[#8C7E75] p-3.5 font-mono text-xs leading-relaxed focus:outline-none focus:border-[#C89216]"
              />
            </div>

            {/* Live Auto-Categorizer Dry-Run Preview */}
            {bulkDryRun && (
              <div
                data-testid="bulk-dry-run-preview"
                className={`rounded-[20px] border p-3.5 text-xs space-y-2 ${
                  bulkDryRun.ok
                    ? 'border-[#C5DEC9] dark:border-[#2C4E38] bg-[#EBF4EE]/60 dark:bg-[#15241A]'
                    : 'border-[#EBC5C0] dark:border-[#5A2925] bg-[#FCEBE9]/70 dark:bg-[#261513]'
                }`}
              >
                {bulkDryRun.ok ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-[#2E5E3E] dark:text-[#7BB88F]">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        Ready to import {bulkDryRun.stats.added} new card(s) (parsed{' '}
                        {bulkDryRun.stats.totalParsed})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {bulkDryRun.stats.autoCategorizedCount > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A]">
                          Auto-categorized: {bulkDryRun.stats.autoCategorizedCount}
                        </span>
                      )}
                      {bulkDryRun.stats.duplicatesSkipped > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] border border-[#E8E0D5]">
                          Duplicates skipped: {bulkDryRun.stats.duplicatesSkipped}
                        </span>
                      )}
                      {bulkDryRun.stats.outOf2027Flagged > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#FCEBE9] dark:bg-[#2C1816] text-[#B83227] dark:text-[#E87A70] border border-[#EBC5C0]">
                          Removed 2027 flagged: {bulkDryRun.stats.outOf2027Flagged}
                        </span>
                      )}
                      {Object.entries(bulkDryRun.stats.subjectBreakdown).map(([sid, cnt]) => (
                        <span
                          key={sid}
                          className="px-2 py-0.5 rounded-full font-mono bg-[#FFFFFF] dark:bg-[#1C1714] text-[#6E261A] dark:text-[#E0A92E] border border-[#E8E0D5] dark:border-[#352B25]"
                        >
                          {sid.toUpperCase()}: {cnt}
                        </span>
                      ))}
                    </div>

                    {/* Rendered KaTeX Preview of First 2 Parsed Cards */}
                    {bulkDryRun.cards.length > 0 && (
                      <div
                        data-testid="bulk-rendered-preview"
                        className="pt-2 mt-2 border-t border-[#C5DEC9]/70 dark:border-[#2C4E38]/70 space-y-2"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#2E5E3E] dark:text-[#7BB88F]">
                          Rendered Math Preview (showing {Math.min(2, bulkDryRun.cards.length)} of{' '}
                          {bulkDryRun.cards.length})
                        </p>
                        {bulkDryRun.cards.slice(0, 2).map((previewCard, pIdx) => (
                          <div
                            key={`${previewCard.id}-${pIdx}`}
                            className="rounded-[16px] border border-[#E8E0D5] dark:border-[#352B25] bg-[#FFFFFF] dark:bg-[#1C1714] p-3 space-y-1.5"
                          >
                            <div className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                              <MathText text={previewCard.title} inline />
                            </div>
                            {previewCard.formulaLatex && (
                              <FormulaLatexBlock latex={previewCard.formulaLatex} compact />
                            )}
                            <p className="text-[11px] text-[#61554D] dark:text-[#C5B8AA] leading-relaxed">
                              <MathText text={previewCard.gateTruth} inline />
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="font-semibold text-[#B83227] dark:text-[#E87A70]">
                    {bulkDryRun.error}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] text-xs font-semibold text-[#61554D] dark:text-[#A99B8E]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="vault-confirm-bulk-import"
                disabled={!bulkDryRun?.ok}
                onClick={handleConfirmBulkImport}
                className="h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold disabled:opacity-45 press-tactile"
              >
                Save {bulkDryRun?.ok ? bulkDryRun.stats.added : ''} Cards Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: GITHUB REPO BUNDLE SYNC (ZERO AI COST) ==================== */}
      {githubModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="github-sync-title"
          data-testid="vault-github-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1C1613]/60 backdrop-blur-xs p-2 sm:p-4"
        >
          <div className="w-full max-w-lg rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm-lg space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="github-sync-title"
                  className="font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  GitHub Repo Bundle Sync (₹0 AI Cost)
                </h2>
                <p className="mt-0.5 text-xs text-[#61554D] dark:text-[#A99B8E]">
                  Paste any public GitHub repo (`github.com/user/repo`) or raw `.json` file URL. Server proxy fetches &amp; auto-categorizes cards with zero Gemini quota usage.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close GitHub sync modal"
                onClick={() => setGithubModalOpen(false)}
                className="h-8 w-8 rounded-full border border-[#E8E0D5] dark:border-[#352B25] flex items-center justify-center text-[#61554D] shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleGithubSyncSubmit(e)} className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                  Public GitHub Repo or Raw JSON URL
                </label>
                <input
                  type="url"
                  required
                  data-testid="github-sync-url-input"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/user/gate27-notes/main/vault.json"
                  className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-mono text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#6E261A]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                  Pack Label (Optional)
                </label>
                <input
                  type="text"
                  value={githubPackName}
                  onChange={(e) => setGithubPackName(e.target.value)}
                  placeholder="e.g. Community GATE CSE Formulas"
                  className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#6E261A]"
                />
              </div>

              <p className="text-[11px] text-[#8C7E75] dark:text-[#A99B8E] leading-relaxed">
                Repo roots automatically probe <code className="font-mono">gate27-vault.json</code>,{' '}
                <code className="font-mono">vault.json</code>, <code className="font-mono">formulas.json</code>, and{' '}
                <code className="font-mono">traps.json</code> on <code className="font-mono">main</code>/<code className="font-mono">master</code>.
              </p>

              {githubFeedback && (
                <div
                  className={`rounded-[16px] border px-3.5 py-2.5 text-xs font-medium ${
                    githubFeedback.type === 'ok'
                      ? 'border-[#C5DEC9] bg-[#EBF4EE] text-[#2E5E3E] dark:bg-[#15241A] dark:text-[#7BB88F]'
                      : 'border-[#EBC5C0] bg-[#FCEBE9] text-[#B83227] dark:bg-[#261513] dark:text-[#E87A70]'
                  }`}
                >
                  {githubFeedback.msg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setGithubModalOpen(false)}
                  className="h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] text-xs font-semibold text-[#61554D]"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={githubSyncing || !githubUrl.trim()}
                  className="h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 press-tactile"
                >
                  {githubSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Github className="h-3.5 w-3.5" />
                  )}
                  {githubSyncing ? 'Syncing...' : 'Fetch & Sync Bundle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: SAVED PACKS MANAGER ==================== */}
      {packsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="packs-mgr-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1C1613]/60 backdrop-blur-xs p-2 sm:p-4"
        >
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2
                id="packs-mgr-title"
                className="font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]"
              >
                Imported &amp; Synced Vault Packs
              </h2>
              <button
                type="button"
                onClick={() => setPacksModalOpen(false)}
                className="h-8 w-8 rounded-full border border-[#E8E0D5] dark:border-[#352B25] flex items-center justify-center text-[#61554D]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {vaultPacks.length === 0 ? (
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E] py-4 text-center">
                No custom packs imported yet. Use &ldquo;Import JSON&rdquo; or &ldquo;GitHub Sync&rdquo; to add packs.
              </p>
            ) : (
              <div className="space-y-2.5">
                {vaultPacks.map((pack) => (
                  <div
                    key={pack.packId}
                    className="rounded-[20px] border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-xs sm:text-sm text-[#1C1613] dark:text-[#F5F0E8] truncate">
                        {pack.name}
                      </p>
                      <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                        {pack.source} · <span className="font-mono font-semibold">{pack.cardCount}</span> cards
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPackFilter(pack.packId);
                          setPacksModalOpen(false);
                        }}
                        className="h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FFFFFF] dark:bg-[#1C1714] text-[11px] font-semibold text-[#6E261A] dark:text-[#E0A92E]"
                      >
                        Filter
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete pack ${pack.name}`}
                        onClick={() => {
                          onDeleteVaultPack(pack.packId);
                          if (packFilter === pack.packId) setPackFilter('ALL');
                          showToast(`Deleted pack "${pack.name}".`);
                        }}
                        className="h-8 w-8 rounded-full border border-[#EBC5C0] bg-[#FCEBE9] text-[#B83227] flex items-center justify-center press-tactile"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL 4: ADD CUSTOM VAULT CARD ==================== */}
      {addModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-card-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1C1613]/60 backdrop-blur-xs p-2 sm:p-4"
        >
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2
                id="add-card-title"
                className="font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]"
              >
                Add Custom Formula / Trap Card
              </h2>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="h-8 w-8 rounded-full border border-[#E8E0D5] dark:border-[#352B25] flex items-center justify-center text-[#61554D]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomCard} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                    Subject
                  </label>
                  <select
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value as GateSubject)}
                    className="w-full h-10 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    {GATE_2027_SYLLABUS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.shortName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E] mb-1">
                    Card Kind
                  </label>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as VaultKind)}
                    className="w-full h-10 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    {VALID_VAULT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {VAULT_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Card Title *"
                  className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
                <input
                  type="text"
                  value={newSubtopic}
                  onChange={(e) => setNewSubtopic(e.target.value)}
                  placeholder="Subtopic (e.g. Virtual Memory)"
                  className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <input
                type="text"
                value={newFormulaLatex}
                onChange={(e) => setNewFormulaLatex(e.target.value)}
                placeholder="Optional LaTeX Formula (e.g. T(n) = 2T(n/2) + n/\log n)"
                className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-mono text-[#1C1613] dark:text-[#F5F0E8]"
              />
              {newFormulaLatex.trim() && <FormulaLatexBlock latex={newFormulaLatex.trim()} compact />}

              <textarea
                rows={2}
                value={newCommonTrap}
                onChange={(e) => setNewCommonTrap(e.target.value)}
                placeholder="Common Trap (What students mistakenly assume...)"
                className="w-full rounded-[18px] border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] p-3 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
              />

              <textarea
                rows={3}
                required
                value={newGateTruth}
                onChange={(e) => setNewGateTruth(e.target.value)}
                placeholder="Exact GATE Truth / Rule / Proof *"
                className="w-full rounded-[18px] border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] p-3 text-xs text-[#1C1613] dark:text-[#F5F0E8]"
              />

              <textarea
                rows={2}
                value={newCodeSnippet}
                onChange={(e) => setNewCodeSnippet(e.target.value)}
                placeholder="Optional C / SQL Code Snippet"
                className="w-full rounded-[18px] border border-[#E8E0D5] dark:border-[#352B25] bg-[#1E1815] text-[#F5EFE6] p-3 font-mono text-xs"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={newQuickExample}
                  onChange={(e) => setNewQuickExample(e.target.value)}
                  placeholder="Quick 1-Line Example"
                  className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
                <input
                  type="text"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  placeholder="PYQ Tag Keywords (comma-separated)"
                  className="w-full h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] bg-[#FAF8F4] dark:bg-[#241D19] text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8]">
                <input
                  type="checkbox"
                  checked={newHighYield}
                  onChange={(e) => setNewHighYield(e.target.checked)}
                  className="rounded accent-[#6E261A]"
                />
                Mark as High-Yield GATE 2027 Card
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352B25] text-xs font-semibold text-[#61554D]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                >
                  Save Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
