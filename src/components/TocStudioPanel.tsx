import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Plus,
  Trash2,
  ArrowRight,
  GitBranch,
  Minimize2,
  Layers,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wand2,
  CircleDot,
  Info,
} from 'lucide-react';
import {
  EPSILON,
  GATE_AUTOMATON_PRESETS,
  GATE_PDA_PRESETS,
  GATE_LANGUAGE_LIBRARY,
  extractAlphabet,
  isAutomatonNfa,
  simulateAutomatonTrace,
  inspectAutomatonLanguage,
  convertNfaToDfa,
  minimizeDfa,
  buildAutomatonFromRegex,
  detectPdaDeterminism,
  simulatePda,
  formatPushSymbols,
  parsePushString,
  normalizeSymbol,
  type AutomatonModel,
  type SubsetConstructionResult,
  type DfaMinimizationResult,
  type PdaModel,
  type PdaAcceptanceMode,
  type ChomskyClass,
  type GateLanguageEntry,
} from '../utils/tocStudioEngine';

type TocStudioMode = 'automata' | 'pda' | 'classifier';

interface ClassifiedAiLanguage {
  expression: string;
  chomskyClass: string;
  isDcfl: boolean;
  complementClass: string;
  myhillNerode: string;
  pumpingSketch: string;
  automatonOrGrammarHint: string;
  gateTrap: string;
}

const CHOMSKY_FILTERS: Array<'All' | ChomskyClass> = [
  'All',
  'Regular',
  'DCFL',
  'CFL (Non-DCFL)',
  'CSL',
  'RE (Non-Recursive)',
  'Not RE',
];

function getChomskyBadgeClass(cls: string): string {
  if (cls === 'Regular') {
    return 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] border-[#2E5E3E]/25';
  }
  if (cls === 'DCFL') {
    return 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A] dark:border-[#6B5016]';
  }
  if (cls.startsWith('CFL')) {
    return 'bg-[#F4EFE6] dark:bg-[#2C221D] text-[#6E261A] dark:text-[#E8A598] border-[#D8CBB8] dark:border-[#4A3A31]';
  }
  if (cls === 'CSL' || cls === 'Recursive') {
    return 'bg-[#EFE8DC] dark:bg-[#241914] text-[#571C13] dark:text-[#E0A92E] border-[#D8CBB8] dark:border-[#3A2D25]';
  }
  return 'bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F0948B] border-[#B83227]/30';
}

export const TocStudioPanel: React.FC = () => {
  const [mode, setMode] = useState<TocStudioMode>('automata');

  // ============================================================================
  // MODE 1A — INTERACTIVE DFA / ε-NFA DESIGNER & SIMULATOR
  // ============================================================================
  const [automaton, setAutomaton] = useState<AutomatonModel>(() => GATE_AUTOMATON_PRESETS[0]);
  const [selectedStateId, setSelectedStateId] = useState<string | null>('q0');
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectSymbol, setConnectSymbol] = useState<string>('0');
  const [draggingStateId, setDraggingStateId] = useState<string | null>(null);
  const [didDragState, setDidDragState] = useState<boolean>(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Manual edge form
  const [showEdgeForm, setShowEdgeForm] = useState<boolean>(false);
  const [edgeFrom, setEdgeFrom] = useState<string>('q0');
  const [edgeTo, setEdgeTo] = useState<string>('q1');
  const [edgeSymInput, setEdgeSymInput] = useState<string>('0');

  // Regex constructor
  const [regexInput, setRegexInput] = useState<string>('(a+b)*ab');
  const [regexError, setRegexError] = useState<string | null>(null);

  // Simulation
  const [testString, setTestString] = useState<string>('110');
  const [simStepIdx, setSimStepIdx] = useState<number>(0);
  const [isPlayingFa, setIsPlayingFa] = useState<boolean>(false);

  // Converter outputs
  const [subsetResult, setSubsetResult] = useState<SubsetConstructionResult | null>(null);
  const [minResult, setMinResult] = useState<DfaMinimizationResult | null>(null);

  const faTrace = useMemo(
    () => simulateAutomatonTrace(automaton, testString),
    [automaton, testString]
  );

  const clampedStepIdx = Math.min(simStepIdx, Math.max(0, faTrace.steps.length - 1));
  const currentFaStep = faTrace.steps[clampedStepIdx] ?? faTrace.steps[0];

  const batchLanguage = useMemo(() => inspectAutomatonLanguage(automaton, 4), [automaton]);
  const isNfa = useMemo(() => isAutomatonNfa(automaton), [automaton]);
  const alphabetList = useMemo(() => extractAlphabet(automaton), [automaton]);

  useEffect(() => {
    if (!isPlayingFa) return;
    if (clampedStepIdx >= faTrace.steps.length - 1) {
      setIsPlayingFa(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSimStepIdx((prev) => Math.min(faTrace.steps.length - 1, prev + 1));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [isPlayingFa, clampedStepIdx, faTrace.steps.length]);

  const loadAutomatonPreset = (preset: AutomatonModel) => {
    setAutomaton(preset);
    setSelectedStateId(preset.states[0]?.id ?? null);
    setConnectFromId(null);
    setSubsetResult(null);
    setMinResult(null);
    setSimStepIdx(0);
    setIsPlayingFa(false);
    if (preset.id === 'preset-div3') setTestString('110');
    else if (preset.id === 'preset-substr-101') setTestString('01011');
    else if (preset.id === 'preset-even-a-odd-b') setTestString('aabbab');
    else if (preset.id === 'preset-ends-ab-nfa') setTestString('baab');
    else if (preset.id === 'preset-enfa-abb') setTestString('aabb');
  };

  const getSvgCoords = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 320, y: 160 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 640;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * 320;
    return {
      x: Math.round(Math.max(36, Math.min(604, x))),
      y: Math.round(Math.max(38, Math.min(282, y))),
    };
  };

  const addTransitionDirect = (fromId: string, toId: string, rawSymbols: string) => {
    const parsed = rawSymbols
      .split(/[\s,]+/)
      .map(normalizeSymbol)
      .filter(Boolean);
    if (parsed.length === 0) return;

    setAutomaton((prev) => {
      const existingIdx = prev.transitions.findIndex((t) => t.from === fromId && t.to === toId);
      const nextTrans = [...prev.transitions];
      if (existingIdx >= 0) {
        const merged = Array.from(new Set([...nextTrans[existingIdx].symbols, ...parsed]));
        nextTrans[existingIdx] = { ...nextTrans[existingIdx], symbols: merged };
      } else {
        nextTrans.push({
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: fromId,
          to: toId,
          symbols: parsed,
        });
      }
      const nextAlpha = Array.from(
        new Set([...prev.alphabet, ...parsed.filter((s) => s !== EPSILON)])
      ).sort();
      return { ...prev, alphabet: nextAlpha, transitions: nextTrans };
    });
    setSubsetResult(null);
    setMinResult(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (didDragState) {
      setDidDragState(false);
      return;
    }
    if ((e.target as Element).closest('[data-state-node="true"], [data-edge-label="true"]')) {
      return;
    }
    if (connectFromId) {
      setConnectFromId(null);
      return;
    }
    const { x, y } = getSvgCoords(e.clientX, e.clientY);
    setAutomaton((prev) => {
      if (prev.states.length >= 14) return prev;
      let idx = prev.states.length;
      while (prev.states.some((s) => s.label === `q${idx}` || s.id === `q${idx}`)) {
        idx += 1;
      }
      const newId = `q${idx}`;
      const isFirst = prev.states.length === 0;
      setSelectedStateId(newId);
      return {
        ...prev,
        states: [
          ...prev.states,
          { id: newId, label: newId, x, y, isStart: isFirst, isAccept: false },
        ],
      };
    });
    setSubsetResult(null);
    setMinResult(null);
  };

  const handleStatePointerDown = (e: React.PointerEvent, stateId: string) => {
    e.stopPropagation();
    if (connectFromId) {
      addTransitionDirect(connectFromId, stateId, connectSymbol || '0');
      setConnectFromId(null);
      return;
    }
    setSelectedStateId(stateId);
    setDraggingStateId(stateId);
    setDidDragState(false);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingStateId) return;
    const { x, y } = getSvgCoords(e.clientX, e.clientY);
    setDidDragState(true);
    setAutomaton((prev) => ({
      ...prev,
      states: prev.states.map((s) => (s.id === draggingStateId ? { ...s, x, y } : s)),
    }));
  };

  const handleSvgPointerUp = () => {
    setDraggingStateId(null);
  };

  const toggleAcceptState = (stateId: string) => {
    setAutomaton((prev) => ({
      ...prev,
      states: prev.states.map((s) => (s.id === stateId ? { ...s, isAccept: !s.isAccept } : s)),
    }));
    setSubsetResult(null);
    setMinResult(null);
  };

  const setStartState = (stateId: string) => {
    setAutomaton((prev) => ({
      ...prev,
      states: prev.states.map((s) => ({ ...s, isStart: s.id === stateId })),
    }));
    setSimStepIdx(0);
    setSubsetResult(null);
    setMinResult(null);
  };

  const deleteState = (stateId: string) => {
    setAutomaton((prev) => {
      const nextStates = prev.states.filter((s) => s.id !== stateId);
      if (nextStates.length > 0 && !nextStates.some((s) => s.isStart)) {
        nextStates[0] = { ...nextStates[0], isStart: true };
      }
      return {
        ...prev,
        states: nextStates,
        transitions: prev.transitions.filter((t) => t.from !== stateId && t.to !== stateId),
      };
    });
    if (selectedStateId === stateId) setSelectedStateId(null);
    setSubsetResult(null);
    setMinResult(null);
  };

  const deleteTransition = (trId: string) => {
    setAutomaton((prev) => ({
      ...prev,
      transitions: prev.transitions.filter((t) => t.id !== trId),
    }));
    setSubsetResult(null);
    setMinResult(null);
  };

  const handleConvertToDfa = () => {
    const res = convertNfaToDfa(automaton);
    setSubsetResult(res);
    setMinResult(null);
    setAutomaton(res.dfa);
    setSelectedStateId(res.dfa.states[0]?.id ?? null);
    setSimStepIdx(0);
    setIsPlayingFa(false);
  };

  const handleMinimizeDfa = () => {
    const res = minimizeDfa(automaton);
    setMinResult(res);
    setAutomaton(res.minimized);
    setSelectedStateId(res.minimized.states[0]?.id ?? null);
    setSimStepIdx(0);
    setIsPlayingFa(false);
  };

  const handleBuildRegex = (minimizeToDfa: boolean) => {
    const res = buildAutomatonFromRegex(regexInput, { minimizeToDfa });
    if (!res.ok) {
      setRegexError(res.error);
      return;
    }
    setRegexError(null);
    setAutomaton(res.model);
    setSelectedStateId(res.model.states[0]?.id ?? null);
    setSubsetResult(null);
    setMinResult(null);
    setSimStepIdx(0);
    setIsPlayingFa(false);
  };

  // ============================================================================
  // MODE 1B — INTERACTIVE PDA DESIGNER & LIVE STACK VISUALIZER
  // ============================================================================
  const [pda, setPda] = useState<PdaModel>(() => GATE_PDA_PRESETS[0]);
  const [pdaInput, setPdaInput] = useState<string>(GATE_PDA_PRESETS[0].defaultSampleInput);
  const [pdaMode, setPdaMode] = useState<PdaAcceptanceMode>('final_state');
  const [pdaStepIdx, setPdaStepIdx] = useState<number>(0);
  const [isPlayingPda, setIsPlayingPda] = useState<boolean>(false);

  // Add rule form
  const [newRuleFrom, setNewRuleFrom] = useState<string>('q0');
  const [newRuleInput, setNewRuleInput] = useState<string>('a');
  const [newRuleTop, setNewRuleTop] = useState<string>('Z0');
  const [newRuleTo, setNewRuleTo] = useState<string>('q0');
  const [newRulePush, setNewRulePush] = useState<string>('AZ0');

  const pdaDeterminism = useMemo(() => detectPdaDeterminism(pda), [pda]);
  const pdaSim = useMemo(() => simulatePda(pda, pdaInput, pdaMode), [pda, pdaInput, pdaMode]);
  const clampedPdaStep = Math.min(pdaStepIdx, Math.max(0, pdaSim.steps.length - 1));
  const activePdaSnap = pdaSim.steps[clampedPdaStep] ?? pdaSim.steps[0];

  useEffect(() => {
    if (!isPlayingPda) return;
    if (clampedPdaStep >= pdaSim.steps.length - 1) {
      setIsPlayingPda(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPdaStepIdx((prev) => Math.min(pdaSim.steps.length - 1, prev + 1));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [isPlayingPda, clampedPdaStep, pdaSim.steps.length]);

  const loadPdaPreset = (preset: PdaModel) => {
    setPda(preset);
    setPdaInput(preset.defaultSampleInput);
    setPdaStepIdx(0);
    setIsPlayingPda(false);
    setNewRuleFrom(preset.states[0]?.id ?? 'q0');
    setNewRuleTo(preset.states[0]?.id ?? 'q0');
  };

  const handleAddPdaRule = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = normalizeSymbol(newRuleInput || EPSILON);
    const cleanTop = newRuleTop.trim() || 'Z0';
    const pushArr = parsePushString(newRulePush);
    setPda((prev) => ({
      ...prev,
      transitions: [
        ...prev.transitions,
        {
          id: `pr-${Date.now()}`,
          from: newRuleFrom,
          input: cleanInput,
          stackTop: cleanTop,
          to: newRuleTo,
          push: pushArr,
        },
      ],
    }));
    setPdaStepIdx(0);
  };

  const handleDeletePdaRule = (ruleId: string) => {
    setPda((prev) => ({
      ...prev,
      transitions: prev.transitions.filter((r) => r.id !== ruleId),
    }));
    setPdaStepIdx(0);
  };

  // ============================================================================
  // MODE 1C — LANGUAGE CLASSIFIER (28 GATE LANGUAGES + FREE AI)
  // ============================================================================
  const [langSearch, setLangSearch] = useState<string>('');
  const [chomskyFilter, setChomskyFilter] = useState<'All' | ChomskyClass>('All');
  const [selectedLang, setSelectedLang] = useState<GateLanguageEntry>(GATE_LANGUAGE_LIBRARY[3]);
  const [customLangInput, setCustomLangInput] = useState<string>('L = { a^n b^m c^n | n, m >= 1 }');
  const [aiClassifyLoading, setAiClassifyLoading] = useState<boolean>(false);
  const [aiClassifyError, setAiClassifyError] = useState<string | null>(null);
  const [aiClassifyResult, setAiClassifyResult] = useState<ClassifiedAiLanguage | null>(null);

  const filteredLanguages = useMemo(() => {
    const q = langSearch.trim().toLowerCase();
    return GATE_LANGUAGE_LIBRARY.filter((entry) => {
      if (chomskyFilter !== 'All' && entry.chomskyClass !== chomskyFilter) return false;
      if (!q) return true;
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.expression.toLowerCase().includes(q) ||
        entry.chomskyClass.toLowerCase().includes(q) ||
        entry.gateTrap.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [langSearch, chomskyFilter]);

  const handleAnalyzeCustomLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    const expr = customLangInput.trim();
    if (expr.length < 3) return;
    setAiClassifyLoading(true);
    setAiClassifyError(null);
    try {
      const resp = await fetch('/api/classify-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: expr }),
      });
      const data = await resp.json();
      if (data?.ok && data?.result) {
        setAiClassifyResult(data.result);
      } else {
        setAiClassifyError(
          data?.error || 'AI classifier temporarily unavailable · Explore the 28 curated GATE languages below.'
        );
      }
    } catch {
      setAiClassifyError('Network offline · All 28 curated GATE languages below remain 100% available.');
    } finally {
      setAiClassifyLoading(false);
    }
  };

  const selectedState = automaton.states.find((s) => s.id === selectedStateId) ?? null;

  // Render SVG transition geometry helper
  const renderAutomatonEdges = () => {
    const stateMap = new Map(automaton.states.map((s) => [s.id, s]));
    const pairSet = new Set(automaton.transitions.map((t) => `${t.from}->${t.to}`));

    return automaton.transitions.map((tr) => {
      const from = stateMap.get(tr.from);
      const to = stateMap.get(tr.to);
      if (!from || !to) return null;

      const labelText = tr.symbols.join(', ');
      const isFired = Boolean(
        currentFaStep?.firedTransitions.some((f) => f.from === tr.from && f.to === tr.to)
      );
      const strokeColor = isFired ? '#C89216' : '#6E261A';
      const strokeWidth = isFired ? 3 : 1.9;
      const markerUrl = isFired ? 'url(#toc-arrow-gold)' : 'url(#toc-arrow-maroon)';

      if (tr.from === tr.to) {
        // Self-loop above node
        const x1 = from.x - 10;
        const y1 = from.y - 20;
        const x2 = from.x + 10;
        const y2 = from.y - 20;
        const cx1 = from.x - 34;
        const cy1 = from.y - 68;
        const cx2 = from.x + 34;
        const cy2 = from.y - 68;
        const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
        const lx = from.x;
        const ly = from.y - 59;
        return (
          <g key={tr.id}>
            <path
              d={d}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              markerEnd={markerUrl}
            />
            <g
              data-edge-label="true"
              onClick={(e) => {
                e.stopPropagation();
                deleteTransition(tr.id);
              }}
              className="cursor-pointer group"
            >
              <title>Click to delete transition ({labelText})</title>
              <rect
                x={lx - Math.max(15, labelText.length * 4.5 + 6)}
                y={ly - 10}
                width={Math.max(30, labelText.length * 9 + 12)}
                height={18}
                rx={9}
                fill={isFired ? '#FDF6E3' : '#FFFFFF'}
                stroke={isFired ? '#C89216' : '#D8CBB8'}
                strokeWidth={1.2}
              />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                className="font-mono text-[11px] font-bold select-none"
                fill={isFired ? '#8B6209' : '#1C1613'}
              >
                {labelText}
              </text>
            </g>
          </g>
        );
      }

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / dist;
      const uy = dy / dist;
      const r = 24;

      const hasReverse = pairSet.has(`${tr.to}->${tr.from}`);
      // Detect if another state lies close to the straight segment from->to (long jump across intermediate states)
      const crossesIntermediate = automaton.states.some((other) => {
        if (other.id === from.id || other.id === to.id) return false;
        const proj = ((other.x - from.x) * dx + (other.y - from.y) * dy) / (dist * dist);
        if (proj <= 0.08 || proj >= 0.92) return false;
        const px = from.x + proj * dx;
        const py = from.y + proj * dy;
        return Math.hypot(other.x - px, other.y - py) < 42;
      });

      let curveOffset = 0;
      if (crossesIntermediate) {
        // Arc gracefully below for right-to-left back jumps, above for left-to-right forward skips
        curveOffset = dist > 320 ? 78 : 56;
      } else if (hasReverse) {
        curveOffset = 32;
      }

      const nx = -uy;
      const ny = ux;

      const startX = from.x + ux * r + nx * (curveOffset !== 0 ? 6 : 0);
      const startY = from.y + uy * r + ny * (curveOffset !== 0 ? 6 : 0);
      const endX = to.x - ux * (r + 3) + nx * (curveOffset !== 0 ? 6 : 0);
      const endY = to.y - uy * (r + 3) + ny * (curveOffset !== 0 ? 6 : 0);
      const midX = (startX + endX) / 2 + nx * curveOffset;
      const midY = (startY + endY) / 2 + ny * curveOffset;

      const d = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
      const lx = (startX + 2 * midX + endX) / 4;
      const ly = (startY + 2 * midY + endY) / 4 - (curveOffset !== 0 ? 0 : 12);

      return (
        <g key={tr.id}>
          <path
            d={d}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            markerEnd={markerUrl}
          />
          <g
            data-edge-label="true"
            onClick={(e) => {
              e.stopPropagation();
              deleteTransition(tr.id);
            }}
            className="cursor-pointer"
          >
            <title>Click to delete transition ({labelText})</title>
            <rect
              x={lx - Math.max(14, labelText.length * 4.5 + 6)}
              y={ly - 9}
              width={Math.max(28, labelText.length * 9 + 12)}
              height={18}
              rx={9}
              fill={isFired ? '#FDF6E3' : '#FFFFFF'}
              stroke={isFired ? '#C89216' : '#D8CBB8'}
              strokeWidth={1.2}
            />
            <text
              x={lx}
              y={ly + 3.5}
              textAnchor="middle"
              className="font-mono text-[11px] font-bold select-none"
              fill={isFired ? '#8B6209' : '#1C1613'}
            >
              {labelText}
            </text>
          </g>
        </g>
      );
    });
  };

  return (
    <div data-testid="cslab-panel-toc-studio" className="space-y-4">
      {/* Inner Mode Switcher — single-row scrollable rail */}
      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto no-scrollbar py-1 px-1 -mx-1">
        <div className="flex flex-nowrap items-center gap-1.5 bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] rounded-full p-1 shrink-0">
          {[
            { id: 'automata' as const, label: 'DFA / ε-NFA Designer', icon: CircleDot },
            { id: 'pda' as const, label: 'PDA Stack Visualizer', icon: Layers },
            { id: 'classifier' as const, label: 'Language Classifier (28+)', icon: Search },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`toc-mode-${tab.id}`}
                onClick={(e) => {
                  setMode(tab.id);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap transition-all duration-200 ${
                  active
                    ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] shadow-sm'
                    : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A] dark:border-[#6B5016] shrink-0 whitespace-nowrap">
          100% Client-Side Engine · ₹0 Cost
        </span>
      </div>

      {/* ==================================================================== */}
      {/* MODE 1A: INTERACTIVE DFA / ε-NFA DESIGNER & SIMULATOR                */}
      {/* ==================================================================== */}
      {mode === 'automata' && (
        <div data-testid="toc-automata-view" className="space-y-4">
          {/* Presets + Regex Quick Constructor */}
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Interactive <span className="text-[#6E261A] dark:text-[#E0A92E]">DFA / ε-NFA</span> Workbench
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                  Click canvas to add states · Drag freely · Double-click to toggle Accept · Click edge label to delete
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold border ${
                    isNfa
                      ? 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A]'
                      : 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] border-[#2E5E3E]/25'
                  }`}
                >
                  {isNfa ? 'NFA / ε-NFA' : 'Complete DFA'} · {automaton.states.length} states
                </span>
              </div>
            </div>

            {/* 5 One-Click GATE Presets (single-row scrollable) */}
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E] mr-1 shrink-0 whitespace-nowrap">
                GATE Presets:
              </span>
              {GATE_AUTOMATON_PRESETS.map((preset) => {
                const isSelected = automaton.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`toc-preset-${preset.id}`}
                    onClick={() => loadAutomatonPreset(preset)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0 whitespace-nowrap transition-all ${
                      isSelected
                        ? 'bg-[#241914] dark:bg-[#E0A92E] text-[#FAF8F4] dark:text-[#1C1613] border-[#241914] dark:border-[#E0A92E]'
                        : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352A24] hover:border-[#6E261A]'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>

            {/* Regex -> Automaton Quick Constructor + GATE Converters */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center pt-1">
              <div className="lg:col-span-6 flex items-center gap-2 bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] rounded-full px-3 py-1.5">
                <Wand2 className="w-3.5 h-3.5 text-[#6E261A] dark:text-[#E0A92E] shrink-0" />
                <input
                  type="text"
                  value={regexInput}
                  onChange={(e) => setRegexInput(e.target.value)}
                  placeholder="Regex e.g. (a+b)*ab or (0+1)*101"
                  aria-label="Regular expression constructor"
                  className="flex-1 min-w-0 bg-transparent text-xs font-mono text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="toc-build-regex-dfa"
                  onClick={() => handleBuildRegex(true)}
                  className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-[#FAF8F4] shrink-0 whitespace-nowrap transition-transform active:scale-[0.98]"
                >
                  Regex → Min DFA
                </button>
              </div>

              <div className="lg:col-span-6 flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  data-testid="toc-convert-dfa-btn"
                  onClick={handleConvertToDfa}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A] dark:border-[#6B5016] hover:bg-[#F9EBC4] shrink-0 whitespace-nowrap transition-transform active:scale-[0.98]"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  Convert ε-NFA → DFA
                </button>
                <button
                  type="button"
                  data-testid="toc-minimize-dfa-btn"
                  onClick={handleMinimizeDfa}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-[#FAF8F4] shrink-0 whitespace-nowrap transition-transform active:scale-[0.98]"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  Minimize DFA
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEdgeForm((v) => !v);
                    setEdgeFrom(automaton.states[0]?.id ?? '');
                    setEdgeTo(automaton.states[1]?.id ?? automaton.states[0]?.id ?? '');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold bg-[#F4EFE6] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border border-[#E8E0D5] dark:border-[#352A24] shrink-0 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Edge
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAutomaton({
                      id: `custom-${Date.now()}`,
                      name: 'Custom Automaton',
                      description: 'Click canvas to add states and wire transitions.',
                      alphabet: ['0', '1'],
                      states: [{ id: 'q0', label: 'q0', x: 140, y: 160, isStart: true, isAccept: false }],
                      transitions: [],
                    });
                    setSelectedStateId('q0');
                    setSubsetResult(null);
                    setMinResult(null);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] shrink-0 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
            </div>

            {regexError && (
              <div className="rounded-[16px] bg-[#FBEAE8] dark:bg-[#3A1E1B] px-3.5 py-2 text-xs text-[#B83227]">
                {regexError}
              </div>
            )}

            {/* Inline Add Transition Form */}
            {showEdgeForm && automaton.states.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 bg-[#F4EFE6] dark:bg-[#241D19] rounded-[18px] p-3 border border-[#E8E0D5] dark:border-[#352A24]">
                <span className="text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">New Transition:</span>
                <select
                  value={edgeFrom}
                  onChange={(e) => setEdgeFrom(e.target.value)}
                  className="px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                >
                  {automaton.states.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <ArrowRight className="w-3.5 h-3.5 text-[#61554D]" />
                <select
                  value={edgeTo}
                  onChange={(e) => setEdgeTo(e.target.value)}
                  className="px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                >
                  {automaton.states.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={edgeSymInput}
                  onChange={(e) => setEdgeSymInput(e.target.value)}
                  placeholder="0, 1 or ε"
                  className="w-28 px-3 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                />
                <button
                  type="button"
                  onClick={() => setEdgeSymInput(EPSILON)}
                  className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#FDF6E3] text-[#8B6209] border border-[#EED89A]"
                >
                  + ε
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (edgeFrom && edgeTo) {
                      addTransitionDirect(edgeFrom, edgeTo, edgeSymInput);
                      setShowEdgeForm(false);
                    }
                  }}
                  className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#6E261A] text-[#FAF8F4]"
                >
                  Add Edge
                </button>
              </div>
            )}

            {/* Main 2-column Interactive Canvas + String Simulator */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              {/* Left 8 cols: Interactive SVG Automaton Canvas */}
              <div className="xl:col-span-8 space-y-2.5">
                <div className="relative rounded-[24px] overflow-hidden border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#161210]">
                  {/* Subtle dot grid pattern + SVG */}
                  <svg
                    ref={svgRef}
                    viewBox="0 0 640 320"
                    data-no-swipe="true"
                    data-interactive-svg="true"
                    data-testid="toc-automaton-canvas"
                    onClick={handleCanvasClick}
                    onPointerMove={handleSvgPointerMove}
                    onPointerUp={handleSvgPointerUp}
                    onPointerLeave={handleSvgPointerUp}
                    className="w-full h-[270px] sm:h-[320px] select-none touch-none cursor-crosshair"
                  >
                    <defs>
                      <pattern id="toc-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                        <circle cx="2" cy="2" r="1.1" fill="#D8CBB8" opacity="0.55" />
                      </pattern>
                      <marker
                        id="toc-arrow-maroon"
                        viewBox="0 0 10 10"
                        refX="8.5"
                        refY="5"
                        markerWidth="6.5"
                        markerHeight="6.5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#6E261A" />
                      </marker>
                      <marker
                        id="toc-arrow-gold"
                        viewBox="0 0 10 10"
                        refX="8.5"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#C89216" />
                      </marker>
                    </defs>

                    <rect x="0" y="0" width="640" height="320" fill="url(#toc-dot-grid)" />

                    {/* Transitions */}
                    {renderAutomatonEdges()}

                    {/* States */}
                    {automaton.states.map((st) => {
                      const isActive = currentFaStep?.activeStates.includes(st.id) ?? false;
                      const isSelected = selectedStateId === st.id;
                      const isConnectOrigin = connectFromId === st.id;

                      return (
                        <g
                          key={st.id}
                          data-state-node="true"
                          onPointerDown={(e) => handleStatePointerDown(e, st.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            toggleAcceptState(st.id);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setStartState(st.id);
                          }}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          {/* Start Arrow */}
                          {st.isStart && (
                            <g>
                              <line
                                x1={st.x - 52}
                                y1={st.y}
                                x2={st.x - 26}
                                y2={st.y}
                                stroke="#6E261A"
                                strokeWidth={2.4}
                                markerEnd="url(#toc-arrow-maroon)"
                              />
                              <text
                                x={st.x - 42}
                                y={st.y - 8}
                                textAnchor="middle"
                                className="font-mono text-[10px] font-bold"
                                fill="#6E261A"
                              >
                                START
                              </text>
                            </g>
                          )}

                          {/* Active Imperial Gold Simulation Halo */}
                          {isActive && (
                            <circle
                              cx={st.x}
                              cy={st.y}
                              r={30}
                              fill="#C89216"
                              opacity={0.22}
                            />
                          )}

                          {/* Selected / Connect Ring */}
                          {(isSelected || isConnectOrigin) && (
                            <circle
                              cx={st.x}
                              cy={st.y}
                              r={27}
                              fill="none"
                              stroke={isConnectOrigin ? '#C89216' : '#6E261A'}
                              strokeWidth={1.6}
                              strokeDasharray="4 3"
                            />
                          )}

                          {/* Main State Circle */}
                          <circle
                            cx={st.x}
                            cy={st.y}
                            r={22}
                            fill={isActive ? '#FDF6E3' : '#FFFFFF'}
                            stroke={isActive ? '#C89216' : st.isAccept ? '#2E5E3E' : '#6E261A'}
                            strokeWidth={isActive ? 3.2 : 2.2}
                          />

                          {/* Double Concentric Accept Circle */}
                          {st.isAccept && (
                            <circle
                              cx={st.x}
                              cy={st.y}
                              r={17}
                              fill="none"
                              stroke={isActive ? '#C89216' : '#2E5E3E'}
                              strokeWidth={1.8}
                            />
                          )}

                          <text
                            x={st.x}
                            y={st.y + 4}
                            textAnchor="middle"
                            className="font-mono text-[12px] font-bold select-none pointer-events-none"
                            fill="#1C1613"
                          >
                            {st.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Selected State Compact Toolbar */}
                  {selectedState && (
                    <div className="flex flex-nowrap items-center justify-between gap-2 px-3.5 py-2 bg-[#F4EFE6] dark:bg-[#241D19] border-t border-[#E8E0D5] dark:border-[#352A24] overflow-x-auto no-scrollbar">
                      <div className="flex flex-nowrap items-center gap-1.5 shrink-0">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-[#241914] text-[#FAF8F4]">
                          State {selectedState.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStartState(selectedState.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${
                            selectedState.isStart
                              ? 'bg-[#6E261A] text-[#FAF8F4] border-[#6E261A]'
                              : 'bg-white dark:bg-[#1C1714] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352A24]'
                          }`}
                        >
                          {selectedState.isStart ? 'Start ✓' : 'Set Start'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAcceptState(selectedState.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${
                            selectedState.isAccept
                              ? 'bg-[#2E5E3E] text-[#FAF8F4] border-[#2E5E3E]'
                              : 'bg-white dark:bg-[#1C1714] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352A24]'
                          }`}
                        >
                          {selectedState.isAccept ? 'Accept ✓' : 'Toggle Accept'}
                        </button>
                        <div className="flex items-center gap-1 bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] rounded-full pl-2 pr-1 py-0.5">
                          <span className="text-[10px] font-mono text-[#61554D]">Sym:</span>
                          <input
                            type="text"
                            value={connectSymbol}
                            onChange={(e) => setConnectSymbol(e.target.value)}
                            className="w-10 text-xs font-mono text-center bg-transparent focus:outline-none text-[#1C1613] dark:text-[#F5F0E8]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setConnectFromId((prev) => (prev === selectedState.id ? null : selectedState.id))
                            }
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                              connectFromId === selectedState.id
                                ? 'bg-[#C89216] text-[#1C1613]'
                                : 'bg-[#FDF6E3] text-[#8B6209]'
                            }`}
                          >
                            {connectFromId === selectedState.id ? 'Click Target State...' : 'Connect →'}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteState(selectedState.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FBEAE8] text-[#B83227] shrink-0 whitespace-nowrap"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] px-1">
                  {automaton.description} · Alphabet Σ = {'{'}
                  {alphabetList.join(', ') || '∅'}
                  {'}'}
                </p>
              </div>

              {/* Right 4 cols: Live String Simulator + Step Trace */}
              <div className="xl:col-span-4 space-y-3">
                <div className="rounded-[22px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                      Step-by-Step String Tester
                    </span>
                    <span
                      data-testid="toc-sim-verdict"
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                        faTrace.accepted
                          ? 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                          : 'bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227]'
                      }`}
                    >
                      {faTrace.accepted ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> ACCEPTED
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" /> REJECTED
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      data-testid="toc-test-string-input"
                      value={testString}
                      onChange={(e) => {
                        setTestString(e.target.value);
                        setSimStepIdx(0);
                        setIsPlayingFa(false);
                      }}
                      placeholder="Enter string (blank = ε)"
                      className="flex-1 min-w-0 px-3.5 py-2 rounded-full text-sm font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#6E261A]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setTestString('');
                        setSimStepIdx(0);
                      }}
                      className="px-3 py-2 rounded-full text-xs font-mono font-bold bg-[#F4EFE6] dark:bg-[#241D19] text-[#6E261A] dark:text-[#E0A92E] border border-[#E8E0D5] dark:border-[#352A24]"
                    >
                      ε
                    </button>
                  </div>

                  {/* Stepper Controls */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlayingFa(false);
                          setSimStepIdx((s) => Math.max(0, s - 1));
                        }}
                        disabled={clampedStepIdx === 0}
                        className="p-2 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] disabled:opacity-40"
                        aria-label="Step Back"
                      >
                        <SkipBack className="w-3.5 h-3.5 text-[#1C1613] dark:text-[#F5F0E8]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (clampedStepIdx >= faTrace.steps.length - 1) setSimStepIdx(0);
                          setIsPlayingFa((p) => !p);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-[#FAF8F4]"
                      >
                        {isPlayingFa ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {isPlayingFa ? 'Pause' : 'Play'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlayingFa(false);
                          setSimStepIdx((s) => Math.min(faTrace.steps.length - 1, s + 1));
                        }}
                        disabled={clampedStepIdx >= faTrace.steps.length - 1}
                        className="p-2 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] disabled:opacity-40"
                        aria-label="Step Next"
                      >
                        <SkipForward className="w-3.5 h-3.5 text-[#1C1613] dark:text-[#F5F0E8]" />
                      </button>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-[#61554D] dark:text-[#A99B8E] tabular-nums">
                      Step {clampedStepIdx}/{Math.max(0, faTrace.steps.length - 1)}
                    </span>
                  </div>

                  {/* Character Tape Highlight */}
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {testString.length === 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-[#FDF6E3] text-[#8B6209] border border-[#EED89A]">
                        ε (empty string)
                      </span>
                    ) : (
                      testString.split('').map((ch, idx) => {
                        const isRead = idx < clampedStepIdx;
                        const isCurr = idx === clampedStepIdx - 1;
                        return (
                          <span
                            key={`${ch}-${idx}`}
                            className={`w-7 h-7 inline-flex items-center justify-center rounded-full font-mono text-xs font-bold border transition-all ${
                              isCurr
                                ? 'bg-[#C89216] text-[#1C1613] border-[#C89216] scale-110'
                                : isRead
                                ? 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A]'
                                : 'bg-white dark:bg-[#1C1714] text-[#61554D] dark:text-[#A99B8E] border-[#E8E0D5] dark:border-[#352A24]'
                            }`}
                          >
                            {ch}
                          </span>
                        );
                      })
                    )}
                  </div>

                  {/* Live Trace Path */}
                  <div className="rounded-[16px] bg-[#241914] text-[#FAF8F4] p-3 font-mono text-[11px] leading-relaxed break-words">
                    <div className="text-[10px] uppercase tracking-wider text-[#E0A92E] mb-1">
                      Live Computation Trace
                    </div>
                    {faTrace.traceText}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Converter Outputs: Subset Construction Table & Myhill-Nerode Minimization Trace */}
          {subsetResult && (
            <div
              data-testid="toc-subset-table"
              className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[24px] p-4 sm:p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Subset Construction Table <span className="text-[#6E261A] dark:text-[#E0A92E]">(ε-NFA → DFA)</span>
                </h3>
                <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A]">
                  {subsetResult.table.length} Reachable Subset States
                </span>
              </div>
              <div className="overflow-x-auto rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520]">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="bg-[#F4EFE6] dark:bg-[#241D19] text-[#6E261A] dark:text-[#E0A92E] border-b border-[#E8E0D5] dark:border-[#352A24]">
                      <th className="px-3 py-2">DFA State</th>
                      <th className="px-3 py-2">NFA Subset</th>
                      {subsetResult.alphabet.map((sym) => (
                        <th key={sym} className="px-3 py-2">δ(·, {sym})</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subsetResult.table.map((row) => (
                      <tr
                        key={row.subsetId}
                        className="border-b border-[#E8E0D5]/70 dark:border-[#2A221D] last:border-b-0"
                      >
                        <td className="px-3 py-2 font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                          {row.isStart ? '→ ' : ''}
                          {row.subsetId}
                          {row.isAccept ? ' ★' : ''}
                        </td>
                        <td className="px-3 py-2 text-[#61554D] dark:text-[#A99B8E]">{row.subsetLabel}</td>
                        {subsetResult.alphabet.map((sym) => (
                          <td key={sym} className="px-3 py-2 text-[#1C1613] dark:text-[#F5F0E8]">
                            {row.transitions[sym] ?? '∅'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {minResult && (
            <div
              data-testid="toc-minimization-trace"
              className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[24px] p-4 sm:p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    Myhill-Nerode Equivalence Partitioning
                  </h3>
                  <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                    Exact iterative k-equivalence refinement (GATE #1 TOC question pattern)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]">
                    Minimum States = {minResult.minimizedStateCount}
                  </span>
                  {minResult.unreachableRemoved.length > 0 && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono bg-[#FBEAE8] text-[#B83227]">
                      Removed unreachable: {minResult.unreachableRemoved.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {minResult.steps.map((st) => (
                  <div
                    key={st.pass}
                    className="flex flex-wrap items-center gap-2 rounded-[16px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] px-3.5 py-2.5"
                  >
                    <span className="font-mono text-xs font-bold text-[#6E261A] dark:text-[#E0A92E] min-w-[210px]">
                      {st.label}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {st.partitions.map((group, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-full font-mono text-xs bg-white dark:bg-[#241D19] border border-[#D8CBB8] dark:border-[#3A2D25] text-[#1C1613] dark:text-[#F5F0E8]"
                        >
                          {'{'}
                          {group.join(', ')}
                          {'}'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Batch Language Inspector (Σ* up to length 4 + Empty / Finite / Infinite) */}
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[24px] p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Batch Language Inspector <span className="text-[#6E261A] dark:text-[#E0A92E]">(Σ* up to length 4)</span>
                </h3>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">{batchLanguage.cardinalityReason}</p>
              </div>
              <span
                data-testid="toc-cardinality-badge"
                className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                  batchLanguage.cardinality === 'Infinite'
                    ? 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A]'
                    : batchLanguage.cardinality === 'Finite'
                    ? 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] border-[#2E5E3E]/25'
                    : 'bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] border-[#B83227]/30'
                }`}
              >
                Language: {batchLanguage.cardinality}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#2E5E3E] dark:text-[#7BB88F]">
                  Accepted Strings ({batchLanguage.acceptedStrings.length})
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {batchLanguage.acceptedStrings.length === 0 ? (
                    <span className="text-xs text-[#61554D]">None up to length 4</span>
                  ) : (
                    batchLanguage.acceptedStrings.slice(0, 32).map((s) => (
                      <button
                        key={`acc-${s}`}
                        type="button"
                        onClick={() => {
                          setTestString(s === EPSILON ? '' : s);
                          setSimStepIdx(0);
                        }}
                        className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] hover:ring-1 hover:ring-[#2E5E3E]"
                      >
                        {s}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#B83227]">
                  Rejected Strings ({batchLanguage.rejectedStrings.length})
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {batchLanguage.rejectedStrings.length === 0 ? (
                    <span className="text-xs text-[#61554D]">All strings accepted (Σ*)</span>
                  ) : (
                    batchLanguage.rejectedStrings.slice(0, 32).map((s) => (
                      <button
                        key={`rej-${s}`}
                        type="button"
                        onClick={() => {
                          setTestString(s === EPSILON ? '' : s);
                          setSimStepIdx(0);
                        }}
                        className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] hover:text-[#B83227]"
                      >
                        {s}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODE 1B: INTERACTIVE PDA DESIGNER & LIVE STACK VISUALIZER            */}
      {/* ==================================================================== */}
      {mode === 'pda' && (
        <div data-testid="toc-pda-view" className="space-y-4">
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Pushdown Automaton <span className="text-[#6E261A] dark:text-[#E0A92E]">(PDA) & Live Stack</span>
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">{pda.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="pda-determinism-badge"
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                    pdaDeterminism.isDeterministic
                      ? 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] border-[#2E5E3E]/25'
                      : 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border-[#EED89A]'
                  }`}
                >
                  {pdaDeterminism.isDeterministic ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  {pdaDeterminism.classification}
                </span>
              </div>
            </div>

            {/* 4 One-Click GATE PDA Presets */}
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E] mr-1 shrink-0 whitespace-nowrap">
                PDA Presets:
              </span>
              {GATE_PDA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`pda-preset-${preset.id}`}
                  onClick={() => loadPdaPreset(preset)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0 whitespace-nowrap transition-all ${
                    pda.id === preset.id
                      ? 'bg-[#241914] dark:bg-[#E0A92E] text-[#FAF8F4] dark:text-[#1C1613] border-[#241914] dark:border-[#E0A92E]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352A24]'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            {/* NPDA Conflict Callout */}
            {!pdaDeterminism.isDeterministic && pdaDeterminism.conflicts.length > 0 && (
              <div className="rounded-[18px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#6B5016] px-3.5 py-2.5 text-xs text-[#8B6209] dark:text-[#E0A92E] space-y-1">
                <div className="font-bold">Non-Determinism Detected (NPDA Branching):</div>
                <div className="font-mono text-[11px]">{pdaDeterminism.conflicts[0]}</div>
              </div>
            )}

            {/* Input + Acceptance Mode + Playback Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[22px] p-3.5">
              <div className="lg:col-span-5 flex items-center gap-2">
                <input
                  type="text"
                  data-testid="pda-input-field"
                  value={pdaInput}
                  onChange={(e) => {
                    setPdaInput(e.target.value);
                    setPdaStepIdx(0);
                    setIsPlayingPda(false);
                  }}
                  placeholder="Test string e.g. aaabbb"
                  className="flex-1 min-w-0 px-3.5 py-2 rounded-full text-sm font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#6E261A]"
                />
                <span
                  data-testid="pda-verdict"
                  className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold shrink-0 ${
                    pdaSim.accepted
                      ? 'bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                      : 'bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227]'
                  }`}
                >
                  {pdaSim.accepted ? 'ACCEPTED ✓' : 'REJECTED ✗'}
                </span>
              </div>

              <div className="lg:col-span-4 flex items-center gap-1.5 justify-start lg:justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setPdaMode('final_state');
                    setPdaStepIdx(0);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
                    pdaMode === 'final_state'
                      ? 'bg-[#6E261A] text-[#FAF8F4] border-[#6E261A]'
                      : 'bg-white dark:bg-[#1C1714] text-[#61554D] border-[#E8E0D5] dark:border-[#352A24]'
                  }`}
                >
                  Final State (q∈F)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPdaMode('empty_stack');
                    setPdaStepIdx(0);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
                    pdaMode === 'empty_stack'
                      ? 'bg-[#6E261A] text-[#FAF8F4] border-[#6E261A]'
                      : 'bg-white dark:bg-[#1C1714] text-[#61554D] border-[#E8E0D5] dark:border-[#352A24]'
                  }`}
                >
                  Empty Stack (ε)
                </button>
              </div>

              <div className="lg:col-span-3 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlayingPda(false);
                    setPdaStepIdx((s) => Math.max(0, s - 1));
                  }}
                  disabled={clampedPdaStep === 0}
                  className="p-2 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] disabled:opacity-40"
                  aria-label="PDA Step Back"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (clampedPdaStep >= pdaSim.steps.length - 1) setPdaStepIdx(0);
                    setIsPlayingPda((p) => !p);
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#6E261A] text-[#FAF8F4]"
                >
                  {isPlayingPda ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlayingPda ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  data-testid="pda-step-next"
                  onClick={() => {
                    setIsPlayingPda(false);
                    setPdaStepIdx((s) => Math.min(pdaSim.steps.length - 1, s + 1));
                  }}
                  disabled={clampedPdaStep >= pdaSim.steps.length - 1}
                  className="p-2 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] disabled:opacity-40"
                  aria-label="PDA Step Next"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] font-bold text-[#61554D] dark:text-[#A99B8E] tabular-nums ml-1">
                  {clampedPdaStep}/{Math.max(0, pdaSim.steps.length - 1)}
                </span>
              </div>
            </div>

            {/* 3-Pane Visualizer: Tape + State SVG + Vertical Stack */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              <div className="lg:col-span-8 space-y-3">
                {/* Animated Input Tape */}
                <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                      Input Tape (Gold Read Head)
                    </span>
                    <span className="font-mono text-[#61554D] dark:text-[#A99B8E]">
                      {activePdaSnap?.appliedRule ?? 'Initial Configuration'}
                    </span>
                  </div>
                  <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {[...pdaSim.input.split(''), '⊣'].map((ch, idx) => {
                      const isHead = (activePdaSnap?.inputIndex ?? 0) === idx;
                      const isDone = idx < (activePdaSnap?.inputIndex ?? 0);
                      return (
                        <div key={idx} className="flex flex-col items-center shrink-0">
                          <div
                            className={`w-10 h-10 rounded-[14px] flex items-center justify-center font-mono text-sm font-bold border-2 transition-all ${
                              isHead
                                ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#C89216] text-[#1C1613] dark:text-[#E0A92E] shadow-sm scale-105'
                                : isDone
                                ? 'bg-[#EBF5EE]/70 dark:bg-[#152B1D]/70 border-[#2E5E3E]/30 text-[#2E5E3E] dark:text-[#7BB88F]'
                                : 'bg-white dark:bg-[#1C1714] border-[#E8E0D5] dark:border-[#352A24] text-[#61554D] dark:text-[#A99B8E]'
                            }`}
                          >
                            {ch}
                          </div>
                          <span
                            className={`text-[9px] font-mono font-bold mt-0.5 ${
                              isHead ? 'text-[#C89216]' : 'text-transparent'
                            }`}
                          >
                            ▲ HEAD
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PDA State Graph SVG */}
                <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-2">
                  <svg
                    viewBox="0 0 600 200"
                    data-no-swipe="true"
                    data-interactive-svg="true"
                    className="w-full h-[170px] select-none"
                  >
                    <defs>
                      <marker
                        id="pda-arrow"
                        viewBox="0 0 10 10"
                        refX="8.5"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#6E261A" />
                      </marker>
                    </defs>
                    {/* Unique state-to-state arrows */}
                    {Array.from(new Set(pda.transitions.map((t) => `${t.from}->${t.to}`))).map((pair) => {
                      const [fromId, toId] = pair.split('->');
                      const from = pda.states.find((s) => s.id === fromId);
                      const to = pda.states.find((s) => s.id === toId);
                      if (!from || !to) return null;
                      const count = pda.transitions.filter((t) => t.from === fromId && t.to === toId).length;
                      if (fromId === toId) {
                        return (
                          <g key={pair}>
                            <path
                              d={`M ${from.x - 10} ${from.y - 22} C ${from.x - 36} ${from.y - 72}, ${from.x + 36} ${from.y - 72}, ${from.x + 10} ${from.y - 22}`}
                              fill="none"
                              stroke="#6E261A"
                              strokeWidth={1.8}
                              markerEnd="url(#pda-arrow)"
                            />
                            <text
                              x={from.x}
                              y={from.y - 62}
                              textAnchor="middle"
                              className="font-mono text-[10px] font-bold"
                              fill="#61554D"
                            >
                              {count} rule{count > 1 ? 's' : ''}
                            </text>
                          </g>
                        );
                      }
                      const dx = to.x - from.x;
                      const dy = to.y - from.y;
                      const dist = Math.max(1, Math.hypot(dx, dy));
                      const sx = from.x + (dx / dist) * 25;
                      const sy = from.y + (dy / dist) * 25;
                      const ex = to.x - (dx / dist) * 28;
                      const ey = to.y - (dy / dist) * 28;
                      return (
                        <g key={pair}>
                          <line
                            x1={sx}
                            y1={sy}
                            x2={ex}
                            y2={ey}
                            stroke="#6E261A"
                            strokeWidth={1.8}
                            markerEnd="url(#pda-arrow)"
                          />
                          <text
                            x={(sx + ex) / 2}
                            y={(sy + ey) / 2 - 8}
                            textAnchor="middle"
                            className="font-mono text-[10px] font-bold"
                            fill="#61554D"
                          >
                            {count} rule{count > 1 ? 's' : ''}
                          </text>
                        </g>
                      );
                    })}

                    {/* PDA State Circles */}
                    {pda.states.map((st) => {
                      const active = activePdaSnap?.stateId === st.id;
                      return (
                        <g key={st.id}>
                          {st.isStart && (
                            <line
                              x1={st.x - 52}
                              y1={st.y}
                              x2={st.x - 26}
                              y2={st.y}
                              stroke="#6E261A"
                              strokeWidth={2.2}
                              markerEnd="url(#pda-arrow)"
                            />
                          )}
                          {active && <circle cx={st.x} cy={st.y} r={30} fill="#C89216" opacity={0.25} />}
                          <circle
                            cx={st.x}
                            cy={st.y}
                            r={23}
                            fill={active ? '#FDF6E3' : '#FFFFFF'}
                            stroke={active ? '#C89216' : st.isAccept ? '#2E5E3E' : '#6E261A'}
                            strokeWidth={active ? 3.2 : 2.1}
                          />
                          {st.isAccept && (
                            <circle
                              cx={st.x}
                              cy={st.y}
                              r={17.5}
                              fill="none"
                              stroke={active ? '#C89216' : '#2E5E3E'}
                              strokeWidth={1.7}
                            />
                          )}
                          <text
                            x={st.x}
                            y={st.y + 4}
                            textAnchor="middle"
                            className="font-mono text-xs font-bold"
                            fill="#1C1613"
                          >
                            {st.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Right 4 cols: Visual Vertical Stack */}
              <div className="lg:col-span-4 rounded-[22px] bg-[#241914] text-[#FAF8F4] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#E0A92E]">
                    Live PDA Stack (LIFO)
                  </span>
                  <span className="font-mono text-[11px] text-[#D8CBB8]">
                    Depth: {activePdaSnap?.stack.length ?? 0}
                  </span>
                </div>

                <div
                  data-testid="pda-stack-visual"
                  className="flex-1 flex flex-col justify-end gap-1.5 min-h-[190px] bg-[#1A120E] rounded-[18px] p-3 border border-[#3A2D25]"
                >
                  {!activePdaSnap || activePdaSnap.stack.length === 0 ? (
                    <div className="text-center font-mono text-xs text-[#E0A92E] py-8">
                      [ EMPTY STACK — ε ]
                    </div>
                  ) : (
                    activePdaSnap.stack.map((sym, idx) => {
                      const isTop = idx === 0;
                      const isBottom = sym === 'Z0' && idx === activePdaSnap.stack.length - 1;
                      return (
                        <div
                          key={`${sym}-${idx}`}
                          className={`flex items-center justify-between px-3.5 py-2 rounded-[14px] font-mono text-xs font-bold border transition-all ${
                            isTop
                              ? 'bg-[#FDF6E3] text-[#1C1613] border-[#C89216] shadow-sm'
                              : isBottom
                              ? 'bg-[#6E261A] text-[#FAF8F4] border-[#9E3E2E]'
                              : 'bg-[#FAF8F4] text-[#1C1613] border-[#D8CBB8]'
                          }`}
                        >
                          <span>{sym}</span>
                          <span className="text-[10px] uppercase opacity-75">
                            {isTop ? '← TOP' : isBottom ? 'BOTTOM' : `lvl ${activePdaSnap.stack.length - idx}`}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <p className="text-[11px] text-[#D8CBB8] mt-2.5">{pdaSim.reason}</p>
              </div>
            </div>

            {/* Interactive PDA Transition Table + Add Rule Form */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                  GATE Transition Rules: δ(State, Input | ε, StackTop) → (NextState, PushString)
                </h3>
                <span className="text-[11px] font-mono text-[#61554D] dark:text-[#A99B8E]">
                  {pda.transitions.length} transitions
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {pda.transitions.map((tr) => (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-[16px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] font-mono text-xs"
                  >
                    <span className="text-[#1C1613] dark:text-[#F5F0E8]">
                      ({tr.from}, <strong className="text-[#6E261A] dark:text-[#E0A92E]">{tr.input}</strong>, {tr.stackTop}) → ({tr.to}, <strong>{formatPushSymbols(tr.push)}</strong>)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeletePdaRule(tr.id)}
                      className="text-[#B83227] hover:opacity-75 p-1"
                      aria-label="Delete PDA rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddPdaRule}
                className="flex flex-wrap items-center gap-2 rounded-[18px] bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] p-3"
              >
                <span className="text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">+ Rule:</span>
                <select
                  value={newRuleFrom}
                  onChange={(e) => setNewRuleFrom(e.target.value)}
                  className="px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                >
                  {pda.states.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  placeholder="in / ε"
                  className="w-16 px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                />
                <input
                  type="text"
                  value={newRuleTop}
                  onChange={(e) => setNewRuleTop(e.target.value)}
                  placeholder="top"
                  className="w-16 px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                />
                <ArrowRight className="w-3.5 h-3.5 text-[#61554D]" />
                <select
                  value={newRuleTo}
                  onChange={(e) => setNewRuleTo(e.target.value)}
                  className="px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                >
                  {pda.states.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newRulePush}
                  onChange={(e) => setNewRulePush(e.target.value)}
                  placeholder="push (ε=pop)"
                  className="w-24 px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#6E261A] text-[#FAF8F4]"
                >
                  Add Rule
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODE 1C: LANGUAGE CLASSIFIER (28 GATE LANGUAGES + FREE AI)           */}
      {/* ==================================================================== */}
      {mode === 'classifier' && (
        <div data-testid="toc-classifier-view" className="space-y-4">
          {/* Custom Language Analyzer (Free-Tier Gemini 2.5 Flash + Cache) */}
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Chomsky Hierarchy <span className="text-[#6E261A] dark:text-[#E0A92E]">Language Classifier</span>
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                  28 curated GATE CSE languages offline + instant Free-Tier AI proof analyzer for custom languages
                </p>
              </div>
            </div>

            <form onSubmit={handleAnalyzeCustomLanguage} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                data-testid="toc-custom-lang-input"
                value={customLangInput}
                onChange={(e) => setCustomLangInput(e.target.value)}
                placeholder="Type any formal language e.g. L = { a^n b^m c^n | n, m >= 1 }"
                className="flex-1 min-w-0 px-4 py-2.5 rounded-full text-xs sm:text-sm font-mono bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#6E261A]"
              />
              <button
                type="submit"
                disabled={aiClassifyLoading}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-[#FAF8F4] shrink-0 whitespace-nowrap disabled:opacity-60 transition-transform active:scale-[0.98]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {aiClassifyLoading ? 'Analyzing...' : 'Classify Custom Language'}
              </button>
            </form>

            {aiClassifyError && (
              <div className="rounded-[16px] bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] px-3.5 py-2.5 text-xs text-[#61554D] dark:text-[#D8CBB8] flex items-center gap-2">
                <Info className="w-4 h-4 text-[#C89216] shrink-0" />
                <span>{aiClassifyError}</span>
              </div>
            )}

            {aiClassifyResult && (
              <div className="rounded-[22px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#EED89A] dark:border-[#6B5016] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    {aiClassifyResult.expression}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-3 py-0.5 rounded-full text-xs font-bold border ${getChomskyBadgeClass(aiClassifyResult.chomskyClass)}`}>
                      {aiClassifyResult.chomskyClass}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#241914] text-[#FAF8F4]">
                      {aiClassifyResult.isDcfl ? 'DCFL ✓' : 'Non-DCFL'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-[14px] bg-white dark:bg-[#1C1714] p-2.5 border border-[#E8E0D5] dark:border-[#2E2520]">
                    <div className="text-[10px] font-bold uppercase text-[#6E261A] dark:text-[#E0A92E]">Complement Class</div>
                    <div className="text-[#1C1613] dark:text-[#F5F0E8] mt-0.5">{aiClassifyResult.complementClass}</div>
                  </div>
                  <div className="rounded-[14px] bg-white dark:bg-[#1C1714] p-2.5 border border-[#E8E0D5] dark:border-[#2E2520]">
                    <div className="text-[10px] font-bold uppercase text-[#6E261A] dark:text-[#E0A92E]">Myhill-Nerode / Automaton</div>
                    <div className="text-[#1C1613] dark:text-[#F5F0E8] mt-0.5">{aiClassifyResult.myhillNerode}</div>
                  </div>
                  <div className="rounded-[14px] bg-white dark:bg-[#1C1714] p-2.5 border border-[#E8E0D5] dark:border-[#2E2520]">
                    <div className="text-[10px] font-bold uppercase text-[#6E261A] dark:text-[#E0A92E]">Pumping / Proof Sketch</div>
                    <div className="text-[#1C1613] dark:text-[#F5F0E8] mt-0.5">{aiClassifyResult.pumpingSketch}</div>
                  </div>
                  <div className="rounded-[14px] bg-[#FDF6E3] dark:bg-[#2C2215] p-2.5 border border-[#EED89A] dark:border-[#6B5016]">
                    <div className="text-[10px] font-bold uppercase text-[#8B6209] dark:text-[#E0A92E]">GATE Trap Note</div>
                    <div className="text-[#1C1613] dark:text-[#F5F0E8] mt-0.5">{aiClassifyResult.gateTrap}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 28 Curated GATE Languages Explorer */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <div className="xl:col-span-7 bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-[#61554D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={langSearch}
                    onChange={(e) => setLangSearch(e.target.value)}
                    placeholder="Search 28 GATE languages (e.g. prime, ww, 01, palindrome, E_TM)..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-full text-xs bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none focus:border-[#6E261A]"
                  />
                </div>
                <span className="text-[11px] font-mono text-[#61554D] dark:text-[#A99B8E] shrink-0">
                  Showing {filteredLanguages.length}/{GATE_LANGUAGE_LIBRARY.length}
                </span>
              </div>

              {/* Filter Chips — single-row scrollable */}
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1">
                {CHOMSKY_FILTERS.map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setChomskyFilter(cls)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold border shrink-0 whitespace-nowrap transition-all ${
                      chomskyFilter === cls
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] border-[#6E261A]'
                        : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] border-[#E8E0D5] dark:border-[#352A24]'
                    }`}
                  >
                    {cls}
                  </button>
                ))}
              </div>

              {/* Language List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[430px] overflow-y-auto pr-1">
                {filteredLanguages.map((lang) => {
                  const isSel = selectedLang.id === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setSelectedLang(lang)}
                      className={`text-left rounded-[18px] p-3 border transition-all ${
                        isSel
                          ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#C89216] shadow-sm'
                          : 'bg-[#FAF8F4] dark:bg-[#161210] border-[#E8E0D5] dark:border-[#2E2520] hover:border-[#6E261A]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8] leading-snug">
                          {lang.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${getChomskyBadgeClass(
                            lang.chomskyClass
                          )}`}
                        >
                          {lang.chomskyClass}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-[#6E261A] dark:text-[#E0A92E] mt-1.5 truncate">
                        {lang.expression}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right 5 cols: Selected Language Proof Card */}
            <div className="xl:col-span-5 bg-[#241914] text-[#FAF8F4] rounded-[28px] p-5 space-y-4 border border-[#3A2D25]">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-3 py-0.5 rounded-full text-xs font-mono font-bold border ${getChomskyBadgeClass(selectedLang.chomskyClass)}`}>
                    {selectedLang.chomskyClass}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#3A2D25] text-[#E0A92E]">
                    {selectedLang.isDcfl ? 'Recognizable by DPDA' : 'No DPDA'}
                  </span>
                </div>
                <h3 className="text-lg font-bold tracking-tight text-[#FAF8F4]">{selectedLang.title}</h3>
                <div className="font-mono text-xs text-[#E0A92E] bg-[#1A120E] rounded-[14px] px-3 py-2 border border-[#3A2D25]">
                  {selectedLang.expression}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="rounded-[16px] bg-[#1A120E] border border-[#3A2D25] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#E0A92E] mb-1">
                    Complement (L̄) Classification
                  </div>
                  <p className="text-[#F5F0E8] leading-relaxed">{selectedLang.complementClass}</p>
                </div>

                <div className="rounded-[16px] bg-[#1A120E] border border-[#3A2D25] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#E0A92E] mb-1">
                    Myhill-Nerode Index & Intuition
                  </div>
                  <p className="text-[#F5F0E8] leading-relaxed">{selectedLang.myhillNerode}</p>
                </div>

                <div className="rounded-[16px] bg-[#1A120E] border border-[#3A2D25] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#E0A92E] mb-1">
                    Pumping Lemma / Proof Sketch
                  </div>
                  <p className="text-[#F5F0E8] leading-relaxed">{selectedLang.pumpingSketch}</p>
                </div>

                <div className="rounded-[16px] bg-[#6E261A]/40 border border-[#C89216]/50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#E0A92E] mb-1">
                    IIT Madras GATE Trap Watch
                  </div>
                  <p className="text-[#FAF8F4] font-medium leading-relaxed">{selectedLang.gateTrap}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
