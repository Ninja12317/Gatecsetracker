import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Save,
  Grid3X3,
  Check,
  Image as ImageIcon,
} from 'lucide-react';

interface SketchpadProps {
  questionId: string;
  savedSketchUrl?: string;
  onSaveSketch: (questionId: string, dataUrl: string) => void;
  onDeleteSketch: (questionId: string) => void;
}

type ToolType = 'pen' | 'highlighter' | 'eraser';
type PaperType = 'grid' | 'dotted' | 'blank';

interface Stroke {
  tool: ToolType;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

// Warm IIT Madras Heritage Ink Palette (Zero Blue)
const INK_COLORS = [
  { name: 'Espresso Ink', hex: '#1C1613' },
  { name: 'Heritage Maroon', hex: '#6E261A' },
  { name: 'Imperial Gold', hex: '#B58210' },
  { name: 'Olive Bronze', hex: '#2E5E3E' },
];

const WIDTHS = [
  { label: 'S', value: 2 },
  { label: 'M', value: 4 },
  { label: 'L', value: 7 },
];

export const Sketchpad: React.FC<SketchpadProps> = React.memo(
  ({ questionId, savedSketchUrl, onSaveSketch, onDeleteSketch }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [tool, setTool] = useState<ToolType>('pen');
    const [color, setColor] = useState<string>('#1C1613');
    const [strokeWidth, setStrokeWidth] = useState<number>(2);
    const [paper, setPaper] = useState<PaperType>('dotted');
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [redoStack, setRedoStack] = useState<Stroke[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [savedNotice, setSavedNotice] = useState(false);
    const [showSavedPreview, setShowSavedPreview] = useState(false);

    const activeStrokeRef = useRef<Stroke | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const rafIdRef = useRef<number | null>(null);
    const canvasSizeRef = useRef({ width: 520, height: 430 });

    strokesRef.current = strokes;

    // Reset active scratch strokes when switching questions
    useEffect(() => {
      setStrokes([]);
      setRedoStack([]);
      setSavedNotice(false);
      setShowSavedPreview(false);
    }, [questionId]);

    // Cancel any pending rAF on unmount
    useEffect(() => {
      return () => {
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
        }
      };
    }, []);

    const drawPaperBackground = useCallback(
      (ctx: CanvasRenderingContext2D, width: number, height: number, paperMode: PaperType) => {
        ctx.fillStyle = '#FFFEFC';
        ctx.fillRect(0, 0, width, height);

        if (paperMode === 'grid') {
          ctx.strokeStyle = '#EFE9DF';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 20; x < width; x += 20) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, height);
          }
          for (let y = 20; y < height; y += 20) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(width, y + 0.5);
          }
          ctx.stroke();
        } else if (paperMode === 'dotted') {
          ctx.fillStyle = '#D8CBB8';
          for (let x = 18; x < width; x += 18) {
            for (let y = 18; y < height; y += 18) {
              ctx.beginPath();
              ctx.arc(x, y, 1, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      },
      []
    );

    const drawSingleStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
      if (stroke.points.length === 0) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'eraser') {
        ctx.strokeStyle = '#FFFEFC';
        ctx.lineWidth = stroke.width * 5;
        ctx.globalAlpha = 1;
      } else if (stroke.tool === 'highlighter') {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width * 4.5;
        ctx.globalAlpha = 0.25;
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      if (stroke.points.length === 1) {
        ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }, []);

    const redrawCanvas = useCallback(
      (strokeList: Stroke[], inProgress?: Stroke | null) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const { width, height } = canvasSizeRef.current;

        if (
          canvas.width !== Math.floor(width * dpr) ||
          canvas.height !== Math.floor(height * dpr)
        ) {
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
        }

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPaperBackground(ctx, width, height, paper);
        for (const s of strokeList) {
          drawSingleStroke(ctx, s);
        }
        if (inProgress) {
          drawSingleStroke(ctx, inProgress);
        }
        ctx.restore();
      },
      [paper, drawPaperBackground, drawSingleStroke]
    );

    const scheduleRedraw = useCallback(() => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        redrawCanvas(strokesRef.current, activeStrokeRef.current);
      });
    }, [redrawCanvas]);

    // Measure container cleanly
    useEffect(() => {
      const updateSize = () => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width > 100) {
          canvasSizeRef.current = {
            width: Math.floor(rect.width),
            height: 430,
          };
          redrawCanvas(strokesRef.current, activeStrokeRef.current);
        }
      };
      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }, [redrawCanvas]);

    useEffect(() => {
      redrawCanvas(strokes, activeStrokeRef.current);
    }, [strokes, paper, redrawCanvas]);

    const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = getPointerPos(e);
      const nextStroke: Stroke = {
        tool,
        color,
        width: strokeWidth,
        points: [pos],
      };
      activeStrokeRef.current = nextStroke;
      setIsDrawing(true);
      scheduleRedraw();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !activeStrokeRef.current) return;
      const pos = getPointerPos(e);
      activeStrokeRef.current.points.push(pos);
      scheduleRedraw();
    };

    const finishStroke = () => {
      if (!isDrawing || !activeStrokeRef.current) return;
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      setIsDrawing(false);
      setStrokes((prev) => [...prev, finished]);
      setRedoStack([]);
    };

    const handleUndo = () => {
      if (strokes.length === 0) return;
      const last = strokes[strokes.length - 1];
      setStrokes((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [...prev, last]);
    };

    const handleRedo = () => {
      if (redoStack.length === 0) return;
      const restored = redoStack[redoStack.length - 1];
      setRedoStack((prev) => prev.slice(0, -1));
      setStrokes((prev) => [...prev, restored]);
    };

    const handleClear = () => {
      setStrokes([]);
      setRedoStack([]);
    };

    const cyclePaper = () => {
      setPaper((p) => (p === 'dotted' ? 'grid' : p === 'grid' ? 'blank' : 'dotted'));
    };

    // Preserve exact compressed WebP/JPEG Firestore-safe save math
    const handleSave = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      let dataUrl = canvas.toDataURL('image/webp', 0.78);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/png');
      }
      if (dataUrl.length > 440000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      }
      onSaveSketch(questionId, dataUrl);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2000);
    };

    return (
      <div
        data-testid="rough-work-sketchpad"
        className="flex flex-col rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] shadow-warm overflow-hidden"
      >
        {/* Curved Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#F4EFE6] dark:bg-[#241D19]">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'pen' as const, label: 'Pen', Icon: Pen },
                { id: 'highlighter' as const, label: 'Highlighter', Icon: Highlighter },
                { id: 'eraser' as const, label: 'Eraser', Icon: Eraser },
              ]
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTool(id)}
                aria-label={`Select ${label} tool`}
                aria-pressed={tool === id}
                title={label}
                className={`h-8 w-8 flex items-center justify-center rounded-full border press-tactile ${
                  tool === id
                    ? 'border-[#6E261A] dark:border-[#9E3E2E] bg-[#6E261A] dark:bg-[#9E3E2E] text-white'
                    : 'border-transparent text-[#61554D] dark:text-[#A99B8E] hover:bg-[#FFFFFF] dark:hover:bg-[#312722]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-[#D8CBB8] dark:bg-[#3A2E28]" />

            {/* 4 Warm Heritage Ink Colors */}
            <div className="flex items-center gap-1.5" role="group" aria-label="Ink colors">
              {INK_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => {
                    setColor(c.hex);
                    if (tool === 'eraser') setTool('pen');
                  }}
                  aria-label={c.name}
                  title={c.name}
                  className={`h-5 w-5 rounded-full border-2 transition-transform ${
                    color === c.hex && tool !== 'eraser'
                      ? 'scale-110 border-[#C89216] ring-2 ring-[#C89216]/50'
                      : 'border-[#FFFFFF] dark:border-[#3A2E28]'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            <span className="mx-1 h-4 w-px bg-[#D8CBB8] dark:bg-[#3A2E28]" />

            {/* Stroke Width */}
            <div className="flex items-center gap-0.5">
              {WIDTHS.map((w) => (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setStrokeWidth(w.value)}
                  aria-label={`Stroke width ${w.label}`}
                  className={`h-6 w-6 rounded-full font-mono text-[10px] font-bold transition-colors ${
                    strokeWidth === w.value
                      ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-white'
                      : 'text-[#61554D] dark:text-[#A99B8E] hover:bg-[#FFFFFF] dark:hover:bg-[#312722]'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas Utilities */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cyclePaper}
              aria-label={`Paper style ${paper}, click to cycle`}
              title={`Paper: ${paper} (click to cycle)`}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#3A2E28] bg-[#FFFFFF] dark:bg-[#1C1714] text-[11px] font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] press-tactile"
            >
              <Grid3X3 className="h-3 w-3" />
              <span className="capitalize">{paper}</span>
            </button>

            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              aria-label="Undo sketch stroke"
              title="Undo"
              className="h-8 w-8 flex items-center justify-center rounded-full text-[#61554D] dark:text-[#A99B8E] hover:bg-[#FFFFFF] dark:hover:bg-[#312722] disabled:opacity-35"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              aria-label="Redo sketch stroke"
              title="Redo"
              className="h-8 w-8 flex items-center justify-center rounded-full text-[#61554D] dark:text-[#A99B8E] hover:bg-[#FFFFFF] dark:hover:bg-[#312722] disabled:opacity-35"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear sketchpad"
              title="Clear Canvas"
              className="h-8 w-8 flex items-center justify-center rounded-full text-[#61554D] dark:text-[#A99B8E] hover:text-[#B83227] hover:bg-[#FBEAE8] dark:hover:bg-[#3A1E1B]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* HiDPI Canvas Surface */}
        <div ref={containerRef} className="relative w-full bg-[#FFFEFC]">
          <canvas
            ref={canvasRef}
            data-testid="sketchpad-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            className="block w-full h-[430px] touch-none cursor-crosshair"
          />
          {strokes.length === 0 && (
            <div className="pointer-events-none absolute top-3.5 left-4 text-[11px] font-mono text-[#A99B8E]">
              Rough Work Sheet · Draw recursion trees, K-maps, DFAs, Gantt charts, or B+ trees
            </div>
          )}
        </div>

        {/* Footer Actions: Save Sketch + Saved Preview */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19]">
          <div className="flex items-center gap-2.5 text-xs">
            <span className="font-mono text-[11px] text-[#61554D] dark:text-[#A99B8E] tabular-nums">
              Strokes: {strokes.length}
            </span>
            {savedSketchUrl && (
              <button
                type="button"
                onClick={() => setShowSavedPreview((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6E261A] dark:text-[#E0A92E] hover:underline"
              >
                <ImageIcon className="h-3 w-3" />
                {showSavedPreview ? 'Hide Saved' : 'View Saved Sketch'}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold press-tactile"
          >
            {savedNotice ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {savedNotice ? 'Sketch Saved' : 'Save Sketch'}
          </button>
        </div>

        {showSavedPreview && savedSketchUrl && (
          <div className="p-4 border-t border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[#61554D] dark:text-[#A99B8E]">
                Saved Rough-Work Snapshot
              </span>
              <button
                type="button"
                onClick={() => {
                  onDeleteSketch(questionId);
                  setShowSavedPreview(false);
                }}
                className="text-[11px] font-semibold text-[#B83227] dark:text-[#F08A80] hover:underline"
              >
                Delete Snapshot
              </button>
            </div>
            <img
              src={savedSketchUrl}
              alt="Saved rough-work sketch for this question"
              className="w-full max-h-48 object-contain rounded-[16px] border border-[#E8E0D5] dark:border-[#2E2520] bg-white"
            />
          </div>
        )}
      </div>
    );
  }
);

Sketchpad.displayName = 'Sketchpad';
