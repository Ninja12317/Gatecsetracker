import React, { useState, useMemo, useRef } from 'react';
import {
  Cpu,
  Grid3X3,
  Clock,
  Trash2,
  RotateCcw,
  Zap,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Layers,
} from 'lucide-react';
import {
  GATE_CIRCUIT_PRESETS,
  getComponentSpec,
  evaluateCircuit,
  computeCircuitTruthTable,
  getKMapGridLayout,
  solveKMap,
  parseMintermSpec,
  buildCircuitFromKMap,
  analyzeBooleanExpression,
  FLIP_FLOP_META,
  stepFlipFlop,
  GATE_COUNTER_PRESETS,
  buildCounterFromSequence,
  analyzeCounter,
  type CircuitComponentKind,
  type CircuitNode,
  type CircuitWire,
  type LogicBit,
  type KMapCellVal,
  type FlipFlopType,
  type CounterPreset,
} from '../utils/digitalLogicEngine';

type DigitalStudioMode = 'workbench' | 'kmap' | 'sequential';

const PALETTE_GROUPS: Array<{
  title: string;
  items: Array<{ kind: CircuitComponentKind; label: string }>;
}> = [
  {
    title: 'I/O',
    items: [
      { kind: 'INPUT', label: 'Input Toggle' },
      { kind: 'CONST_0', label: 'Const 0' },
      { kind: 'CONST_1', label: 'Const 1' },
      { kind: 'OUTPUT', label: 'Output LED' },
    ],
  },
  {
    title: 'Gates',
    items: [
      { kind: 'AND', label: 'AND' },
      { kind: 'OR', label: 'OR' },
      { kind: 'NOT', label: 'NOT' },
      { kind: 'NAND', label: 'NAND' },
      { kind: 'NOR', label: 'NOR' },
      { kind: 'XOR', label: 'XOR' },
      { kind: 'XNOR', label: 'XNOR' },
    ],
  },
  {
    title: 'MSI Blocks',
    items: [
      { kind: 'MUX_2_1', label: '2:1 MUX' },
      { kind: 'MUX_4_1', label: '4:1 MUX' },
      { kind: 'MUX_8_1', label: '8:1 MUX' },
      { kind: 'DEMUX_1_2', label: '1:2 DEMUX' },
      { kind: 'DEMUX_1_4', label: '1:4 DEMUX' },
      { kind: 'DEC_2_4', label: '2:4 Decoder' },
      { kind: 'DEC_3_8', label: '3:8 Decoder' },
      { kind: 'PENC_4_2', label: '4:2 Priority Enc' },
      { kind: 'HALF_ADDER', label: 'Half Adder' },
      { kind: 'FULL_ADDER', label: 'Full Adder' },
    ],
  },
];

// Strictly warm IIT Madras palette for K-Map implicant highlights (ZERO BLUE)
const KMAP_GROUP_STYLES = [
  { stroke: '#6E261A', fill: 'rgba(110, 38, 26, 0.14)', badge: 'bg-[#6E261A] text-[#FAF8F4]' },
  { stroke: '#C89216', fill: 'rgba(200, 146, 22, 0.18)', badge: 'bg-[#C89216] text-[#1C1613]' },
  { stroke: '#2E5E3E', fill: 'rgba(46, 94, 62, 0.16)', badge: 'bg-[#2E5E3E] text-[#FAF8F4]' },
  { stroke: '#B83227', fill: 'rgba(184, 50, 39, 0.14)', badge: 'bg-[#B83227] text-[#FAF8F4]' },
];

export const DigitalLogicStudioPanel: React.FC = () => {
  const [mode, setMode] = useState<DigitalStudioMode>('workbench');

  // ============================================================================
  // MODE 2A — INTERACTIVE CIRCUIT WORKBENCH
  // ============================================================================
  const [activePresetId, setActivePresetId] = useState<string>(GATE_CIRCUIT_PRESETS[0].id);
  const [nodes, setNodes] = useState<CircuitNode[]>(() => GATE_CIRCUIT_PRESETS[0].nodes);
  const [wires, setWires] = useState<CircuitWire[]>(() => GATE_CIRCUIT_PRESETS[0].wires);
  const [paletteTab, setPaletteTab] = useState<number>(2); // start on MSI Blocks or Gates
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [wiringFrom, setWiringFrom] = useState<{ nodeId: string; pinId: string } | null>(null);
  const [draggingNode, setDraggingNode] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [didDragNode, setDidDragNode] = useState<boolean>(false);
  const circuitSvgRef = useRef<SVGSVGElement | null>(null);

  // Boolean Expression Universal Gate Counter
  const [boolExprInput, setBoolExprInput] = useState<string>("A'B + AB'");
  const boolAnalysis = useMemo(() => analyzeBooleanExpression(boolExprInput), [boolExprInput]);

  const evalResult = useMemo(() => evaluateCircuit(nodes, wires), [nodes, wires]);
  const truthTable = useMemo(() => computeCircuitTruthTable(nodes, wires), [nodes, wires]);

  // Compute current active truth-table row index (for highlighting active row!)
  const activeInputMask = useMemo(() => {
    const inputs = nodes
      .filter((n) => n.kind === 'INPUT')
      .sort((a, b) => a.label.localeCompare(b.label));
    if (inputs.length === 0 || inputs.length > 4) return -1;
    let mask = 0;
    for (const inp of inputs) {
      mask = (mask << 1) | (inp.value ?? 0);
    }
    return mask;
  }, [nodes]);

  const loadCircuitPreset = (presetId: string) => {
    const p = GATE_CIRCUIT_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setActivePresetId(p.id);
    setNodes(p.nodes.map((n) => ({ ...n })));
    setWires(p.wires.map((w) => ({ ...w })));
    setSelectedNodeId(null);
    setWiringFrom(null);
  };

  const getCircuitCoords = (clientX: number, clientY: number) => {
    const svg = circuitSvgRef.current;
    if (!svg) return { x: 260, y: 140 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * 660,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * 300,
    };
  };

  const addComponentToCanvas = (kind: CircuitComponentKind) => {
    const spec = getComponentSpec(kind);
    const sameCount = nodes.filter((n) => n.kind === kind).length;
    const label =
      kind === 'INPUT'
        ? String.fromCharCode(65 + (sameCount % 26))
        : kind === 'OUTPUT'
        ? sameCount === 0
          ? 'Y'
          : `Y${sameCount}`
        : spec.shortName;

    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const x = kind === 'INPUT' ? 36 : kind === 'OUTPUT' ? 540 : 180 + ((nodes.length * 38) % 260);
    const y = 32 + ((nodes.length * 46) % 190);
    setNodes((prev) => [
      ...prev,
      { id, kind, label, x, y, value: kind === 'INPUT' ? 0 : undefined },
    ]);
    setSelectedNodeId(id);
    setActivePresetId('custom');
  };

  const toggleInputNode = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId && n.kind === 'INPUT' ? { ...n, value: n.value ? 0 : 1 } : n))
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setWires((prev) =>
      prev.filter((w) => w.fromNodeId !== selectedNodeId && w.toNodeId !== selectedNodeId)
    );
    setSelectedNodeId(null);
  };

  const handleOutputPinClick = (e: React.MouseEvent, nodeId: string, pinId: string) => {
    e.stopPropagation();
    setWiringFrom((prev) =>
      prev && prev.nodeId === nodeId && prev.pinId === pinId ? null : { nodeId, pinId }
    );
  };

  const handleInputPinClick = (e: React.MouseEvent, toNodeId: string, toPinId: string) => {
    e.stopPropagation();
    if (!wiringFrom || wiringFrom.nodeId === toNodeId) return;
    const dup = wires.some(
      (w) =>
        w.fromNodeId === wiringFrom.nodeId &&
        w.fromPinId === wiringFrom.pinId &&
        w.toNodeId === toNodeId &&
        w.toPinId === toPinId
    );
    if (!dup) {
      setWires((prev) => [
        ...prev,
        {
          id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          fromNodeId: wiringFrom.nodeId,
          fromPinId: wiringFrom.pinId,
          toNodeId,
          toPinId,
        },
      ]);
      setActivePresetId('custom');
    }
    setWiringFrom(null);
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: CircuitNode) => {
    e.stopPropagation();
    if ((e.target as Element).closest('[data-pin="true"]')) return;
    const pt = getCircuitCoords(e.clientX, e.clientY);
    setSelectedNodeId(node.id);
    setDraggingNode({ id: node.id, dx: pt.x - node.x, dy: pt.y - node.y });
    setDidDragNode(false);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const handleCircuitPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingNode) return;
    const pt = getCircuitCoords(e.clientX, e.clientY);
    setDidDragNode(true);
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== draggingNode.id) return n;
        const spec = getComponentSpec(n.kind);
        return {
          ...n,
          x: Math.round(Math.max(8, Math.min(652 - spec.width, pt.x - draggingNode.dx))),
          y: Math.round(Math.max(8, Math.min(292 - spec.height, pt.y - draggingNode.dy))),
        };
      })
    );
  };

  const handleCircuitPointerUp = () => {
    setDraggingNode(null);
  };

  // ============================================================================
  // MODE 2B — INTERACTIVE K-MAP MINIMIZER (2, 3, 4 VARIABLES)
  // ============================================================================
  const [kmapVars, setKmapVars] = useState<2 | 3 | 4>(4);
  const [kmapSpecInput, setKmapSpecInput] = useState<string>('Σm(0,1,2,5,7,8,9,10,14) + d(4,12)');
  const [kmapCells, setKmapCells] = useState<Record<number, KMapCellVal>>(() =>
    parseMintermSpec('Σm(0,1,2,5,7,8,9,10,14) + d(4,12)', 4)
  );
  const [hoveredPiId, setHoveredPiId] = useState<string | null>(null);

  const kmapLayout = useMemo(() => getKMapGridLayout(kmapVars), [kmapVars]);
  const kmapSolution = useMemo(() => solveKMap(kmapVars, kmapCells), [kmapVars, kmapCells]);

  const cycleKmapCell = (mintermIdx: number) => {
    setKmapCells((prev) => {
      const curr = prev[mintermIdx] ?? 0;
      const next: KMapCellVal = curr === 0 ? 1 : curr === 1 ? 'X' : 0;
      return { ...prev, [mintermIdx]: next };
    });
  };

  const applyKmapPreset = (vars: 2 | 3 | 4, spec: string) => {
    setKmapVars(vars);
    setKmapSpecInput(spec);
    setKmapCells(parseMintermSpec(spec, vars));
  };

  const handleLoadKmapIntoCircuit = () => {
    const synth = buildCircuitFromKMap(kmapSolution);
    setNodes(synth.nodes);
    setWires(synth.wires);
    setActivePresetId('kmap-synth');
    setSelectedNodeId(null);
    setWiringFrom(null);
    setMode('workbench');
  };

  // ============================================================================
  // MODE 2C — SEQUENTIAL CIRCUITS, FLIP-FLOPS & COUNTER LAB
  // ============================================================================
  const [ffType, setFfType] = useState<FlipFlopType>('JK');
  const [ffClockEdge, setFfClockEdge] = useState<'rising' | 'falling'>('rising');
  const [ffIn1, setFfIn1] = useState<LogicBit>(1);
  const [ffIn2, setFfIn2] = useState<LogicBit>(1);
  const [ffQ, setFfQ] = useState<LogicBit>(0);
  const [ffHistory, setFfHistory] = useState<
    Array<{ pulse: number; qPrev: LogicBit; qNext: LogicBit; action: string; invalid: boolean }>
  >([]);

  const handleClockPulse = () => {
    const res = stepFlipFlop(ffType, ffQ, ffIn1, ffIn2);
    setFfHistory((prev) => [
      ...prev.slice(-9),
      {
        pulse: (prev[prev.length - 1]?.pulse ?? 0) + 1,
        qPrev: ffQ,
        qNext: res.nextQ,
        action: res.action,
        invalid: res.invalid,
      },
    ]);
    setFfQ(res.nextQ);
  };

  // Counter Lab
  const [counterPreset, setCounterPreset] = useState<CounterPreset>(() => GATE_COUNTER_PRESETS[1]); // 3-bit Johnson (shows lockout!)
  const [counterState, setCounterState] = useState<number>(() => GATE_COUNTER_PRESETS[1].initialState);
  const [counterStepCount, setCounterStepCount] = useState<number>(0);
  const [customSeqBits, setCustomSeqBits] = useState<2 | 3 | 4>(3);
  const [customSeqText, setCustomSeqText] = useState<string>('0, 2, 4, 6, 7');
  const [customSelfStarting, setCustomSelfStarting] = useState<boolean>(true);

  const counterAnalysis = useMemo(() => analyzeCounter(counterPreset), [counterPreset]);

  const handleSelectCounterPreset = (p: CounterPreset) => {
    setCounterPreset(p);
    setCounterState(p.initialState);
    setCounterStepCount(0);
  };

  const handleStepCounter = () => {
    setCounterState((curr) => counterPreset.nextStateMap[curr] ?? 0);
    setCounterStepCount((c) => c + 1);
  };

  const handleApplyCustomCounter = (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildCounterFromSequence(customSeqBits, customSeqText, customSelfStarting);
    handleSelectCounterPreset(built);
  };

  const formatBits = (val: number, bits: number) => val.toString(2).padStart(bits, '0');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const activePreset = GATE_CIRCUIT_PRESETS.find((p) => p.id === activePresetId);

  return (
    <div data-testid="cslab-panel-digital-logic" className="space-y-4">
      {/* Inner Mode Switcher — single-row scrollable rail */}
      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto no-scrollbar py-1 px-1 -mx-1">
        <div className="flex flex-nowrap items-center gap-1.5 bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] rounded-full p-1 shrink-0">
          {[
            { id: 'workbench' as const, label: 'Circuit Workbench', icon: Cpu },
            { id: 'kmap' as const, label: 'K-Map Minimizer', icon: Grid3X3 },
            { id: 'sequential' as const, label: 'Flip-Flops & Counters', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`dl-mode-${tab.id}`}
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
          HIGH = Gold (#C89216) · LOW = Taupe
        </span>
      </div>

      {/* ==================================================================== */}
      {/* MODE 2A: INTERACTIVE GATES, MUX, DEMUX, DECODER & ADDER WORKBENCH    */}
      {/* ==================================================================== */}
      {mode === 'workbench' && (
        <div data-testid="dl-workbench-view" className="space-y-4">
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Digital Logic <span className="text-[#6E261A] dark:text-[#E0A92E]">Circuit Sandbox</span>
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                  Click Input Toggles to flip 0/1 · Drag blocks · Click Output pin → Input pin to wire · Click wire to delete
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {wiringFrom && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#FDF6E3] text-[#8B6209] border border-[#C89216]">
                    Wiring... Click an Input Pin (left side)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setNodes([]);
                    setWires([]);
                    setSelectedNodeId(null);
                    setWiringFrom(null);
                    setActivePresetId('custom');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
            </div>

            {/* 5 One-Click GATE Exam Presets */}
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E] mr-1 shrink-0 whitespace-nowrap">
                GATE Presets:
              </span>
              {GATE_CIRCUIT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`dl-preset-${p.id}`}
                  onClick={() => loadCircuitPreset(p.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0 whitespace-nowrap transition-all ${
                    activePresetId === p.id
                      ? 'bg-[#241914] dark:bg-[#E0A92E] text-[#FAF8F4] dark:text-[#1C1613] border-[#241914] dark:border-[#E0A92E]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352A24] hover:border-[#6E261A]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Component Palette Bar (category switcher + single-row scrollable chips) */}
            <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-2.5 space-y-2">
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
                {PALETTE_GROUPS.map((grp, idx) => (
                  <button
                    key={grp.title}
                    type="button"
                    onClick={() => setPaletteTab(idx)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 whitespace-nowrap transition-all ${
                      paletteTab === idx
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                        : 'bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {grp.title}
                  </button>
                ))}
                <span className="text-[11px] text-[#61554D] dark:text-[#A99B8E] ml-1 shrink-0 whitespace-nowrap">
                  Click to place on canvas:
                </span>
              </div>
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {PALETTE_GROUPS[paletteTab].items.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addComponentToCanvas(item.kind)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-mono font-semibold bg-white dark:bg-[#1C1714] text-[#1C1613] dark:text-[#F5F0E8] border border-[#E8E0D5] dark:border-[#352A24] hover:border-[#C89216] shrink-0 whitespace-nowrap transition-transform active:scale-[0.98]"
                  >
                    <Plus className="w-3 h-3 text-[#6E261A] dark:text-[#E0A92E]" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive SVG Circuit Canvas */}
            <div className="rounded-[24px] overflow-hidden border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#161210]">
              <svg
                ref={circuitSvgRef}
                viewBox="0 0 660 300"
                data-no-swipe="true"
                data-interactive-svg="true"
                data-testid="dl-circuit-canvas"
                onClick={() => {
                  setWiringFrom(null);
                  setSelectedNodeId(null);
                }}
                onPointerMove={handleCircuitPointerMove}
                onPointerUp={handleCircuitPointerUp}
                onPointerLeave={handleCircuitPointerUp}
                className="w-full h-[290px] sm:h-[330px] select-none touch-none"
              >
                <defs>
                  <pattern id="dl-dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="#D8CBB8" opacity="0.55" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width="660" height="300" fill="url(#dl-dot-grid)" />

                {/* Wires (Imperial Gold #C89216 for HIGH = 1, Warm Taupe #8C7E75 for LOW = 0) */}
                {wires.map((w) => {
                  const src = nodes.find((n) => n.id === w.fromNodeId);
                  const dst = nodes.find((n) => n.id === w.toNodeId);
                  if (!src || !dst) return null;
                  const srcSpec = getComponentSpec(src.kind);
                  const dstSpec = getComponentSpec(dst.kind);
                  const sp = srcSpec.outputs.find((p) => p.id === w.fromPinId);
                  const dp = dstSpec.inputs.find((p) => p.id === w.toPinId);
                  if (!sp || !dp) return null;

                  const x1 = src.x + sp.xOffset;
                  const y1 = src.y + sp.yOffset;
                  const x2 = dst.x + dp.xOffset;
                  const y2 = dst.y + dp.yOffset;
                  const cOffset = Math.max(32, Math.abs(x2 - x1) * 0.45);
                  const d = `M ${x1} ${y1} C ${x1 + cOffset} ${y1}, ${x2 - cOffset} ${y2}, ${x2} ${y2}`;
                  const isHigh = evalResult.wireValues[w.id] === 1;

                  return (
                    <g
                      key={w.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWires((prev) => prev.filter((item) => item.id !== w.id));
                      }}
                      className="cursor-pointer"
                    >
                      <title>Click wire to delete ({isHigh ? 'HIGH = 1' : 'LOW = 0'})</title>
                      {/* Invisible wider hit target */}
                      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                      <path
                        d={d}
                        fill="none"
                        stroke={isHigh ? '#C89216' : '#8C7E75'}
                        strokeWidth={isHigh ? 3 : 2}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}

                {/* Component Nodes */}
                {nodes.map((node) => {
                  const spec = getComponentSpec(node.kind);
                  const isSelected = selectedNodeId === node.id;
                  const isInput = node.kind === 'INPUT';
                  const isOutput = node.kind === 'OUTPUT';
                  const inputVal = node.value ?? 0;
                  const ledVal = evalResult.pinValues[`${node.id}:in0`] ?? 0;

                  const fill = isInput
                    ? inputVal === 1
                      ? '#FDF6E3'
                      : '#FFFFFF'
                    : isOutput
                    ? ledVal === 1
                      ? '#2E5E3E'
                      : '#F4EFE6'
                    : spec.category === 'msi'
                    ? '#241914'
                    : '#FFFFFF';

                  const stroke = isSelected
                    ? '#C89216'
                    : isInput && inputVal === 1
                    ? '#C89216'
                    : isOutput && ledVal === 1
                    ? '#C89216'
                    : '#6E261A';

                  const textColor =
                    spec.category === 'msi' || (isOutput && ledVal === 1) ? '#FAF8F4' : '#1C1613';

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onPointerDown={(e) => handleNodePointerDown(e, node)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!didDragNode && isInput) {
                          toggleInputNode(node.id);
                        }
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <rect
                        x={0}
                        y={0}
                        width={spec.width}
                        height={spec.height}
                        rx={spec.category === 'io' ? 18 : 14}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isSelected ? 2.8 : 1.9}
                      />

                      {/* Title / Value inside block */}
                      {isInput ? (
                        <g data-testid={`dl-input-toggle-${node.label}`}>
                          <text
                            x={22}
                            y={spec.height / 2 + 4}
                            textAnchor="middle"
                            className="font-mono text-[11px] font-bold select-none"
                            fill="#6E261A"
                          >
                            {node.label}
                          </text>
                          <rect
                            x={36}
                            y={7}
                            width={22}
                            height={22}
                            rx={11}
                            fill={inputVal === 1 ? '#C89216' : '#E8E0D5'}
                          />
                          <text
                            x={47}
                            y={22}
                            textAnchor="middle"
                            className="font-mono text-[11px] font-bold select-none"
                            fill={inputVal === 1 ? '#1C1613' : '#61554D'}
                          >
                            {inputVal}
                          </text>
                        </g>
                      ) : isOutput ? (
                        <g data-testid={`dl-output-led-${node.label}`}>
                          <circle
                            cx={21}
                            cy={spec.height / 2}
                            r={9}
                            fill={ledVal === 1 ? '#E0A92E' : '#D8CBB8'}
                          />
                          <text
                            x={21}
                            y={spec.height / 2 + 3.5}
                            textAnchor="middle"
                            className="font-mono text-[10px] font-bold select-none"
                            fill="#1C1613"
                          >
                            {ledVal}
                          </text>
                          <text
                            x={49}
                            y={spec.height / 2 + 4}
                            textAnchor="middle"
                            className="font-mono text-[11px] font-bold select-none"
                            fill={textColor}
                          >
                            {node.label}
                          </text>
                        </g>
                      ) : (
                        <text
                          x={spec.width / 2}
                          y={spec.height / 2 + 4}
                          textAnchor="middle"
                          className="font-mono text-[11px] font-bold select-none pointer-events-none"
                          fill={textColor}
                        >
                          {node.label}
                        </text>
                      )}

                      {/* Input Pins (left) */}
                      {spec.inputs.map((pin) => {
                        const val = evalResult.pinValues[`${node.id}:${pin.id}`] ?? 0;
                        return (
                          <g
                            key={pin.id}
                            data-pin="true"
                            onClick={(e) => handleInputPinClick(e, node.id, pin.id)}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={pin.xOffset}
                              cy={pin.yOffset}
                              r={wiringFrom ? 6.5 : 4.8}
                              fill={val === 1 ? '#C89216' : '#FAF8F4'}
                              stroke={wiringFrom ? '#C89216' : '#6E261A'}
                              strokeWidth={1.8}
                            />
                            {spec.inputs.length > 1 && (
                              <text
                                x={pin.xOffset + 8}
                                y={pin.yOffset + 3}
                                className="font-mono text-[8.5px] select-none pointer-events-none"
                                fill={spec.category === 'msi' ? '#D8CBB8' : '#61554D'}
                              >
                                {pin.label}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Output Pins (right) */}
                      {spec.outputs.map((pin) => {
                        const val = evalResult.pinValues[`${node.id}:${pin.id}`] ?? 0;
                        const isOrigin = wiringFrom?.nodeId === node.id && wiringFrom?.pinId === pin.id;
                        return (
                          <g
                            key={pin.id}
                            data-pin="true"
                            onClick={(e) => handleOutputPinClick(e, node.id, pin.id)}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={pin.xOffset}
                              cy={pin.yOffset}
                              r={isOrigin ? 6.8 : 5}
                              fill={isOrigin || val === 1 ? '#C89216' : '#6E261A'}
                              stroke="#FAF8F4"
                              strokeWidth={1.6}
                            />
                            {spec.outputs.length > 1 && (
                              <text
                                x={pin.xOffset - 9}
                                y={pin.yOffset + 3}
                                textAnchor="end"
                                className="font-mono text-[8.5px] select-none pointer-events-none"
                                fill={spec.category === 'msi' ? '#E0A92E' : '#61554D'}
                              >
                                {pin.label}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>

              {/* Bottom Selected Node / Preset Caption Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#F4EFE6] dark:bg-[#241D19] border-t border-[#E8E0D5] dark:border-[#352A24] text-xs">
                <span className="text-[#61554D] dark:text-[#A99B8E]">
                  {activePreset ? activePreset.subtitle : `${nodes.length} components · ${wires.length} wires`}
                </span>
                {selectedNode && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                      Selected: {selectedNode.label}
                    </span>
                    <button
                      type="button"
                      onClick={deleteSelectedNode}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FBEAE8] text-[#B83227]"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Below Canvas: Live GATE Function Inspector + Quick Universal Gate Counter */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* Live Truth Table & Canonical Minterms/Maxterms */}
            <div className="xl:col-span-7 bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[24px] p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Live GATE Function Inspector <span className="text-[#6E261A] dark:text-[#E0A92E]">(Auto 2ⁿ Truth Table)</span>
                </h3>
                {truthTable.supported && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]">
                    {truthTable.rows.length} rows
                  </span>
                )}
              </div>

              {truthTable.supported ? (
                <div className="space-y-3">
                  {/* Canonical Σm / ΠM / Minimized SOP Cards */}
                  <div className="grid grid-cols-1 gap-2">
                    {truthTable.summaries.map((sum) => (
                      <div
                        key={sum.nodeId}
                        data-testid={`dl-summary-${sum.label}`}
                        className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3 font-mono text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-[#6E261A] dark:text-[#E0A92E]">
                            Output {sum.label}({truthTable.inputLabels.join(', ')})
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E] border border-[#EED89A] font-bold">
                            SOP = {sum.minimizedSop}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#1C1613] dark:text-[#F5F0E8]">
                          Σm({sum.minterms.join(', ') || '∅'}) · ΠM({sum.maxterms.join(', ') || '∅'})
                        </div>
                        <div className="text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                          Minimal POS = {sum.minimizedPos}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Truth Table */}
                  <div className="overflow-x-auto max-h-60 overflow-y-auto rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520]">
                    <table className="w-full text-center font-mono text-xs">
                      <thead className="sticky top-0 bg-[#F4EFE6] dark:bg-[#241D19] text-[#6E261A] dark:text-[#E0A92E] border-b border-[#E8E0D5] dark:border-[#352A24]">
                        <tr>
                          <th className="px-2 py-1.5">m</th>
                          {truthTable.inputLabels.map((lbl) => (
                            <th key={lbl} className="px-2 py-1.5">{lbl}</th>
                          ))}
                          {truthTable.outputLabels.map((lbl) => (
                            <th key={lbl} className="px-2 py-1.5 bg-[#FDF6E3]/60 dark:bg-[#2C2215]">
                              {lbl}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {truthTable.rows.map((row) => {
                          const isCurrent = row.index === activeInputMask;
                          return (
                            <tr
                              key={row.index}
                              className={`border-b border-[#E8E0D5]/60 dark:border-[#2A221D] last:border-b-0 ${
                                isCurrent ? 'bg-[#FDF6E3] dark:bg-[#2C2215] font-bold' : ''
                              }`}
                            >
                              <td className="px-2 py-1 text-[#61554D] dark:text-[#A99B8E]">m{row.index}</td>
                              {row.inputs.map((b, i) => (
                                <td key={i} className="px-2 py-1">{b}</td>
                              ))}
                              {row.outputs.map((b, i) => (
                                <td
                                  key={i}
                                  className={`px-2 py-1 font-bold ${
                                    b === 1
                                      ? 'text-[#2E5E3E] dark:text-[#E0A92E]'
                                      : 'text-[#8C7E75]'
                                  }`}
                                >
                                  {b}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-4 text-xs text-[#61554D] dark:text-[#A99B8E]">
                  {truthTable.reason}
                </div>
              )}
            </div>

            {/* Quick Universal Gate (NAND / NOR) Counter */}
            <div className="xl:col-span-5 bg-[#241914] text-[#FAF8F4] rounded-[24px] p-4 sm:p-5 space-y-3.5 border border-[#3A2D25]">
              <div>
                <h3 className="text-sm font-bold text-[#FAF8F4]">
                  Universal Gate Counter <span className="text-[#E0A92E]">(2-Input NAND / NOR)</span>
                </h3>
                <p className="text-[11px] text-[#D8CBB8]">
                  Type any Boolean expression (up to 4 vars) for exact SOP/POS & NAND/NOR realization counts
                </p>
              </div>

              <input
                type="text"
                data-testid="dl-boolean-expr-input"
                value={boolExprInput}
                onChange={(e) => setBoolExprInput(e.target.value)}
                placeholder="e.g. A'B + AB' + C"
                className="w-full px-4 py-2 rounded-full font-mono text-sm bg-[#1A120E] border border-[#4A3A31] text-[#FAF8F4] focus:outline-none focus:border-[#E0A92E]"
              />

              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {[
                  { label: 'XOR', expr: "A'B + AB'" },
                  { label: 'XNOR', expr: "A'B' + AB" },
                  { label: '3-Var SOP', expr: "A'B + AB' + C" },
                  { label: 'FA Carry', expr: 'AB + BC + AC' },
                ].map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setBoolExprInput(ex.expr)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-[#3A2D25] hover:bg-[#6E261A] text-[#FAF8F4] shrink-0 whitespace-nowrap"
                  >
                    {ex.label}: {ex.expr}
                  </button>
                ))}
              </div>

              {boolAnalysis.ok ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div
                      data-testid="dl-nand-count"
                      className="rounded-[18px] bg-[#1A120E] border border-[#E0A92E]/40 p-3"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#E0A92E]">
                        Min 2-In NAND
                      </div>
                      <div className="font-mono text-2xl font-bold text-[#FAF8F4] tabular-nums mt-0.5">
                        {boolAnalysis.minNand2Count}
                      </div>
                      <div className="text-[10px] text-[#D8CBB8] mt-1 leading-snug">
                        {boolAnalysis.nandFormula}
                      </div>
                    </div>
                    <div
                      data-testid="dl-nor-count"
                      className="rounded-[18px] bg-[#1A120E] border border-[#9E3E2E]/50 p-3"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#E8A598]">
                        Min 2-In NOR
                      </div>
                      <div className="font-mono text-2xl font-bold text-[#FAF8F4] tabular-nums mt-0.5">
                        {boolAnalysis.minNor2Count}
                      </div>
                      <div className="text-[10px] text-[#D8CBB8] mt-1 leading-snug">
                        {boolAnalysis.norFormula}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[16px] bg-[#1A120E] border border-[#3A2D25] p-3 font-mono text-[11px] space-y-1">
                    <div>
                      <span className="text-[#E0A92E]">SOP:</span> {boolAnalysis.minimalSop}
                    </div>
                    <div>
                      <span className="text-[#E0A92E]">POS:</span> {boolAnalysis.minimalPos}
                    </div>
                    <div className="text-[#D8CBB8]">
                      Σm({boolAnalysis.minterms.join(', ') || '∅'}) · ΠM({boolAnalysis.maxterms.join(', ') || '∅'})
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[16px] bg-[#3A1E1B] px-3.5 py-2.5 text-xs text-[#F0948B]">
                  {boolAnalysis.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODE 2B: INTERACTIVE K-MAP MINIMIZER (2, 3, 4 VARIABLES)             */}
      {/* ==================================================================== */}
      {mode === 'kmap' && (
        <div data-testid="dl-kmap-view" className="space-y-4">
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Exact <span className="text-[#6E261A] dark:text-[#E0A92E]">K-Map & EPI Minimizer</span> (Quine-McCluskey)
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                  Click any Gray-code cell to cycle 0 → 1 → X · Supports wrap-around edges, corners & direct circuit synthesis
                </p>
              </div>
              {/* Variable Selector */}
              <div className="flex items-center gap-1 bg-[#F4EFE6] dark:bg-[#241D19] p-1 rounded-full border border-[#E8E0D5] dark:border-[#352A24]">
                {([2, 3, 4] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-testid={`kmap-vars-${v}`}
                    onClick={() => {
                      setKmapVars(v);
                      setKmapCells({});
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-all ${
                      kmapVars === v
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                        : 'text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {v}-Var
                  </button>
                ))}
              </div>
            </div>

            {/* Minterm Spec Bar + GATE Presets */}
            <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center">
              <div className="flex-1 flex items-center gap-2 bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#352A24] rounded-full px-3.5 py-1.5">
                <input
                  type="text"
                  data-testid="kmap-spec-input"
                  value={kmapSpecInput}
                  onChange={(e) => setKmapSpecInput(e.target.value)}
                  placeholder="Σm(0,1,2,5,7,8,9,10,14) + d(4,12)"
                  className="flex-1 min-w-0 bg-transparent font-mono text-xs text-[#1C1613] dark:text-[#F5F0E8] focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="kmap-apply-spec"
                  onClick={() => setKmapCells(parseMintermSpec(kmapSpecInput, kmapVars))}
                  className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#6E261A] text-[#FAF8F4] shrink-0"
                >
                  Apply
                </button>
              </div>
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => applyKmapPreset(4, 'Σm(0,1,2,5,7,8,9,10,14) + d(4,12)')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] shrink-0 whitespace-nowrap"
                >
                  4-Var + Don't-Cares
                </button>
                <button
                  type="button"
                  onClick={() => applyKmapPreset(4, 'Σm(0,2,8,10)')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] shrink-0 whitespace-nowrap"
                >
                  4-Corner Wrap
                </button>
                <button
                  type="button"
                  onClick={() => applyKmapPreset(3, 'Σm(0,2,4,5,6)')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] shrink-0 whitespace-nowrap"
                >
                  3-Var Wrap
                </button>
                <button
                  type="button"
                  onClick={() => setKmapCells({})}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FBEAE8] text-[#B83227] shrink-0 whitespace-nowrap"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* K-Map Grid + Results Split */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              {/* Interactive Gray-Code K-Map Matrix */}
              <div className="xl:col-span-6 flex flex-col items-center justify-center rounded-[24px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-4 sm:p-5">
                <div className="w-full max-w-[420px]">
                  <div
                    className="grid gap-2 items-center"
                    style={{
                      gridTemplateColumns: `54px repeat(${kmapLayout.colHeaders.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {/* Corner Label */}
                    <div className="text-center font-mono text-[11px] font-bold text-[#6E261A] dark:text-[#E0A92E]">
                      {kmapLayout.rowLabel} \ {kmapLayout.colLabel}
                    </div>
                    {kmapLayout.colHeaders.map((ch) => (
                      <div
                        key={ch}
                        className="text-center font-mono text-xs font-bold text-[#61554D] dark:text-[#A99B8E] py-1"
                      >
                        {ch}
                      </div>
                    ))}

                    {kmapLayout.grid.map((row, rIdx) => (
                      <React.Fragment key={rIdx}>
                        <div className="text-center font-mono text-xs font-bold text-[#61554D] dark:text-[#A99B8E]">
                          {kmapLayout.rowHeaders[rIdx]}
                        </div>
                        {row.map((mintermIdx) => {
                          const val = kmapCells[mintermIdx] ?? 0;
                          // Find which selected cover groups contain this cell
                          const coveringGroups = kmapSolution.selectedCover.filter((pi) =>
                            pi.allCoveredCells.includes(mintermIdx)
                          );
                          const hoveredPi = kmapSolution.allPrimeImplicants.find(
                            (p) => p.id === hoveredPiId
                          );
                          const isHoveredMatch = hoveredPi
                            ? hoveredPi.allCoveredCells.includes(mintermIdx)
                            : false;

                          const primaryGroup = coveringGroups[0];
                          const groupStyle = primaryGroup
                            ? KMAP_GROUP_STYLES[primaryGroup.colorIndex % KMAP_GROUP_STYLES.length]
                            : null;

                          return (
                            <button
                              key={mintermIdx}
                              type="button"
                              data-testid={`kmap-cell-${mintermIdx}`}
                              onClick={() => cycleKmapCell(mintermIdx)}
                              style={{
                                borderColor: isHoveredMatch
                                  ? '#C89216'
                                  : groupStyle
                                  ? groupStyle.stroke
                                  : undefined,
                                backgroundColor: isHoveredMatch
                                  ? 'rgba(200, 146, 22, 0.28)'
                                  : groupStyle
                                  ? groupStyle.fill
                                  : undefined,
                              }}
                              className={`relative aspect-square rounded-[18px] border-2 flex flex-col items-center justify-center transition-all hover:scale-[1.03] active:scale-[0.97] ${
                                !groupStyle
                                  ? 'bg-white dark:bg-[#1C1714] border-[#E8E0D5] dark:border-[#352A24]'
                                  : ''
                              }`}
                            >
                              <span className="absolute top-1.5 left-2 font-mono text-[9px] text-[#8C7E75]">
                                m{mintermIdx}
                              </span>
                              {/* Multi-group warm color dots for overlapping/wrap-around groups */}
                              {coveringGroups.length > 0 && (
                                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                                  {coveringGroups.slice(0, 3).map((g) => (
                                    <span
                                      key={g.id}
                                      className="w-2 h-2 rounded-full"
                                      style={{
                                        backgroundColor:
                                          KMAP_GROUP_STYLES[g.colorIndex % KMAP_GROUP_STYLES.length].stroke,
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                              <span
                                className={`font-mono text-xl font-bold ${
                                  val === 1
                                    ? 'text-[#6E261A] dark:text-[#E0A92E]'
                                    : val === 'X'
                                    ? 'text-[#C89216]'
                                    : 'text-[#A99B8E] dark:text-[#61554D]'
                                }`}
                              >
                                {val}
                              </span>
                            </button>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Selected Group Legend */}
                {kmapSolution.selectedCover.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
                    {kmapSolution.selectedCover.map((g) => {
                      const st = KMAP_GROUP_STYLES[g.colorIndex % KMAP_GROUP_STYLES.length];
                      return (
                        <span
                          key={g.id}
                          onMouseEnter={() => setHoveredPiId(g.id)}
                          onMouseLeave={() => setHoveredPiId(null)}
                          className={`px-2.5 py-1 rounded-full font-mono text-[11px] font-bold cursor-pointer ${st.badge}`}
                        >
                          {g.expression} ({g.allCoveredCells.join(',')})
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right 6 cols: PI / EPI / SOP / POS + Load into Circuit Workbench */}
              <div className="xl:col-span-6 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-[20px] bg-[#241914] text-[#FAF8F4] p-4 border border-[#3A2D25]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#E0A92E]">
                      Minimal SOP
                    </div>
                    <div
                      data-testid="kmap-minimal-sop"
                      className="font-mono text-base font-bold mt-1 break-words"
                    >
                      F = {kmapSolution.minimalSop}
                    </div>
                  </div>
                  <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#161210] p-4 border border-[#E8E0D5] dark:border-[#2E2520]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
                      Minimal POS
                    </div>
                    <div
                      data-testid="kmap-minimal-pos"
                      className="font-mono text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] mt-1 break-words"
                    >
                      F = {kmapSolution.minimalPos}
                    </div>
                  </div>
                </div>

                {/* Essential Prime Implicants (EPI) */}
                <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                      Essential Prime Implicants (EPI)
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#2E5E3E] dark:text-[#7BB88F]">
                      {kmapSolution.essentialPrimeImplicants.length} EPI
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {kmapSolution.essentialPrimeImplicants.length === 0 ? (
                      <span className="text-xs text-[#61554D]">No EPI (cyclic cover or constant)</span>
                    ) : (
                      kmapSolution.essentialPrimeImplicants.map((pi) => (
                        <span
                          key={pi.id}
                          onMouseEnter={() => setHoveredPiId(pi.id)}
                          onMouseLeave={() => setHoveredPiId(null)}
                          className="px-2.5 py-1 rounded-full font-mono text-xs font-bold bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] border border-[#2E5E3E]/25 cursor-pointer"
                        >
                          {pi.expression} · [{pi.minterms.join(',')}]
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* All Prime Implicants (PI) */}
                <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                      All Prime Implicants (PI) — hover to highlight cells
                    </span>
                    <span className="font-mono text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                      {kmapSolution.allPrimeImplicants.length} PI
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {kmapSolution.allPrimeImplicants.length === 0 ? (
                      <span className="text-xs text-[#61554D]">Click cells to mark minterms (1)</span>
                    ) : (
                      kmapSolution.allPrimeImplicants.map((pi) => (
                        <span
                          key={pi.id}
                          onMouseEnter={() => setHoveredPiId(pi.id)}
                          onMouseLeave={() => setHoveredPiId(null)}
                          className="px-2.5 py-1 rounded-full font-mono text-xs bg-white dark:bg-[#1C1714] text-[#1C1613] dark:text-[#F5F0E8] border border-[#E8E0D5] dark:border-[#352A24] hover:border-[#C89216] cursor-pointer"
                        >
                          {pi.expression} ({pi.bits})
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Synthesize & Load into Circuit Workbench CTA */}
                <button
                  type="button"
                  data-testid="kmap-load-circuit-btn"
                  onClick={handleLoadKmapIntoCircuit}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-xs sm:text-sm font-bold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-[#FAF8F4] shadow-sm transition-transform active:scale-[0.98]"
                >
                  <Layers className="w-4 h-4" />
                  Load Minimal SOP into Circuit Workbench
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODE 2C: SEQUENTIAL CIRCUITS, FLIP-FLOPS & COUNTER LAB               */}
      {/* ==================================================================== */}
      {mode === 'sequential' && (
        <div data-testid="dl-sequential-view" className="space-y-4">
          {/* Section 1: Interactive SR / JK / D / T Flip-Flop Simulator */}
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Flip-Flop <span className="text-[#6E261A] dark:text-[#E0A92E]">Clock-Edge Simulator</span>
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                  Toggle inputs & fire the tactile Clock Pulse to trace Q(t) → Q(t+1) with GATE Excitation Tables
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {(['SR', 'JK', 'D', 'T'] as FlipFlopType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    data-testid={`ff-type-${t}`}
                    onClick={() => {
                      setFfType(t);
                      setFfHistory([]);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold border transition-all ${
                      ffType === t
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] border-[#6E261A]'
                        : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352A24]'
                    }`}
                  >
                    {t} FF
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Interactive Flip-Flop Block & Controls */}
              <div className="lg:col-span-7 rounded-[22px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFfClockEdge('rising')}
                      className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold border ${
                        ffClockEdge === 'rising'
                          ? 'bg-[#FDF6E3] text-[#8B6209] border-[#C89216]'
                          : 'bg-white dark:bg-[#1C1714] text-[#61554D] border-[#E8E0D5] dark:border-[#352A24]'
                      }`}
                    >
                      ↑ Rising Edge
                    </button>
                    <button
                      type="button"
                      onClick={() => setFfClockEdge('falling')}
                      className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold border ${
                        ffClockEdge === 'falling'
                          ? 'bg-[#FDF6E3] text-[#8B6209] border-[#C89216]'
                          : 'bg-white dark:bg-[#1C1714] text-[#61554D] border-[#E8E0D5] dark:border-[#352A24]'
                      }`}
                    >
                      ↓ Falling Edge
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFfQ(0);
                      setFfHistory([]);
                    }}
                    className="text-xs font-semibold text-[#61554D] hover:text-[#6E261A]"
                  >
                    Reset Q=0
                  </button>
                </div>

                {/* Live Interactive Schematic Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#1C1714] rounded-[20px] p-4 border border-[#E8E0D5] dark:border-[#2E2520]">
                  {/* Inputs */}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setFfIn1((v) => (v ? 0 : 1))}
                      className={`px-4 py-2 rounded-full font-mono text-xs font-bold border transition-all ${
                        ffIn1 === 1
                          ? 'bg-[#FDF6E3] border-[#C89216] text-[#1C1613]'
                          : 'bg-[#F4EFE6] dark:bg-[#241D19] border-[#E8E0D5] text-[#61554D]'
                      }`}
                    >
                      {FLIP_FLOP_META[ffType].inputs[0]} = {ffIn1}
                    </button>
                    {FLIP_FLOP_META[ffType].inputs[1] && (
                      <button
                        type="button"
                        onClick={() => setFfIn2((v) => (v ? 0 : 1))}
                        className={`px-4 py-2 rounded-full font-mono text-xs font-bold border transition-all ${
                          ffIn2 === 1
                            ? 'bg-[#FDF6E3] border-[#C89216] text-[#1C1613]'
                            : 'bg-[#F4EFE6] dark:bg-[#241D19] border-[#E8E0D5] text-[#61554D]'
                        }`}
                      >
                        {FLIP_FLOP_META[ffType].inputs[1]} = {ffIn2}
                      </button>
                    )}
                  </div>

                  {/* Center Flip-Flop Block + Clock Pulse Button */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="px-6 py-4 rounded-[20px] bg-[#241914] text-[#FAF8F4] text-center border-2 border-[#6E261A] min-w-[130px]">
                      <div className="font-mono text-sm font-bold text-[#E0A92E]">{ffType} FF</div>
                      <div className="text-[10px] font-mono text-[#D8CBB8] mt-0.5">
                        {ffClockEdge === 'rising' ? 'CLK ↑' : 'CLK ↓'}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="ff-clock-pulse-btn"
                      onClick={handleClockPulse}
                      className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-[#FAF8F4] shadow-sm transition-transform active:scale-[0.96]"
                    >
                      <Zap className="w-3.5 h-3.5 text-[#E0A92E]" />
                      Clock Pulse
                    </button>
                  </div>

                  {/* Outputs Q & Q' */}
                  <div className="flex flex-col gap-2">
                    <div
                      data-testid="ff-q-readout"
                      className={`px-4 py-2 rounded-full font-mono text-xs font-bold border text-center ${
                        ffQ === 1
                          ? 'bg-[#2E5E3E] text-[#FAF8F4] border-[#2E5E3E]'
                          : 'bg-[#F4EFE6] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5]'
                      }`}
                    >
                      Q = {ffQ}
                    </div>
                    <div className="px-4 py-2 rounded-full font-mono text-xs font-bold bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] border border-[#E8E0D5] dark:border-[#352A24] text-center">
                      Q' = {ffQ ? 0 : 1}
                    </div>
                  </div>
                </div>

                {/* Waveform Pulse History Strip */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                    Clock Pulse Trace ({ffHistory.length} pulses)
                  </div>
                  <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {ffHistory.length === 0 ? (
                      <span className="text-xs text-[#61554D]">
                        Click "Clock Pulse" to record Q(t) → Q(t+1) transitions.
                      </span>
                    ) : (
                      ffHistory.map((h) => (
                        <div
                          key={h.pulse}
                          className={`px-2.5 py-1.5 rounded-[14px] font-mono text-[11px] border shrink-0 whitespace-nowrap ${
                            h.invalid
                              ? 'bg-[#FBEAE8] border-[#B83227] text-[#B83227]'
                              : 'bg-white dark:bg-[#1C1714] border-[#E8E0D5] dark:border-[#352A24] text-[#1C1613] dark:text-[#F5F0E8]'
                          }`}
                        >
                          <strong>#{h.pulse}</strong> {h.qPrev}→{h.qNext}{' '}
                          <span className="text-[10px] opacity-80">({h.action.split(' ')[0]})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right 5 cols: Characteristic Eq & Excitation Table */}
              <div className="lg:col-span-5 space-y-3">
                <div className="rounded-[20px] bg-[#241914] text-[#FAF8F4] p-4 border border-[#3A2D25]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#E0A92E]">
                    Characteristic Equation
                  </div>
                  <div className="font-mono text-xs sm:text-sm font-bold mt-1">
                    {FLIP_FLOP_META[ffType].characteristicEq}
                  </div>
                  <p className="text-[11px] text-[#D8CBB8] mt-2 leading-relaxed">
                    {FLIP_FLOP_META[ffType].gateNote}
                  </p>
                </div>

                <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] overflow-hidden">
                  <div className="px-3.5 py-2 bg-[#F4EFE6] dark:bg-[#241D19] text-xs font-bold text-[#6E261A] dark:text-[#E0A92E] border-b border-[#E8E0D5] dark:border-[#352A24]">
                    GATE Excitation Table ({ffType})
                  </div>
                  <table className="w-full text-center font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E]">
                        <th className="py-1.5">Q(t)</th>
                        <th className="py-1.5">Q(t+1)</th>
                        <th className="py-1.5">Required Inputs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FLIP_FLOP_META[ffType].excitationRows.map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-[#E8E0D5]/60 dark:border-[#2A221D] last:border-b-0"
                        >
                          <td className="py-1.5">{r.q}</td>
                          <td className="py-1.5 font-bold text-[#6E261A] dark:text-[#E0A92E]">{r.qNext}</td>
                          <td className="py-1.5 font-bold">{r.inputs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Interactive Synchronous / Ripple Counter & Lockout Lab */}
          <div className="bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] rounded-[28px] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#1C1613] dark:text-[#F5F0E8]">
                  Counter & <span className="text-[#6E261A] dark:text-[#E0A92E]">Lockout State Diagram</span> Lab
                </h2>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                  {counterPreset.description} · Click any state node to test recovery vs lockout trap!
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="counter-step-btn"
                  onClick={handleStepCounter}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-[#FAF8F4] transition-transform active:scale-[0.97]"
                >
                  <Zap className="w-3.5 h-3.5 text-[#E0A92E]" />
                  Step Clock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCounterState(counterPreset.initialState);
                    setCounterStepCount(0);
                  }}
                  className="px-3.5 py-2 rounded-full text-xs font-semibold bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24]"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Counter Presets Rail */}
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mx-1">
              {GATE_COUNTER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`counter-preset-${p.id}`}
                  onClick={() => handleSelectCounterPreset(p)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 whitespace-nowrap transition-all ${
                    counterPreset.id === p.id
                      ? 'bg-[#241914] dark:bg-[#E0A92E] text-[#FAF8F4] dark:text-[#1C1613] border-[#241914]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] text-[#1C1613] dark:text-[#F5F0E8] border-[#E8E0D5] dark:border-[#352A24]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                <div className="text-[10px] font-bold uppercase text-[#61554D] dark:text-[#A99B8E]">
                  Current State (CLK #{counterStepCount})
                </div>
                <div
                  data-testid="counter-current-state"
                  className="font-mono text-lg font-bold text-[#6E261A] dark:text-[#E0A92E] tabular-nums mt-0.5"
                >
                  {formatBits(counterState, counterPreset.bits)} ({counterState})
                </div>
              </div>
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                <div className="text-[10px] font-bold uppercase text-[#61554D] dark:text-[#A99B8E]">
                  Modulus & Output Freq
                </div>
                <div
                  data-testid="counter-modulus"
                  className="font-mono text-lg font-bold text-[#1C1613] dark:text-[#F5F0E8] tabular-nums mt-0.5"
                >
                  MOD-{counterAnalysis.modulus}{' '}
                  <span className="text-xs font-normal text-[#61554D]">({counterAnalysis.outputFreqLabel})</span>
                </div>
              </div>
              <div
                data-testid="counter-lockout-status"
                className={`rounded-[18px] border p-3 ${
                  counterAnalysis.isSelfStarting
                    ? 'bg-[#EBF5EE] dark:bg-[#152B1D] border-[#2E5E3E]/25 text-[#2E5E3E] dark:text-[#7BB88F]'
                    : 'bg-[#FBEAE8] dark:bg-[#3A1E1B] border-[#B83227]/30 text-[#B83227] dark:text-[#F0948B]'
                }`}
              >
                <div className="text-[10px] font-bold uppercase">Lockout / Self-Start</div>
                <div className="flex items-center gap-1.5 font-mono text-sm font-bold mt-1">
                  {counterAnalysis.isSelfStarting ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" /> Self-Starting ✓
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 shrink-0" /> Lockout ({counterAnalysis.lockoutStates.length} states)
                    </>
                  )}
                </div>
              </div>
              <div className="rounded-[18px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
                <div className="text-[10px] font-bold uppercase text-[#61554D] dark:text-[#A99B8E]">
                  Unused States
                </div>
                <div className="font-mono text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8] mt-1 truncate">
                  {counterAnalysis.unusedStates.length === 0
                    ? 'None (Full MOD-2ⁿ)'
                    : counterAnalysis.unusedStates
                        .slice(0, 6)
                        .map((s) => formatBits(s, counterPreset.bits))
                        .join(', ') + (counterAnalysis.unusedStates.length > 6 ? '...' : '')}
                </div>
              </div>
            </div>

            {/* Live SVG State Transition Diagram */}
            <div className="rounded-[24px] bg-[#FAF8F4] dark:bg-[#161210] border border-[#E8E0D5] dark:border-[#2E2520] p-3">
              <svg
                viewBox="0 0 600 260"
                data-no-swipe="true"
                data-interactive-svg="true"
                className="w-full h-[230px] sm:h-[260px] select-none"
              >
                <defs>
                  <marker
                    id="cnt-arrow-main"
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#6E261A" />
                  </marker>
                  <marker
                    id="cnt-arrow-lockout"
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#B83227" />
                  </marker>
                  <marker
                    id="cnt-arrow-recover"
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#2E5E3E" />
                  </marker>
                </defs>

                {(() => {
                  // Position mainCycle on a crisp circle on the left-center, unused/lockout states on the right
                  const main = counterAnalysis.mainCycle;
                  const extras = counterAnalysis.unusedStates.slice(0, 6);
                  const pos = new Map<number, { x: number; y: number }>();

                  const cx = extras.length > 0 ? 225 : 300;
                  const cy = 132;
                  const rad = main.length <= 4 ? 78 : 92;
                  main.forEach((s, i) => {
                    const angle = -Math.PI / 2 + (2 * Math.PI * i) / main.length;
                    pos.set(s, {
                      x: Math.round(cx + rad * Math.cos(angle)),
                      y: Math.round(cy + rad * Math.sin(angle)),
                    });
                  });

                  extras.forEach((s, i) => {
                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    pos.set(s, {
                      x: 450 + col * 86,
                      y: 66 + row * 68,
                    });
                  });

                  const drawnStates = [...main, ...extras];
                  const lockoutSet = new Set(counterAnalysis.lockoutStates);
                  const mainSet = new Set(main);

                  return (
                    <>
                      {/* Section labels */}
                      <text x={cx} y={20} textAnchor="middle" className="font-mono text-[10px] font-bold" fill="#6E261A">
                        MAIN CYCLE (MOD-{counterAnalysis.modulus})
                      </text>
                      {extras.length > 0 && (
                        <text x={492} y={20} textAnchor="middle" className="font-mono text-[10px] font-bold" fill={counterAnalysis.isSelfStarting ? '#2E5E3E' : '#B83227'}>
                          {counterAnalysis.isSelfStarting ? 'SELF-STARTING RECOVERY' : 'UNUSED / LOCKOUT STATES'}
                        </text>
                      )}

                      {/* Transition Arrows */}
                      {drawnStates.map((s) => {
                        const nxt = counterAnalysis.nextStateMap[s];
                        const p1 = pos.get(s);
                        const p2 = pos.get(nxt);
                        if (!p1 || !p2) return null;
                        const isMainEdge = mainSet.has(s) && mainSet.has(nxt);
                        const isLockout = lockoutSet.has(s);
                        const stroke = isMainEdge ? '#6E261A' : isLockout ? '#B83227' : '#2E5E3E';
                        const marker = isMainEdge
                          ? 'url(#cnt-arrow-main)'
                          : isLockout
                          ? 'url(#cnt-arrow-lockout)'
                          : 'url(#cnt-arrow-recover)';

                        if (s === nxt) {
                          return (
                            <path
                              key={`e-${s}`}
                              d={`M ${p1.x - 8} ${p1.y - 20} C ${p1.x - 28} ${p1.y - 54}, ${p1.x + 28} ${p1.y - 54}, ${p1.x + 8} ${p1.y - 20}`}
                              fill="none"
                              stroke={stroke}
                              strokeWidth={1.8}
                              markerEnd={marker}
                            />
                          );
                        }

                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const dist = Math.max(1, Math.hypot(dx, dy));
                        const ux = dx / dist;
                        const uy = dy / dist;
                        const hasBack = counterAnalysis.nextStateMap[nxt] === s;
                        const bend = hasBack ? 18 : 0;
                        const nx = -uy;
                        const ny = ux;
                        const sx = p1.x + ux * 22;
                        const sy = p1.y + uy * 22;
                        const ex = p2.x - ux * 25;
                        const ey = p2.y - uy * 25;
                        const mx = (sx + ex) / 2 + nx * bend;
                        const my = (sy + ey) / 2 + ny * bend;

                        return (
                          <path
                            key={`e-${s}`}
                            d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
                            fill="none"
                            stroke={stroke}
                            strokeWidth={isMainEdge ? 2.1 : 1.7}
                            strokeDasharray={isMainEdge ? undefined : '4 3'}
                            markerEnd={marker}
                          />
                        );
                      })}

                      {/* State Nodes */}
                      {drawnStates.map((s) => {
                        const pt = pos.get(s)!;
                        const isActive = counterState === s;
                        const isLock = lockoutSet.has(s);
                        return (
                          <g
                            key={`n-${s}`}
                            onClick={() => setCounterState(s)}
                            className="cursor-pointer"
                          >
                            <title>Click to jump counter into state {formatBits(s, counterPreset.bits)}</title>
                            {isActive && <circle cx={pt.x} cy={pt.y} r={28} fill="#C89216" opacity={0.28} />}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={21}
                              fill={isActive ? '#FDF6E3' : isLock ? '#FBEAE8' : '#FFFFFF'}
                              stroke={isActive ? '#C89216' : isLock ? '#B83227' : '#6E261A'}
                              strokeWidth={isActive ? 3.2 : 2}
                            />
                            <text
                              x={pt.x}
                              y={pt.y + 4}
                              textAnchor="middle"
                              className="font-mono text-[11px] font-bold select-none"
                              fill={isLock && !isActive ? '#B83227' : '#1C1613'}
                            >
                              {formatBits(s, counterPreset.bits)}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>

            {/* Custom State Sequence Builder */}
            <form
              onSubmit={handleApplyCustomCounter}
              className="flex flex-wrap items-center gap-2 rounded-[18px] bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] p-3"
            >
              <span className="text-xs font-bold text-[#6E261A] dark:text-[#E0A92E]">Custom Sequence:</span>
              <select
                value={customSeqBits}
                onChange={(e) => setCustomSeqBits(Number(e.target.value) as 2 | 3 | 4)}
                className="px-2.5 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
              >
                <option value={2}>2-bit (0..3)</option>
                <option value={3}>3-bit (0..7)</option>
                <option value={4}>4-bit (0..15)</option>
              </select>
              <input
                type="text"
                value={customSeqText}
                onChange={(e) => setCustomSeqText(e.target.value)}
                placeholder="e.g. 0, 2, 4, 6"
                className="flex-1 min-w-[140px] px-3 py-1 rounded-full text-xs font-mono bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24]"
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-[#1C1613] dark:text-[#F5F0E8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={customSelfStarting}
                  onChange={(e) => setCustomSelfStarting(e.target.checked)}
                />
                Self-Starting
              </label>
              <button
                type="submit"
                className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#6E261A] text-[#FAF8F4]"
              >
                Build Counter
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
