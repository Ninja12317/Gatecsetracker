import React, { useState, useMemo } from 'react';
import {
  FlaskConical,
  Grid3X3,
  HardDrive,
  Binary,
  Network,
  Cpu,
  Eye,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Trophy,
  Info,
  GitBranch,
  CircuitBoard,
} from 'lucide-react';
import type { DryRunTraceTable } from '../types';
import {
  TOC_CLOSURE_ROWS,
  TOC_DECIDABILITY_ROWS,
  TOC_LANGUAGES,
  makeTocCellKey,
  pickQuizCells,
  computeCacheBitSplit,
  computeVirtualMemoryPageTable,
  decimalToIeee754,
  hexToIeee754,
  computeTwosComplement,
  computeIpv4Cidr,
  splitIpv4Subnets,
  computeIpv4Fragments,
  type CacheAssociativityMode,
  type IeeePrecision,
  type TocMatrixRow,
} from '../utils/csLabMath';
import { CodeVisualizerPanel } from './CodeVisualizerPanel';
import { DryRunTraceTablePanel } from './DryRunTraceTablePanel';
import { TocStudioPanel } from './TocStudioPanel';
import { DigitalLogicStudioPanel } from './DigitalLogicStudioPanel';

type CsLabTab = 'toc' | 'toc_studio' | 'digital_logic' | 'coa' | 'ieee' | 'cn' | 'code_lab';

interface CsLabViewProps {
  standaloneTraceTable?: DryRunTraceTable;
  onSaveTraceTable: (questionId: string, table: DryRunTraceTable) => void;
  onDeleteTraceTable: (questionId: string) => void;
}

const STANDALONE_TRACE_ID = 'cs_lab_sandbox';

const SUB_TABS: Array<{ id: CsLabTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'toc', label: 'TOC Matrix', icon: Grid3X3 },
  { id: 'toc_studio', label: 'TOC Studio', icon: GitBranch },
  { id: 'digital_logic', label: 'Digital Logic', icon: CircuitBoard },
  { id: 'coa', label: 'COA Cache & VM', icon: HardDrive },
  { id: 'ieee', label: 'IEEE-754 & 2s Comp', icon: Binary },
  { id: 'cn', label: 'CN CIDR & Frag', icon: Network },
  { id: 'code_lab', label: 'Code & Trace Lab', icon: Cpu },
];

const MEM_SIZE_OPTIONS: Array<{ label: string; bytes: number }> = [
  { label: '64 KB', bytes: 64 * 1024 },
  { label: '1 MB', bytes: 1024 * 1024 },
  { label: '16 MB', bytes: 16 * 1024 * 1024 },
  { label: '256 MB', bytes: 256 * 1024 * 1024 },
  { label: '1 GB', bytes: 1024 * 1024 * 1024 },
  { label: '4 GB (32-bit)', bytes: 4 * 1024 * 1024 * 1024 },
  { label: '64 GB (36-bit)', bytes: 64 * 1024 * 1024 * 1024 },
];

const CACHE_SIZE_OPTIONS: Array<{ label: string; bytes: number }> = [
  { label: '4 KB', bytes: 4 * 1024 },
  { label: '16 KB', bytes: 16 * 1024 },
  { label: '32 KB', bytes: 32 * 1024 },
  { label: '64 KB', bytes: 64 * 1024 },
  { label: '256 KB', bytes: 256 * 1024 },
  { label: '1 MB', bytes: 1024 * 1024 },
];

const BLOCK_SIZE_OPTIONS: Array<{ label: string; bytes: number }> = [
  { label: '16 B', bytes: 16 },
  { label: '32 B', bytes: 32 },
  { label: '64 B', bytes: 64 },
  { label: '128 B', bytes: 128 },
  { label: '256 B', bytes: 256 },
];

const PAGE_SIZE_OPTIONS: Array<{ label: string; bytes: number }> = [
  { label: '1 KB', bytes: 1024 },
  { label: '4 KB', bytes: 4096 },
  { label: '8 KB', bytes: 8192 },
  { label: '16 KB', bytes: 16384 },
  { label: '64 KB', bytes: 65536 },
];

export const CsLabView: React.FC<CsLabViewProps> = ({
  standaloneTraceTable,
  onSaveTraceTable,
  onDeleteTraceTable,
}) => {
  const [activeTab, setActiveTab] = useState<CsLabTab>('toc');

  // ===================== 1. TOC MATRIX QUIZZER STATE =====================
  const [tocSection, setTocSection] = useState<'closure' | 'decidability'>('closure');
  const [quizMode, setQuizMode] = useState<boolean>(false);
  const [quizFullTable, setQuizFullTable] = useState<boolean>(false);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, { picked: boolean; correct: boolean }>>({});
  const [recallStreak, setRecallStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [selectedTocNote, setSelectedTocNote] = useState<TocMatrixRow>(TOC_CLOSURE_ROWS[2]);

  const activeTocRows = tocSection === 'closure' ? TOC_CLOSURE_ROWS : TOC_DECIDABILITY_ROWS;

  const startTocQuiz = (fullTable = quizFullTable, rows = activeTocRows) => {
    const picked = pickQuizCells(rows, 10, fullTable);
    setHiddenKeys(picked);
    setQuizAnswers({});
    setActiveCellKey(picked[0] ?? null);
    setQuizMode(true);
  };

  const handleToggleTocSection = (nextSec: 'closure' | 'decidability') => {
    setTocSection(nextSec);
    const rows = nextSec === 'closure' ? TOC_CLOSURE_ROWS : TOC_DECIDABILITY_ROWS;
    setSelectedTocNote(rows[0]);
    if (quizMode) {
      startTocQuiz(quizFullTable, rows);
    }
  };

  const handleAnswerTocCell = (cellKey: string, expected: boolean, picked: boolean) => {
    const correct = picked === expected;
    setQuizAnswers((prev) => ({ ...prev, [cellKey]: { picked, correct } }));
    setActiveCellKey(null);
    if (correct) {
      setRecallStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
    } else {
      setRecallStreak(0);
    }
  };

  const quizStats = useMemo(() => {
    const answered = Object.values(quizAnswers);
    const correct = answered.filter((a) => a.correct).length;
    return { total: hiddenKeys.length, answered: answered.length, correct };
  }, [quizAnswers, hiddenKeys]);

  // ===================== 2. COA CACHE & VM STATE =====================
  const [physMemBytes, setPhysMemBytes] = useState<number>(4 * 1024 * 1024 * 1024);
  const [cacheBytes, setCacheBytes] = useState<number>(64 * 1024);
  const [blockBytes, setBlockBytes] = useState<number>(64);
  const [assocMode, setAssocMode] = useState<CacheAssociativityMode>('set_associative');
  const [kWay, setKWay] = useState<number>(4);
  const [writePolicy, setWritePolicy] = useState<'write_back' | 'write_through'>('write_back');

  const [vaBits, setVaBits] = useState<number>(32);
  const [paBits, setPaBits] = useState<number>(32);
  const [pageBytes, setPageBytes] = useState<number>(4096);
  const [pteBytes, setPteBytes] = useState<number>(4);

  const cacheResult = useMemo(
    () =>
      computeCacheBitSplit({
        physicalMemoryBytes: physMemBytes,
        cacheSizeBytes: cacheBytes,
        blockSizeBytes: blockBytes,
        associativityMode: assocMode,
        kWay,
        writePolicy,
      }),
    [physMemBytes, cacheBytes, blockBytes, assocMode, kWay, writePolicy]
  );

  const vmResult = useMemo(
    () =>
      computeVirtualMemoryPageTable({
        virtualAddressBits: vaBits,
        physicalAddressBits: paBits,
        pageSizeBytes: pageBytes,
        pteSizeBytes: pteBytes,
      }),
    [vaBits, paBits, pageBytes, pteBytes]
  );

  // ===================== 3. DIGITAL LOGIC IEEE-754 & 2'S COMP STATE =====================
  const [ieeePrecision, setIeeePrecision] = useState<IeeePrecision>(32);
  const [ieeeInputMode, setIeeeInputMode] = useState<'decimal' | 'hex'>('decimal');
  const [ieeeInput, setIeeeInput] = useState<string>('-13.625');

  const ieeeResult = useMemo(
    () =>
      ieeeInputMode === 'decimal'
        ? decimalToIeee754(ieeeInput, ieeePrecision)
        : hexToIeee754(ieeeInput, ieeePrecision),
    [ieeeInput, ieeeInputMode, ieeePrecision]
  );

  const [twosWidth, setTwosWidth] = useState<4 | 8 | 16>(8);
  const [twosA, setTwosA] = useState<number>(100);
  const [twosB, setTwosB] = useState<number>(50);
  const [twosOp, setTwosOp] = useState<'add' | 'sub'>('add');

  const twosResult = useMemo(
    () => computeTwosComplement(twosWidth, twosA, twosB, twosOp),
    [twosWidth, twosA, twosB, twosOp]
  );

  // ===================== 4. CN IPv4 CIDR & FRAGMENTATION STATE =====================
  const [cidrInput, setCidrInput] = useState<string>('192.168.10.37/26');
  const [borrowBits, setBorrowBits] = useState<number>(2);
  const [datagramSize, setDatagramSize] = useState<number>(4000);
  const [headerSize, setHeaderSize] = useState<number>(20);
  const [mtuSize, setMtuSize] = useState<number>(1500);

  const cidrResult = useMemo(() => computeIpv4Cidr(cidrInput), [cidrInput]);
  const subnetSlices = useMemo(
    () => (cidrResult.valid ? splitIpv4Subnets(cidrInput, borrowBits) : []),
    [cidrInput, borrowBits, cidrResult.valid]
  );
  const fragResult = useMemo(
    () =>
      computeIpv4Fragments({
        totalDatagramBytes: datagramSize,
        headerBytes: headerSize,
        mtuBytes: mtuSize,
      }),
    [datagramSize, headerSize, mtuSize]
  );

  return (
    <div className="space-y-5" data-testid="cs-lab-view">
      {/* Header Banner & 5 Curved Sub-Tabs */}
      <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E261A] dark:text-[#E0A92E]">
              <FlaskConical className="h-3.5 w-3.5" />
              IIT Madras GATE CSE 2027 · Interactive CS Lab
            </div>
            <h1 className="mt-1 font-display text-xl sm:text-2xl font-bold tracking-[-0.02em] text-[#1C1613] dark:text-[#F5F0E8]">
              Visualizers, Hide-and-Recall Matrices &amp; Dry-Run Sandbox
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#61554D] dark:text-[#A99B8E]">
              Interactive exam workbenches aligned strictly to the GATE CSE 2027 syllabus with built-in execution and visualizers.
            </p>
          </div>
        </div>

        {/* Sub-Tab Segmented Pills (Single-row horizontal rail on mobile) */}
        <div
          role="tablist"
          aria-label="CS Lab visualizers"
          className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar p-1.5 rounded-[22px] bg-[#EFE9DF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520]"
        >
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`cslab-tab-${tab.id}`}
                onClick={(e) => {
                  setActiveTab(tab.id);
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest',
                  });
                }}
                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors press-tactile ${
                  active
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white shadow-xs'
                    : 'text-[#61554D] dark:text-[#D8CBB8] hover:bg-[#FFFFFF]/70 dark:hover:bg-[#1C1714]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================== TAB 1: TOC CLOSURE & DECIDABILITY MATRIX QUIZZER ===================== */}
      {activeTab === 'toc' && (
        <section
          data-testid="cslab-panel-toc"
          className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 sm:p-6 shadow-warm space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Closure vs Decidability Toggle */}
            <div className="flex flex-nowrap items-center overflow-x-auto no-scrollbar p-1 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] max-w-full">
              <button
                type="button"
                onClick={() => handleToggleTocSection('closure')}
                data-testid="toc-section-closure"
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold press-tactile ${
                  tocSection === 'closure'
                    ? 'bg-[#241914] text-[#FAF5EB] dark:bg-[#E0A92E] dark:text-[#1C1613]'
                    : 'text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                Closure Properties (8)
              </button>
              <button
                type="button"
                onClick={() => handleToggleTocSection('decidability')}
                data-testid="toc-section-decidability"
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold press-tactile ${
                  tocSection === 'decidability'
                    ? 'bg-[#241914] text-[#FAF5EB] dark:bg-[#E0A92E] dark:text-[#1C1613]'
                    : 'text-[#61554D] dark:text-[#A99B8E]'
                }`}
              >
                Decidability Problems (6)
              </button>
            </div>

            {/* Hide-and-Recall Quiz Mode Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {quizMode && (
                <>
                  <span
                    data-testid="toc-quiz-score"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] font-mono text-xs font-bold text-[#8B6209] dark:text-[#E0A92E] tabular-nums"
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Score: {quizStats.correct}/{quizStats.answered} ({quizStats.total} hidden) · Streak {recallStreak} (Best {bestStreak})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextFull = !quizFullTable;
                      setQuizFullTable(nextFull);
                      startTocQuiz(nextFull);
                    }}
                    className="h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] press-tactile"
                  >
                    {quizFullTable ? 'Switch to 10 Random' : 'Hide Full Table'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startTocQuiz(quizFullTable)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#61554D] dark:text-[#D8CBB8] press-tactile"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Shuffle
                  </button>
                </>
              )}

              <button
                type="button"
                data-testid="toc-hide-recall-toggle"
                onClick={() => {
                  if (quizMode) {
                    setQuizMode(false);
                    setActiveCellKey(null);
                  } else {
                    startTocQuiz(false);
                  }
                }}
                className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-semibold press-tactile ${
                  quizMode
                    ? 'bg-[#241914] text-[#FAF5EB] dark:bg-[#E0A92E] dark:text-[#1C1613]'
                    : 'bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white'
                }`}
              >
                {quizMode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {quizMode ? 'Exit Quiz (Reveal All)' : 'Hide-and-Recall Quiz Mode'}
              </button>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-[20px] border border-[#E8E0D5] dark:border-[#2E2520]">
            <table className="w-full text-left border-collapse min-w-[660px]">
              <thead>
                <tr className="bg-[#F4EFE6] dark:bg-[#241D19] border-b border-[#E8E0D5] dark:border-[#352A24]">
                  <th className="px-4 py-3 text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    {tocSection === 'closure' ? 'Operation / Property' : 'Decision Problem'}
                  </th>
                  {TOC_LANGUAGES.map((lang) => (
                    <th
                      key={lang.id}
                      className="px-3 py-3 text-center"
                    >
                      <div className="font-display text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">
                        {lang.shortLabel}
                      </div>
                      <div className="font-mono text-[10px] font-normal text-[#61554D] dark:text-[#A99B8E]">
                        {lang.machine}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeTocRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedTocNote(row)}
                    className="border-b border-[#E8E0D5] dark:border-[#2A221D] last:border-b-0 hover:bg-[#FAF8F4] dark:hover:bg-[#241D19]/60 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                      {row.label}
                    </td>
                    {TOC_LANGUAGES.map((lang) => {
                      const expected = row.values[lang.id];
                      const cellKey = makeTocCellKey(row.id, lang.id);
                      const isHidden = quizMode && hiddenKeys.includes(cellKey);
                      const answer = quizAnswers[cellKey];
                      const isPickerOpen = isHidden && !answer && activeCellKey === cellKey;

                      return (
                        <td key={cellKey} className="px-2 py-2 text-center">
                          {isHidden && !answer ? (
                            isPickerOpen ? (
                              <div
                                data-testid={`toc-picker-${cellKey}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 p-1 rounded-full bg-[#241914] shadow-warm"
                              >
                                <button
                                  type="button"
                                  data-testid="toc-pick-yes"
                                  onClick={() => handleAnswerTocCell(cellKey, expected, true)}
                                  className="px-2.5 py-0.5 rounded-full bg-[#2E5E3E] text-white text-[11px] font-bold press-tactile"
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  data-testid="toc-pick-no"
                                  onClick={() => handleAnswerTocCell(cellKey, expected, false)}
                                  className="px-2.5 py-0.5 rounded-full bg-[#B83227] text-white text-[11px] font-bold press-tactile"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                data-testid={`toc-hidden-cell-${cellKey}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCellKey(cellKey);
                                  setSelectedTocNote(row);
                                }}
                                className="w-16 h-8 rounded-full border border-dashed border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] font-mono text-xs font-bold hover:bg-[#F9ECCB] press-tactile"
                              >
                                ?
                              </button>
                            )
                          ) : (
                            <span
                              className={`inline-flex items-center justify-center gap-1 w-16 h-8 rounded-full font-mono text-xs font-bold border ${
                                expected
                                  ? 'border-[#B8D7C3] dark:border-[#264D34] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                                  : 'border-[#E6B8B3] dark:border-[#6E2D26] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                              } ${
                                answer
                                  ? answer.correct
                                    ? 'ring-2 ring-[#2E5E3E]'
                                    : 'ring-2 ring-[#B83227]'
                                  : ''
                              }`}
                            >
                              {answer &&
                                (answer.correct ? (
                                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                                ) : (
                                  <XCircle className="h-3 w-3 shrink-0" />
                                ))}
                              {expected ? 'Yes' : 'No'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Active Theorem / GATE Trap Callout */}
          <div className="rounded-[18px] border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] px-4 py-3 flex items-start gap-2.5 text-xs text-[#6E4D08] dark:text-[#F0C869]">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#C89216] dark:text-[#E0A92E]" />
            <div>
              <span className="font-bold">{selectedTocNote.label}:</span> {selectedTocNote.gateNote}
            </div>
          </div>
        </section>
      )}

      {/* ===================== TAB 2: COA CACHE & VIRTUAL MEMORY BIT-SPLIT ===================== */}
      {activeTab === 'coa' && (
        <div data-testid="cslab-panel-coa" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Cache Memory Bit-Split Card */}
          <section className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                COA · Cache Address Breakdown
              </span>
              <h2 className="mt-0.5 font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Tag | Set Index | Block Offset Visualizer
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">Physical Memory</span>
                <select
                  value={physMemBytes}
                  onChange={(e) => setPhysMemBytes(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {MEM_SIZE_OPTIONS.map((o) => (
                    <option key={o.label} value={o.bytes}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">Cache Size</span>
                <select
                  value={cacheBytes}
                  onChange={(e) => setCacheBytes(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {CACHE_SIZE_OPTIONS.map((o) => (
                    <option key={o.label} value={o.bytes}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">Block Size</span>
                <select
                  value={blockBytes}
                  onChange={(e) => setBlockBytes(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {BLOCK_SIZE_OPTIONS.map((o) => (
                    <option key={o.label} value={o.bytes}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'direct', label: 'Direct Mapped' },
                { id: 'set_associative', label: 'k-Way Set Assoc' },
                { id: 'fully_associative', label: 'Fully Assoc' },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAssocMode(m.id)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold press-tactile ${
                    assocMode === m.id
                      ? 'border-[#6E261A] bg-[#6E261A] dark:border-[#E0A92E] dark:bg-[#9E3E2E] text-white'
                      : 'border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8]'
                  }`}
                >
                  {m.label}
                </button>
              ))}

              {assocMode === 'set_associative' && (
                <select
                  aria-label="k-way associativity"
                  value={kWay}
                  onChange={(e) => setKWay(Number(e.target.value))}
                  className="h-8 px-3 rounded-full border border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] font-mono text-xs font-bold text-[#8B6209] dark:text-[#E0A92E]"
                >
                  {[2, 4, 8, 16, 32].map((k) => (
                    <option key={k} value={k}>{k}-way</option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() =>
                  setWritePolicy((w) => (w === 'write_back' ? 'write_through' : 'write_back'))
                }
                className="ml-auto px-3 py-1.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-[11px] font-mono font-semibold text-[#61554D] dark:text-[#D8CBB8]"
              >
                {writePolicy === 'write_back' ? 'Write-Back (V+D)' : 'Write-Through (V)'}
              </button>
            </div>

            {cacheResult.valid ? (
              <div className="space-y-4 pt-1">
                {/* Curved Segmented Address Bit Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#61554D] dark:text-[#A99B8E]">
                    <span>Physical Address ({cacheResult.addressBits} bits)</span>
                    <span>MSB ← → LSB</span>
                  </div>
                  <div
                    data-testid="coa-cache-bit-bar"
                    className="flex w-full h-14 rounded-[16px] overflow-hidden border border-[#E8E0D5] dark:border-[#352A24] font-mono"
                  >
                    <div
                      style={{ flexGrow: Math.max(1, cacheResult.tagBits) }}
                      className="bg-[#6E261A] text-[#FAF8F4] flex flex-col items-center justify-center px-2 border-r border-white/20"
                    >
                      <span className="text-[10px] uppercase opacity-80">Tag</span>
                      <span className="text-sm font-bold tabular-nums">{cacheResult.tagBits}b</span>
                    </div>
                    {cacheResult.indexBits > 0 && (
                      <div
                        style={{ flexGrow: Math.max(1, cacheResult.indexBits) }}
                        className="bg-[#C89216] text-[#1C1613] flex flex-col items-center justify-center px-2 border-r border-black/10"
                      >
                        <span className="text-[10px] uppercase font-bold opacity-80">Set Index</span>
                        <span className="text-sm font-bold tabular-nums">{cacheResult.indexBits}b</span>
                      </div>
                    )}
                    <div
                      style={{ flexGrow: Math.max(1, cacheResult.offsetBits) }}
                      className="bg-[#241914] text-[#F0C869] flex flex-col items-center justify-center px-2"
                    >
                      <span className="text-[10px] uppercase opacity-80">Offset</span>
                      <span className="text-sm font-bold tabular-nums">{cacheResult.offsetBits}b</span>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                  <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                    <div className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Cache Lines / Sets</div>
                    <div className="mt-1 font-bold text-[#1C1613] dark:text-[#F5F0E8] tabular-nums">
                      {cacheResult.numCacheBlocks.toLocaleString()} lines · {cacheResult.numSets.toLocaleString()} sets
                    </div>
                  </div>
                  <div className="rounded-[16px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] p-3">
                    <div className="text-[10px] text-[#8B6209] dark:text-[#E0A92E]">Tag Directory Overhead</div>
                    <div className="mt-1 font-bold text-[#6E261A] dark:text-[#FAF5EB] tabular-nums">
                      {cacheResult.tagDirectoryBits.toLocaleString()} bits ({cacheResult.tagDirectoryKB.toFixed(2)} KB)
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[16px] bg-[#FBEAE8] dark:bg-[#3A1E1B] border border-[#E6B8B3] dark:border-[#6E2D26] px-4 py-3 text-xs text-[#B83227] dark:text-[#F08A80]">
                {cacheResult.error}
              </div>
            )}
          </section>

          {/* Virtual Memory Multi-Level Page Table Card */}
          <section className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                OS / COA · Virtual Memory &amp; Multi-Level Paging
              </span>
              <h2 className="mt-0.5 font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Page Table Sizing &amp; Level Split
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">VA Bits</span>
                <select
                  value={vaBits}
                  onChange={(e) => setVaBits(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {[24, 32, 36, 40, 48].map((b) => (
                    <option key={b} value={b}>{b}-bit</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">PA Bits</span>
                <select
                  value={paBits}
                  onChange={(e) => setPaBits(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {[24, 28, 32, 36, 40].map((b) => (
                    <option key={b} value={b}>{b}-bit</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">Page Size</span>
                <select
                  value={pageBytes}
                  onChange={(e) => setPageBytes(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {PAGE_SIZE_OPTIONS.map((p) => (
                    <option key={p.label} value={p.bytes}>{p.label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">PTE Size</span>
                <select
                  value={pteBytes}
                  onChange={(e) => setPteBytes(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  {[2, 4, 8].map((sz) => (
                    <option key={sz} value={sz}>{sz} B</option>
                  ))}
                </select>
              </label>
            </div>

            {vmResult.valid ? (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#61554D] dark:text-[#A99B8E]">
                    <span>Virtual Address ({vmResult.vaBits}b) · {vmResult.levelsRequired}-Level Paging</span>
                    <span>VPN {vmResult.vpnBits}b + Offset {vmResult.pageOffsetBits}b</span>
                  </div>
                  <div className="flex w-full h-14 rounded-[16px] overflow-hidden border border-[#E8E0D5] dark:border-[#352A24] font-mono">
                    {vmResult.levelBitSplits.map((lvl, idx) => (
                      <div
                        key={lvl.label}
                        style={{ flexGrow: Math.max(1, lvl.bits) }}
                        className={`flex flex-col items-center justify-center px-1.5 border-r border-white/20 ${
                          idx % 2 === 0
                            ? 'bg-[#6E261A] text-[#FAF8F4]'
                            : 'bg-[#8F3A28] text-[#FAF8F4]'
                        }`}
                      >
                        <span className="text-[10px] opacity-80">{lvl.label}</span>
                        <span className="text-sm font-bold tabular-nums">{lvl.bits}b</span>
                      </div>
                    ))}
                    <div
                      style={{ flexGrow: Math.max(1, vmResult.pageOffsetBits) }}
                      className="bg-[#2E5E3E] text-[#FAF8F4] flex flex-col items-center justify-center px-2"
                    >
                      <span className="text-[10px] opacity-80">Offset</span>
                      <span className="text-sm font-bold tabular-nums">{vmResult.pageOffsetBits}b</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                  <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                    <div className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">1-Level Page Table</div>
                    <div className="mt-1 font-bold text-[#1C1613] dark:text-[#F5F0E8] tabular-nums">
                      {vmResult.singleLevelPageTableMB >= 1024
                        ? `${(vmResult.singleLevelPageTableMB / 1024).toFixed(2)} GB`
                        : `${vmResult.singleLevelPageTableMB.toFixed(2)} MB`}
                    </div>
                  </div>
                  <div className="rounded-[16px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] p-3">
                    <div className="text-[10px] text-[#8B6209] dark:text-[#E0A92E]">Entries/Page &amp; Outer PT</div>
                    <div className="mt-1 font-bold text-[#6E261A] dark:text-[#FAF5EB] tabular-nums">
                      {vmResult.entriesPerPage} PTEs · {(vmResult.outerPageTableBytes / 1024).toFixed(2)} KB
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[16px] bg-[#FBEAE8] dark:bg-[#3A1E1B] px-4 py-3 text-xs text-[#B83227]">
                {vmResult.error}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================== TAB 3: DIGITAL LOGIC IEEE-754 & 2'S COMPLEMENT ===================== */}
      {activeTab === 'ieee' && (
        <div data-testid="cslab-panel-ieee" className="space-y-5">
          {/* IEEE-754 Card */}
          <section className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                  Digital Logic · IEEE-754 Floating Point
                </span>
                <h2 className="mt-0.5 font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Sign · Biased Exponent · Normalized Mantissa Bit Strip
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex p-0.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19]">
                  {([32, 16] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setIeeePrecision(p)}
                      className={`px-3 py-1 rounded-full font-mono text-xs font-semibold ${
                        ieeePrecision === p
                          ? 'bg-[#6E261A] text-white dark:bg-[#9E3E2E]'
                          : 'text-[#61554D] dark:text-[#A99B8E]'
                      }`}
                    >
                      {p}-bit ({p === 32 ? 'Single' : 'Half'})
                    </button>
                  ))}
                </div>

                <div className="inline-flex p-0.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19]">
                  {(['decimal', 'hex'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setIeeeInputMode(mode);
                        setIeeeInput(mode === 'decimal' ? '-13.625' : ieeePrecision === 32 ? 'C15A0000' : 'CA90');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                        ieeeInputMode === mode
                          ? 'bg-[#241914] text-[#FAF5EB] dark:bg-[#E0A92E] dark:text-[#1C1613]'
                          : 'text-[#61554D] dark:text-[#A99B8E]'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={ieeeInput}
                onChange={(e) => setIeeeInput(e.target.value)}
                data-testid="ieee-input"
                placeholder={ieeeInputMode === 'decimal' ? 'e.g. -13.625' : 'e.g. C15A0000'}
                className="h-10 w-56 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '-13.625', mode: 'decimal' as const, val: '-13.625' },
                  { label: '0.15625', mode: 'decimal' as const, val: '0.15625' },
                  { label: 'Subnormal', mode: 'hex' as const, val: ieeePrecision === 32 ? '00000001' : '0001' },
                  { label: '-0', mode: 'decimal' as const, val: '-0' },
                  { label: '+Infinity', mode: 'decimal' as const, val: 'Infinity' },
                  { label: 'NaN', mode: 'decimal' as const, val: 'NaN' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setIeeeInputMode(preset.mode);
                      setIeeeInput(preset.val);
                    }}
                    className="px-2.5 py-1 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] font-mono text-[11px] font-semibold text-[#61554D] dark:text-[#D8CBB8] press-tactile"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {ieeeResult.valid ? (
              <div className="space-y-4">
                {/* Interactive Color-Coded Bit Split Strip */}
                <div className="flex flex-wrap gap-2 font-mono">
                  <div className="rounded-[16px] bg-[#6E261A] text-white px-3.5 py-2.5 flex flex-col">
                    <span className="text-[10px] uppercase opacity-80">Sign (1b)</span>
                    <span data-testid="ieee-sign-bit" className="text-base font-bold tracking-widest mt-0.5">
                      {ieeeResult.signBit}
                    </span>
                  </div>

                  <div className="rounded-[16px] bg-[#C89216] text-[#1C1613] px-3.5 py-2.5 flex flex-col">
                    <span className="text-[10px] uppercase font-bold opacity-85">
                      Exponent ({ieeeResult.exponentBits.length}b · Bias {ieeeResult.bias})
                    </span>
                    <span data-testid="ieee-exp-bits" className="text-base font-bold tracking-widest mt-0.5">
                      {ieeeResult.exponentBits}
                    </span>
                  </div>

                  <div className="flex-1 min-w-[220px] rounded-[16px] bg-[#241914] text-[#FAF5EB] px-3.5 py-2.5 flex flex-col">
                    <span className="text-[10px] uppercase text-[#E0A92E]">
                      Mantissa / Fraction ({ieeeResult.mantissaBits.length}b)
                    </span>
                    <span className="text-base font-bold tracking-wider mt-0.5 break-all">
                      {ieeeResult.mantissaBits}
                    </span>
                  </div>
                </div>

                {/* Formula & Hex Readout */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-xs">
                  <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                    <div className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Hex Representation</div>
                    <div data-testid="ieee-hex-out" className="mt-1 text-sm font-bold text-[#6E261A] dark:text-[#E0A92E]">
                      {ieeeResult.hex}
                    </div>
                  </div>
                  <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                    <div className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Classification &amp; Value</div>
                    <div className="mt-1 text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] truncate">
                      {ieeeResult.classification} · {ieeeResult.reconstructedValue}
                    </div>
                  </div>
                  <div className="rounded-[16px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] p-3">
                    <div className="text-[10px] text-[#8B6209] dark:text-[#E0A92E]">Exact GATE Formula</div>
                    <div className="mt-1 text-[11px] font-bold text-[#1C1613] dark:text-[#FAF5EB] break-words">
                      {ieeeResult.formulaString}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[16px] bg-[#FBEAE8] dark:bg-[#3A1E1B] px-4 py-3 text-xs text-[#B83227]">
                {ieeeResult.error}
              </div>
            )}
          </section>

          {/* 2's Complement Signed ALU & Overflow Flags */}
          <section className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                  Digital Logic · 2&apos;s Complement Arithmetic &amp; ALU Flags
                </span>
                <h2 className="mt-0.5 font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Signed Overflow (V = C_in ⊕ C_out), Carry (C), Sign (N), Zero (Z)
                </h2>
              </div>

              <div className="inline-flex p-0.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19]">
                {([4, 8, 16] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setTwosWidth(w)}
                    className={`px-3 py-1 rounded-full font-mono text-xs font-semibold ${
                      twosWidth === w
                        ? 'bg-[#6E261A] text-white dark:bg-[#9E3E2E]'
                        : 'text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {w}-bit
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-mono">
                <span className="font-bold text-[#61554D] dark:text-[#A99B8E]">A =</span>
                <input
                  type="number"
                  value={twosA}
                  onChange={(e) => setTwosA(Number(e.target.value) || 0)}
                  className="h-9 w-24 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </label>

              <div className="inline-flex p-0.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19]">
                {(['add', 'sub'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setTwosOp(o)}
                    className={`px-3 py-1 rounded-full font-mono text-xs font-bold ${
                      twosOp === o
                        ? 'bg-[#241914] text-[#FAF5EB] dark:bg-[#E0A92E] dark:text-[#1C1613]'
                        : 'text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {o === 'add' ? 'A + B' : 'A − B'}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs font-mono">
                <span className="font-bold text-[#61554D] dark:text-[#A99B8E]">B =</span>
                <input
                  type="number"
                  value={twosB}
                  onChange={(e) => setTwosB(Number(e.target.value) || 0)}
                  className="h-9 w-24 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </label>

              <span className="font-mono text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                Range: [{twosResult.minSigned}, {twosResult.maxSigned}]
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-7 rounded-[18px] bg-[#1E1815] text-[#F5EFE6] p-4 font-mono text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#C8B9A6]">A ({twosResult.aClamped}):</span>
                  <span className="tracking-widest font-bold">{twosResult.aBinary}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#C8B9A6]">
                    {twosOp === 'sub' ? `−B (2s comp of ${twosResult.bClamped}):` : `B (${twosResult.bClamped}):`}
                  </span>
                  <span className="tracking-widest font-bold">{twosResult.effectiveBBinary}</span>
                </div>
                <div className="border-t border-[#3E322B] pt-1.5 flex justify-between text-[#E0A92E]">
                  <span>Result (Signed {twosResult.signedResult}):</span>
                  <span className="tracking-widest font-bold">{twosResult.resultBinary}</span>
                </div>
                <div className="text-[10px] text-[#A99B8E] pt-1">
                  True Math = {twosResult.trueMathResult} · C_in_MSB = {twosResult.carryInMsb} · C_out_MSB = {twosResult.carryOutMsb}
                </div>
              </div>

              <div className="md:col-span-5 grid grid-cols-2 gap-2">
                {([
                  { key: 'V', label: 'Overflow (V)', active: twosResult.flags.V, danger: true },
                  { key: 'C', label: 'Carry (C)', active: twosResult.flags.C, danger: false },
                  { key: 'N', label: 'Negative (N)', active: twosResult.flags.N, danger: false },
                  { key: 'Z', label: 'Zero (Z)', active: twosResult.flags.Z, danger: false },
                ] as const).map((fl) => (
                  <div
                    key={fl.key}
                    className={`rounded-[16px] border p-3 font-mono text-center ${
                      fl.active
                        ? fl.danger
                          ? 'border-[#B83227] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                          : 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]'
                        : 'border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    <div className="text-[10px] font-semibold">{fl.label}</div>
                    <div className="mt-0.5 text-base font-bold">{fl.active ? '1 (SET)' : '0'}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===================== TAB 4: CN IPv4 CIDR, SUBNETTING & FRAGMENTATION ===================== */}
      {activeTab === 'cn' && (
        <div data-testid="cslab-panel-cn" className="space-y-5">
          {/* CIDR Calculator & Subnet Splitter */}
          <section className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                  Computer Networks (GATE 2027 Syllabus Only)
                </span>
                <h2 className="mt-0.5 font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  IPv4 CIDR Calculator &amp; Subnet Split Table
                </h2>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {['192.168.10.37/26', '10.20.30.40/22', '172.16.5.130/25', '200.10.20.0/24'].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setCidrInput(ex)}
                    className="px-2.5 py-1 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] font-mono text-[11px] font-semibold text-[#61554D] dark:text-[#D8CBB8] press-tactile"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={cidrInput}
                onChange={(e) => setCidrInput(e.target.value)}
                data-testid="cn-cidr-input"
                placeholder="192.168.10.37/26"
                className="h-10 w-56 px-4 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]"
              />
              <label className="flex items-center gap-2 text-xs text-[#61554D] dark:text-[#A99B8E]">
                <span>Subnet Split:</span>
                <select
                  value={borrowBits}
                  onChange={(e) => setBorrowBits(Number(e.target.value))}
                  className="h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8]"
                >
                  <option value={1}>+1 bit (2 subnets)</option>
                  <option value={2}>+2 bits (4 subnets)</option>
                  <option value={3}>+3 bits (8 subnets)</option>
                </select>
              </label>
            </div>

            {cidrResult.valid ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 font-mono text-xs">
                  <div className="rounded-[16px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] p-3">
                    <div className="text-[10px] text-[#8B6209] dark:text-[#E0A92E]">Network ID</div>
                    <div data-testid="cn-network-id" className="mt-1 text-sm font-bold text-[#6E261A] dark:text-[#FAF5EB]">
                      {cidrResult.networkId}/{cidrResult.prefix}
                    </div>
                  </div>
                  <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                    <div className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Broadcast ID</div>
                    <div data-testid="cn-broadcast-id" className="mt-1 text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                      {cidrResult.broadcastId}
                    </div>
                  </div>
                  <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                    <div className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Usable Host Range</div>
                    <div className="mt-1 text-xs font-bold text-[#2E5E3E] dark:text-[#7BB88F]">
                      {cidrResult.firstUsableHost} – {cidrResult.lastUsableHost}
                    </div>
                  </div>
                  <div className="rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                    <div className="text-[10px] text-[#61554D] dark:text-[#A99B8E]">Usable Hosts / Mask</div>
                    <div className="mt-1 text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                      {cidrResult.usableHosts.toLocaleString()} · {cidrResult.maskDotted}
                    </div>
                  </div>
                </div>

                <div className="rounded-[16px] bg-[#1E1815] text-[#F5EFE6] px-4 py-3 font-mono text-[11px] space-y-1 overflow-x-auto">
                  <div>
                    <span className="text-[#A99B8E] inline-block w-16">IP Bin:</span>
                    <span className="tracking-wider">{cidrResult.ipBinary}</span>
                  </div>
                  <div>
                    <span className="text-[#E0A92E] inline-block w-16">Mask:</span>
                    <span className="tracking-wider text-[#E0A92E]">{cidrResult.maskBinary}</span>
                  </div>
                </div>

                {subnetSlices.length > 0 && (
                  <div className="overflow-x-auto rounded-[16px] border border-[#E8E0D5] dark:border-[#2E2520]">
                    <table className="w-full text-left border-collapse font-mono text-xs min-w-[540px]">
                      <thead>
                        <tr className="bg-[#F4EFE6] dark:bg-[#241D19] border-b border-[#E8E0D5] dark:border-[#352A24] text-[11px] text-[#6E261A] dark:text-[#E0A92E]">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Subnet CIDR</th>
                          <th className="px-3 py-2">Usable Host Range</th>
                          <th className="px-3 py-2">Broadcast</th>
                          <th className="px-3 py-2 text-right">Hosts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subnetSlices.map((s) => (
                          <tr
                            key={s.cidr}
                            className="border-b border-[#E8E0D5]/70 dark:border-[#2A221D] last:border-b-0"
                          >
                            <td className="px-3 py-2 text-[#61554D] dark:text-[#A99B8E]">S{s.index}</td>
                            <td className="px-3 py-2 font-bold text-[#1C1613] dark:text-[#F5F0E8]">{s.cidr}</td>
                            <td className="px-3 py-2 text-[#2E5E3E] dark:text-[#7BB88F]">
                              {s.firstHost} – {s.lastHost}
                            </td>
                            <td className="px-3 py-2 text-[#61554D] dark:text-[#D8CBB8]">{s.broadcastId}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.usableHosts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[16px] bg-[#FBEAE8] dark:bg-[#3A1E1B] px-4 py-3 text-xs text-[#B83227]">
                {cidrResult.error}
              </div>
            )}
          </section>

          {/* IPv4 Fragmentation Calculator */}
          <section className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                Computer Networks · IPv4 Fragmentation Engine
              </span>
              <h2 className="mt-0.5 font-display text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                Exact 8-Byte Aligned Fragments, MF Bit &amp; Offset (÷8)
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">
                  Total Datagram Size (Bytes)
                </span>
                <input
                  type="number"
                  min={20}
                  max={65535}
                  value={datagramSize}
                  onChange={(e) => setDatagramSize(Number(e.target.value) || 20)}
                  data-testid="frag-datagram-input"
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">
                  IPv4 Header Length (Bytes)
                </span>
                <input
                  type="number"
                  step={4}
                  min={20}
                  max={60}
                  value={headerSize}
                  onChange={(e) => setHeaderSize(Number(e.target.value) || 20)}
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-semibold text-[#61554D] dark:text-[#A99B8E]">
                  Link MTU (Bytes)
                </span>
                <input
                  type="number"
                  min={28}
                  max={65535}
                  value={mtuSize}
                  onChange={(e) => setMtuSize(Number(e.target.value) || 1500)}
                  data-testid="frag-mtu-input"
                  className="w-full h-9 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#130F0D] font-mono text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                />
              </label>
            </div>

            {fragResult.valid ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[#61554D] dark:text-[#D8CBB8]">
                  <span>Original Payload: <strong>{fragResult.originalPayloadBytes} B</strong></span>
                  <span>·</span>
                  <span>Max Payload/Frag: <strong>{fragResult.maxPayloadPerFragment} B</strong></span>
                  <span>·</span>
                  <span>Fragments: <strong className="text-[#6E261A] dark:text-[#E0A92E]">{fragResult.fragments.length}</strong></span>
                  <span>·</span>
                  <span>Total Wire Bytes: <strong>{fragResult.totalTransmittedBytes} B</strong></span>
                </div>

                <div className="overflow-x-auto rounded-[16px] border border-[#E8E0D5] dark:border-[#2E2520]">
                  <table
                    data-testid="ipv4-fragment-table"
                    className="w-full text-left border-collapse font-mono text-xs min-w-[520px]"
                  >
                    <thead>
                      <tr className="bg-[#F4EFE6] dark:bg-[#241D19] border-b border-[#E8E0D5] dark:border-[#352A24] text-[11px] text-[#6E261A] dark:text-[#E0A92E]">
                        <th className="px-3 py-2">Fragment #</th>
                        <th className="px-3 py-2">Payload Size</th>
                        <th className="px-3 py-2">Total Length</th>
                        <th className="px-3 py-2">MF Bit</th>
                        <th className="px-3 py-2">Fragment Offset (÷8)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fragResult.fragments.map((f) => (
                        <tr
                          key={f.fragmentNumber}
                          className="border-b border-[#E8E0D5]/70 dark:border-[#2A221D] last:border-b-0"
                        >
                          <td className="px-3 py-2 font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                            F{f.fragmentNumber}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{f.payloadBytes} B</td>
                          <td className="px-3 py-2 tabular-nums">{f.totalLengthBytes} B</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                f.mfBit === 1
                                  ? 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]'
                                  : 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                              }`}
                            >
                              MF = {f.mfBit}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-bold text-[#6E261A] dark:text-[#E0A92E] tabular-nums">
                            {f.fragmentOffsetField}{' '}
                            <span className="font-normal text-[#61554D] dark:text-[#A99B8E]">
                              ({f.offsetBytes} B)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-[16px] bg-[#FBEAE8] dark:bg-[#3A1E1B] px-4 py-3 text-xs text-[#B83227]">
                {fragResult.error}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================== TAB 5: STANDALONE CODE & TRACE LAB ===================== */}
      {activeTab === 'code_lab' && (
        <div
          data-testid="cslab-panel-code-lab"
          className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start"
        >
          <div className="xl:col-span-7">
            <CodeVisualizerPanel
              questionId={STANDALONE_TRACE_ID}
              onCopyTraceToTable={(table) => onSaveTraceTable(STANDALONE_TRACE_ID, table)}
            />
          </div>
          <div className="xl:col-span-5">
            <DryRunTraceTablePanel
              questionId={STANDALONE_TRACE_ID}
              savedTable={standaloneTraceTable}
              onSaveTable={onSaveTraceTable}
              onDeleteTable={onDeleteTraceTable}
            />
          </div>
        </div>
      )}

      {/* ===================== TAB 6: TOC DESIGN STUDIO ===================== */}
      {activeTab === 'toc_studio' && <TocStudioPanel />}

      {/* ===================== TAB 7: DIGITAL LOGIC DESIGN STUDIO ===================== */}
      {activeTab === 'digital_logic' && <DigitalLogicStudioPanel />}
    </div>
  );
};
