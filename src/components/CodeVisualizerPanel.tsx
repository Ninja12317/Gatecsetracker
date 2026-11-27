import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Sparkles,
  Terminal,
  GitBranch,
  Cpu,
  ZoomIn,
  ZoomOut,
  Table2,
  Code2,
  FastForward,
  AlertCircle,
} from 'lucide-react';
import type {
  CodeFlowchartGraph,
  CodeVisualizationResult,
  DryRunTraceTable,
  FlowchartNode,
  Question,
} from '../types';
import {
  GATE_C_PRESETS,
  convertFramesToTraceTable,
  executeCCodeLocally,
  extractCodeFromPyq,
} from '../utils/cCodeInterpreter';

interface CodeVisualizerPanelProps {
  questionId: string;
  activeQuestion?: Question | null;
  onCopyTraceToTable?: (table: DryRunTraceTable) => void;
  compact?: boolean;
}

interface PositionedNode {
  node: FlowchartNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutGraphNodes(graph: CodeFlowchartGraph): {
  positioned: PositionedNode[];
  width: number;
  height: number;
} {
  const nodes = graph.nodes;
  if (nodes.length === 0) return { positioned: [], width: 420, height: 220 };

  if (graph.mode === 'recursion_tree') {
    // Hierarchical BFS tree layout
    const childrenMap = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of graph.edges) {
      const list = childrenMap.get(e.from) ?? [];
      if (!list.includes(e.to)) list.push(e.to);
      childrenMap.set(e.from, list);
      hasParent.add(e.to);
    }

    const roots = nodes.filter((n) => !hasParent.has(n.id));
    const rootId = (roots[0] ?? nodes[0]).id;

    const levels: string[][] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
    visited.add(rootId);

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push(id);
      for (const child of childrenMap.get(id) ?? []) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push({ id: child, depth: depth + 1 });
        }
      }
    }
    // Append any disconnected nodes safely
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        const lastIdx = Math.max(0, levels.length - 1);
        if (!levels[lastIdx]) levels[lastIdx] = [];
        levels[lastIdx].push(n.id);
      }
    }

    const nodeW = 128;
    const nodeH = 44;
    const gapX = 24;
    const gapY = 66;
    const maxRowLen = Math.max(1, ...levels.map((l) => l.length));
    const totalW = Math.max(460, maxRowLen * (nodeW + gapX) + 48);
    const totalH = Math.max(240, levels.length * (nodeH + gapY) + 48);

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const positioned: PositionedNode[] = [];

    levels.forEach((rowIds, depth) => {
      const rowW = rowIds.length * nodeW + Math.max(0, rowIds.length - 1) * gapX;
      const startX = (totalW - rowW) / 2;
      rowIds.forEach((id, idx) => {
        const nd = nodeById.get(id);
        if (!nd) return;
        positioned.push({
          node: nd,
          x: startX + idx * (nodeW + gapX) + nodeW / 2,
          y: 36 + depth * (nodeH + gapY) + nodeH / 2,
          w: nodeW,
          h: nodeH,
        });
      });
    });

    return { positioned, width: totalW, height: totalH };
  }

  // Flowchart vertical snake / centered column layout
  const nodeW = 176;
  const nodeH = 44;
  const gapY = 34;
  const cols = nodes.length > 8 ? 2 : 1;
  const perCol = Math.ceil(nodes.length / cols);
  const colSpacing = 240;
  const totalW = cols === 1 ? 420 : cols * colSpacing + 120;
  const totalH = Math.max(260, perCol * (nodeH + gapY) + 56);

  const positioned: PositionedNode[] = nodes.map((node, idx) => {
    const colIdx = Math.floor(idx / perCol);
    const rowIdx = idx % perCol;
    const x =
      cols === 1
        ? totalW / 2
        : 120 + colIdx * colSpacing;
    const y = 38 + rowIdx * (nodeH + gapY) + nodeH / 2;
    return { node, x, y, w: nodeW, h: nodeH };
  });

  return { positioned, width: totalW, height: totalH };
}

export const CodeVisualizerPanel: React.FC<CodeVisualizerPanelProps> = ({
  questionId,
  activeQuestion,
  onCopyTraceToTable,
  compact = false,
}) => {
  const [code, setCode] = useState<string>(GATE_C_PRESETS[0].code);
  const [result, setResult] = useState<CodeVisualizationResult | null>(() =>
    executeCCodeLocally(GATE_C_PRESETS[0].code)
  );
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiNotice, setAiNotice] = useState<string>('');
  const [copiedBanner, setCopiedBanner] = useState<boolean>(false);

  // Interactive SVG Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number }>({
    active: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
  });

  const pyqCode = useMemo(() => extractCodeFromPyq(activeQuestion), [activeQuestion]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying || !result || result.frames.length === 0) return;
    const delayMs = speed === 2 ? 320 : speed === 0.5 ? 1150 : 650;
    const timer = window.setInterval(() => {
      setCurrentStepIdx((prev) => {
        if (prev >= result.frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delayMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed, result]);

  const handleRunLocal = (codeToRun = code) => {
    setIsPlaying(false);
    setAiNotice('');
    const res = executeCCodeLocally(codeToRun);
    setResult(res);
    setCurrentStepIdx(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleRunDeepAi = async () => {
    if (aiLoading) return;
    setIsPlaying(false);
    setAiLoading(true);
    setAiNotice('');
    try {
      const resp = await fetch('/api/visualize-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: 'c' }),
      });
      const data = (await resp.json()) as CodeVisualizationResult;
      if (data.ok && Array.isArray(data.frames) && data.frames.length > 0) {
        setResult(data);
        setCurrentStepIdx(0);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setAiNotice(`Deep AI Trace · ${data.frames.length} steps`);
      } else {
        setAiNotice(data.error || 'Deep AI Trace unavailable · Running Built-in Interpreter.');
      }
    } catch {
      setAiNotice('Offline · Using Built-in Interpreter.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleLoadFromPyq = () => {
    if (!pyqCode) return;
    setCode(pyqCode);
    handleRunLocal(pyqCode);
  };

  const handleCopyToTable = () => {
    if (!result || result.frames.length === 0 || !onCopyTraceToTable) return;
    const table = convertFramesToTraceTable(questionId, result.frames);
    onCopyTraceToTable(table);
    setCopiedBanner(true);
    window.setTimeout(() => setCopiedBanner(false), 1800);
  };

  const activeFrame = result && result.frames.length > 0
    ? result.frames[Math.min(currentStepIdx, result.frames.length - 1)]
    : null;

  const codeLines = useMemo(() => code.replace(/\r\n/g, '\n').split('\n'), [code]);

  const layout = useMemo(
    () =>
      result
        ? layoutGraphNodes(result.flowchart)
        : { positioned: [], width: 420, height: 220 },
    [result]
  );

  const posById = useMemo(
    () => new Map(layout.positioned.map((p) => [p.node.id, p])),
    [layout.positioned]
  );

  // Determine visited node IDs up to current step for traversed edge highlighting
  const visitedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!result) return set;
    for (let i = 0; i <= currentStepIdx && i < result.frames.length; i++) {
      set.add(result.frames[i].activeNodeId);
    }
    return set;
  }, [result, currentStepIdx]);

  const handleNodeClick = (node: FlowchartNode) => {
    if (!result || result.frames.length === 0) return;
    setIsPlaying(false);
    const matchingStep = node.stepRefs[0];
    if (typeof matchingStep === 'number' && matchingStep >= 1 && matchingStep <= result.frames.length) {
      setCurrentStepIdx(matchingStep - 1);
      return;
    }
    const idxByNode = result.frames.findIndex((f) => f.activeNodeId === node.id);
    if (idxByNode >= 0) {
      setCurrentStepIdx(idxByNode);
      return;
    }
    const idxByLine = result.frames.findIndex((f) => f.line === node.line);
    if (idxByLine >= 0) setCurrentStepIdx(idxByLine);
  };

  return (
    <div
      data-testid="code-visualizer-panel"
      className="rounded-[22px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5 sm:p-4 space-y-3.5"
    >
      {/* Top Bar: Presets + Load Code from Current PYQ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
          <span className="font-display text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
            Code Run &amp; Flowchart Visualizer
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {pyqCode && (
            <button
              type="button"
              onClick={handleLoadFromPyq}
              data-testid="load-code-from-pyq-btn"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-[10px] font-semibold press-tactile"
            >
              <Code2 className="h-3 w-3" />
              Load Code from Current PYQ
            </button>
          )}
          {GATE_C_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setCode(preset.code);
                handleRunLocal(preset.code);
              }}
              className="px-2.5 py-1 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] text-[10px] font-semibold text-[#61554D] dark:text-[#D8CBB8] press-tactile"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Warm Dark Cocoa Code Editor + Active-Line Gold Highlight */}
      <div className="rounded-[18px] overflow-hidden border border-[#352A24] bg-[#1E1815] text-[#F5EFE6]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[#322823] bg-[#241D19]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#D4C5B2]">
            C / GATE Pseudocode Editor
            {activeFrame ? ` · Executing Line ${activeFrame.line}` : ''}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleRunLocal()}
              data-testid="run-local-code-btn"
              className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-[#C89216] hover:bg-[#B28012] text-[#1C1613] text-[11px] font-bold press-tactile"
            >
              <Play className="h-3 w-3 fill-current" />
              Run Code
            </button>
            <button
              type="button"
              onClick={() => void handleRunDeepAi()}
              disabled={aiLoading}
              data-testid="run-deep-ai-trace-btn"
              className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-[#C89216]/60 bg-[#2E231D] hover:bg-[#3A2C24] text-[#F0C869] text-[11px] font-semibold disabled:opacity-50 press-tactile"
            >
              <Sparkles className={`h-3 w-3 ${aiLoading ? 'animate-spin' : ''}`} />
              {aiLoading ? 'Tracing...' : 'Deep Trace (AI)'}
            </button>
          </div>
        </div>

        {/* Synchronized Editor & Line-Highlight View */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#322823]">
          {/* Editable Code Textarea */}
          <div className="relative">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              aria-label="C code editor"
              rows={compact ? 9 : 11}
              className="w-full h-full min-h-[175px] bg-[#1E1815] text-[#F5EFE6] font-mono text-xs leading-5 p-3 focus:outline-none resize-y"
            />
          </div>

          {/* Live Line-Numbered Active-Line Highlighter */}
          <div className="max-h-[240px] overflow-y-auto bg-[#181310] py-2 font-mono text-[11px] leading-5">
            {codeLines.map((ln, idx) => {
              const lineNo = idx + 1;
              const isActiveLine = activeFrame?.line === lineNo;
              return (
                <div
                  key={`ln-${lineNo}`}
                  data-active-line={isActiveLine ? 'true' : undefined}
                  className={`flex items-start px-2.5 transition-colors ${
                    isActiveLine
                      ? 'bg-[#C89216]/25 text-[#FFF7E0] border-l-2 border-[#E0A92E]'
                      : 'text-[#C8B9A6] border-l-2 border-transparent'
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 select-none text-right pr-2 tabular-nums ${
                      isActiveLine ? 'text-[#E0A92E] font-bold' : 'text-[#6E5F55]'
                    }`}
                  >
                    {lineNo}
                  </span>
                  <span className="whitespace-pre-wrap break-all">{ln || ' '}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error / AI Status Banner */}
      {result && !result.ok && result.error && (
        <div className="rounded-[14px] border border-[#E6B8B3] dark:border-[#6E2D26] bg-[#FBEAE8] dark:bg-[#3A1E1B] px-3 py-2 text-xs text-[#8E2219] dark:text-[#F08A80] flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}
      {aiNotice && (
        <div className="rounded-[14px] border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] px-3 py-1.5 text-[11px] font-medium text-[#8B6209] dark:text-[#E0A92E]">
          {aiNotice}
        </div>
      )}

      {/* Playback Controls + Copy Trace to Table */}
      {result && result.frames.length > 0 && (
        <div className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentStepIdx((i) => Math.max(0, i - 1));
              }}
              disabled={currentStepIdx === 0}
              data-testid="step-back-btn"
              aria-label="Step Back"
              className="h-8 px-2.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] disabled:opacity-40 inline-flex items-center gap-1 press-tactile"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentStepIdx >= result.frames.length - 1) setCurrentStepIdx(0);
                setIsPlaying((p) => !p);
              }}
              data-testid="play-pause-trace-btn"
              className="h-8 px-3.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold inline-flex items-center gap-1.5 press-tactile"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentStepIdx((i) => Math.min(result.frames.length - 1, i + 1));
              }}
              disabled={currentStepIdx >= result.frames.length - 1}
              data-testid="step-next-btn"
              aria-label="Step Next"
              className="h-8 px-2.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] disabled:opacity-40 inline-flex items-center gap-1 press-tactile"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentStepIdx(result.frames.length - 1);
              }}
              title="Jump to final output (Run All)"
              className="h-8 px-2.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] text-[11px] font-semibold text-[#61554D] dark:text-[#D8CBB8] inline-flex items-center gap-1 press-tactile"
            >
              <FastForward className="h-3 w-3" />
              End
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentStepIdx(0);
              }}
              aria-label="Reset playback"
              className="h-8 w-8 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#A99B8E] inline-flex items-center justify-center press-tactile"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Speed Pill */}
            <div className="inline-flex items-center p-0.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FFFFFF] dark:bg-[#1C1714]">
              {([0.5, 1, 2] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setSpeed(sp)}
                  className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                    speed === sp
                      ? 'bg-[#241914] text-[#FAF5EB] dark:bg-[#E0A92E] dark:text-[#1C1613]'
                      : 'text-[#61554D] dark:text-[#A99B8E]'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              data-testid="trace-step-counter"
              className="font-mono text-[11px] font-bold tabular-nums text-[#6E261A] dark:text-[#E0A92E]"
            >
              Step {currentStepIdx + 1} / {result.frames.length}
            </span>

            {onCopyTraceToTable && (
              <button
                type="button"
                onClick={handleCopyToTable}
                data-testid="copy-trace-to-table-btn"
                className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[11px] font-semibold text-[#8B6209] dark:text-[#E0A92E] hover:bg-[#F9ECCB] press-tactile"
              >
                <Table2 className="h-3 w-3" />
                {copiedBanner ? 'Copied ✓' : 'Copy Trace to Table'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active Step Explanation Pill */}
      {activeFrame && (
        <div className="rounded-[14px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] px-3 py-2 text-xs text-[#6E4D08] dark:text-[#F0C869] flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{activeFrame.explanation}</span>
          {activeFrame.branchTaken && (
            <span
              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeFrame.branchTaken === 'true'
                  ? 'bg-[#EBF5EE] text-[#2E5E3E] dark:bg-[#152B1D] dark:text-[#7BB88F]'
                  : 'bg-[#FBEAE8] text-[#B83227] dark:bg-[#3A1E1B] dark:text-[#F08A80]'
              }`}
            >
              Branch: {activeFrame.branchTaken.toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Interactive SVG Flowchart / Recursion Tree Canvas (Strictly Zero-Blue IITM Palette) */}
      {result && result.flowchart.nodes.length > 0 && (
        <div className="rounded-[18px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#F4EFE6] dark:bg-[#241D19]">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#1C1613] dark:text-[#F5F0E8]">
              <GitBranch className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
              {result.flowchart.mode === 'recursion_tree'
                ? 'Interactive Recursion Tree (Click any call node to jump)'
                : 'Interactive Control-Flow Graph (Click any node to jump)'}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
                aria-label="Zoom out flowchart"
                className="h-6 w-6 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] flex items-center justify-center text-[#61554D] dark:text-[#D8CBB8]"
              >
                <ZoomOut className="h-3 w-3" />
              </button>
              <span className="font-mono text-[10px] text-[#61554D] dark:text-[#A99B8E] w-9 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
                aria-label="Zoom in flowchart"
                className="h-6 w-6 rounded-full bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#352A24] flex items-center justify-center text-[#61554D] dark:text-[#D8CBB8]"
              >
                <ZoomIn className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div
            className="relative w-full h-[250px] overflow-hidden cursor-grab active:cursor-grabbing select-none"
            onPointerDown={(e) => {
              dragRef.current = {
                active: true,
                sx: e.clientX,
                sy: e.clientY,
                px: pan.x,
                py: pan.y,
              };
            }}
            onPointerMove={(e) => {
              if (!dragRef.current.active) return;
              setPan({
                x: dragRef.current.px + (e.clientX - dragRef.current.sx),
                y: dragRef.current.py + (e.clientY - dragRef.current.sy),
              });
            }}
            onPointerUp={() => {
              dragRef.current.active = false;
            }}
            onPointerLeave={() => {
              dragRef.current.active = false;
            }}
          >
            <svg
              data-testid="flowchart-svg-canvas"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="w-full h-full"
            >
              <defs>
                <marker
                  id="iitm-arrow-muted"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#A99B8E" />
                </marker>
                <marker
                  id="iitm-arrow-gold"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#C89216" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {result.flowchart.edges.map((edge, idx) => {
                  const src = posById.get(edge.from);
                  const dst = posById.get(edge.to);
                  if (!src || !dst) return null;
                  const traversed = visitedNodeIds.has(edge.from) && visitedNodeIds.has(edge.to);
                  const x1 = src.x;
                  const y1 = src.y + src.h / 2;
                  const x2 = dst.x;
                  const y2 = dst.y - dst.h / 2;
                  const midY = (y1 + y2) / 2;
                  const d =
                    Math.abs(x1 - x2) < 4
                      ? `M ${x1} ${y1} L ${x2} ${y2}`
                      : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                  return (
                    <g key={`edge-${idx}`}>
                      <path
                        d={d}
                        fill="none"
                        stroke={traversed ? '#C89216' : '#C8B9A6'}
                        strokeWidth={traversed ? 2.2 : 1.5}
                        markerEnd={traversed ? 'url(#iitm-arrow-gold)' : 'url(#iitm-arrow-muted)'}
                      />
                      {edge.label && (
                        <text
                          x={(x1 + x2) / 2 + 8}
                          y={midY}
                          fontSize="9"
                          fontWeight="700"
                          fill="#8B6209"
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Nodes */}
                {layout.positioned.map(({ node, x, y, w, h }) => {
                  const isActive = activeFrame?.activeNodeId === node.id;
                  const isVisited = visitedNodeIds.has(node.id);
                  const isDecision = node.type === 'decision';
                  const isStartEnd = node.type === 'start' || node.type === 'end';

                  const fill = isActive
                    ? '#6E261A'
                    : isVisited
                    ? '#FDF6E3'
                    : '#FFFFFF';
                  const stroke = isActive
                    ? '#C89216'
                    : isVisited
                    ? '#C89216'
                    : '#D4C7B7';
                  const textColor = isActive ? '#FAF8F4' : '#1C1613';

                  return (
                    <g
                      key={node.id}
                      data-testid={`flowchart-node-${node.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNodeClick(node);
                      }}
                      className="cursor-pointer"
                    >
                      {isDecision ? (
                        <polygon
                          points={`${x},${y - h / 2 - 4} ${x + w / 2},${y} ${x},${y + h / 2 + 4} ${x - w / 2},${y}`}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={isActive ? 2.5 : 1.5}
                        />
                      ) : (
                        <rect
                          x={x - w / 2}
                          y={y - h / 2}
                          width={w}
                          height={h}
                          rx={isStartEnd ? h / 2 : 12}
                          ry={isStartEnd ? h / 2 : 12}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={isActive ? 2.5 : 1.5}
                        />
                      )}
                      <text
                        x={x}
                        y={node.returnLabel ? y - 3 : y + 4}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight={isActive ? '700' : '600'}
                        fill={textColor}
                      >
                        {node.label.slice(0, 22)}
                      </text>
                      {node.returnLabel && (
                        <text
                          x={x}
                          y={y + 12}
                          textAnchor="middle"
                          fontSize="9"
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="700"
                          fill={isActive ? '#F0C869' : '#2E5E3E'}
                        >
                          ret: {node.returnLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
      )}

      {/* Synchronized Live State Cards: Variables/Memory, Call Stack, Console Output */}
      {activeFrame && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Variables & Memory Pointers */}
          <div className="rounded-[16px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-3 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
              Variables &amp; Memory
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[11px]">
              {Object.entries(activeFrame.variables).length === 0 ? (
                <span className="text-[#8C7E75]">No active variables</span>
              ) : (
                Object.entries(activeFrame.variables).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-[#61554D] dark:text-[#D8CBB8] truncate">{k}</span>
                    <span className="font-bold text-[#1C1613] dark:text-[#F5F0E8] tabular-nums">
                      {v}
                    </span>
                  </div>
                ))
              )}
              {(activeFrame.memoryPointers ?? []).map((mp, idx) => (
                <div
                  key={`mp-${idx}`}
                  className="pt-1 border-t border-[#E8E0D5] dark:border-[#352A24] text-[10px] text-[#8B6209] dark:text-[#E0A92E]"
                >
                  {mp.name} ({mp.address}): {mp.value}
                </div>
              ))}
            </div>
          </div>

          {/* Call Stack Pill Stack */}
          <div className="rounded-[16px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] p-3 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6E261A] dark:text-[#E0A92E]">
              Call Stack ({activeFrame.callStack.length})
            </div>
            <div className="flex flex-col-reverse gap-1 max-h-28 overflow-y-auto">
              {activeFrame.callStack.length === 0 ? (
                <span className="font-mono text-[11px] text-[#8C7E75]">Global scope</span>
              ) : (
                activeFrame.callStack.map((frameLabel, idx) => {
                  const isTop = idx === activeFrame.callStack.length - 1;
                  return (
                    <span
                      key={`cs-${idx}`}
                      className={`px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold truncate ${
                        isTop
                          ? 'bg-[#6E261A] text-white dark:bg-[#9E3E2E]'
                          : 'bg-[#EFE9DF] dark:bg-[#1C1714] text-[#61554D] dark:text-[#D8CBB8]'
                      }`}
                    >
                      {frameLabel}
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* Console Stdout */}
          <div className="rounded-[16px] border border-[#352A24] bg-[#1E1815] text-[#F5EFE6] p-3 space-y-1.5">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#E0A92E]">
              <Terminal className="h-3 w-3" />
              Stdout Output
            </div>
            <pre
              data-testid="visualizer-stdout"
              className="font-mono text-[11px] text-[#E6DAC8] whitespace-pre-wrap break-words max-h-28 overflow-y-auto"
            >
              {activeFrame.outputSoFar || '(no output yet)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
