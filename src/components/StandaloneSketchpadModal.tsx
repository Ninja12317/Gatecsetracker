import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eraser,
  FileDown,
  Grid,
  Highlighter,
  Layers,
  PenTool,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type {
  AccentThemeId,
  RoughWorkPaperStyle,
  RoughWorkSheet,
  StandaloneRoughWorkState,
} from '../types';
import { getActiveThemePalette } from '../utils/themeEngine';

interface StandaloneSketchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  roughWork: StandaloneRoughWorkState;
  onSaveRoughWork: (next: StandaloneRoughWorkState) => void;
  accentTheme: AccentThemeId;
  isDark: boolean;
}

type DrawTool = 'pen' | 'highlighter' | 'eraser';

const MAX_SHEETS = 12;
const MAX_HISTORY = 24;

function drawPaperBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  paper: RoughWorkPaperStyle,
  isDark: boolean
) {
  ctx.fillStyle = isDark ? '#181412' : '#FCFBF8';
  ctx.fillRect(0, 0, width, height);

  if (paper === 'blank') return;

  const step = 24;
  if (paper === 'dot') {
    ctx.fillStyle = isDark ? 'rgba(245, 240, 232, 0.14)' : 'rgba(28, 22, 19, 0.14)';
    for (let x = step; x < width; x += step) {
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (paper === 'grid') {
    ctx.strokeStyle = isDark ? 'rgba(245, 240, 232, 0.08)' : 'rgba(28, 22, 19, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < width; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = step; y < height; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();
  }
}

export const StandaloneSketchpadModal: React.FC<StandaloneSketchpadModalProps> = ({
  isOpen,
  onClose,
  roughWork,
  onSaveRoughWork,
  accentTheme,
  isDark,
}) => {
  const palette = useMemo(
    () => getActiveThemePalette(accentTheme, isDark),
    [accentTheme, isDark]
  );

  const inkColors = useMemo(
    () => [
      { id: 'ink', label: isDark ? 'Ivory Ink' : 'Espresso Ink', hex: isDark ? '#F5F0E8' : '#1C1613' },
      { id: 'primary', label: 'Theme Primary', hex: palette.accentPrimary },
      { id: 'secondary', label: 'Theme Accent', hex: palette.accentSecondary },
      { id: 'olive', label: 'Olive Proof', hex: isDark ? '#5CB88A' : '#2E5E3E' },
      { id: 'crimson', label: 'Warning Ink', hex: isDark ? '#E06B60' : '#B83227' },
    ],
    [isDark, palette.accentPrimary, palette.accentSecondary]
  );

  const activeSheet: RoughWorkSheet = useMemo(() => {
    return (
      roughWork.sheets.find((s) => s.id === roughWork.activeSheetId) ||
      roughWork.sheets[0] || {
        id: 'sheet-1',
        name: 'Sheet 1',
        paperStyle: 'dot',
        dataUrl: '',
        updatedAt: new Date().toISOString(),
      }
    );
  }, [roughWork]);

  const [tool, setTool] = useState<DrawTool>('pen');
  const [strokeColor, setStrokeColor] = useState<string>(inkColors[0].hex);
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [paperStyle, setPaperStyle] = useState<RoughWorkPaperStyle>(activeSheet.paperStyle || 'dot');
  const [exportMessage, setExportMessage] = useState<string>('');
  const [historyVersion, setHistoryVersion] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<string[]>(['']);
  const historyIdxRef = useRef<number>(0);

  // Sync ink color when switching light/dark if user was on default ink
  useEffect(() => {
    setStrokeColor((prev) => {
      if (prev === '#1C1613' || prev === '#F5F0E8') {
        return isDark ? '#F5F0E8' : '#1C1613';
      }
      return prev;
    });
  }, [isDark]);

  // Sync paper style with active sheet
  useEffect(() => {
    setPaperStyle(activeSheet.paperStyle || 'dot');
  }, [activeSheet.id, activeSheet.paperStyle]);

  const renderDataUrlToCanvas = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
      ctx.restore();
    };
    img.src = dataUrl;
  }, []);

  const initCanvasSizeAndContent = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    const initialData = activeSheet.dataUrl || '';
    historyRef.current = [initialData];
    historyIdxRef.current = 0;
    setHistoryVersion((v) => v + 1);
    renderDataUrlToCanvas(initialData);
  }, [activeSheet.dataUrl, renderDataUrlToCanvas]);

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => initCanvasSizeAndContent());
    const onResize = () => initCanvasSizeAndContent();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, activeSheet.id, initCanvasSizeAndContent]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const persistActiveCanvas = useCallback(
    (overridePaper?: RoughWorkPaperStyle) => {
      const canvas = canvasRef.current;
      const dataUrl = canvas ? canvas.toDataURL('image/png') : activeSheet.dataUrl;
      const nowIso = new Date().toISOString();

      const nextSheets = roughWork.sheets.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              paperStyle: overridePaper ?? paperStyle,
              dataUrl,
              updatedAt: nowIso,
            }
          : s
      );

      onSaveRoughWork({
        activeSheetId: activeSheet.id,
        sheets: nextSheets,
        updatedAt: nowIso,
      });

      return dataUrl;
    },
    [activeSheet.dataUrl, activeSheet.id, onSaveRoughWork, paperStyle, roughWork.sheets]
  );

  const getRelativePoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pt = getRelativePoint(e);
    isDrawingRef.current = true;
    lastPointRef.current = pt;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = Math.max(14, strokeWidth * 5);
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(14, strokeWidth * 4.2);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    }

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getRelativePoint(e);
    const prev = lastPointRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = Math.max(14, strokeWidth * 5);
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(14, strokeWidth * 4.2);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    }

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();

    lastPointRef.current = pt;
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;

    const dataUrl = persistActiveCanvas();
    const sliced = historyRef.current.slice(0, historyIdxRef.current + 1);
    sliced.push(dataUrl);
    if (sliced.length > MAX_HISTORY) sliced.shift();
    historyRef.current = sliced;
    historyIdxRef.current = sliced.length - 1;
    setHistoryVersion((v) => v + 1);
  };

  const handleUndo = () => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const targetData = historyRef.current[historyIdxRef.current] || '';
    renderDataUrlToCanvas(targetData);
    setHistoryVersion((v) => v + 1);
    const nowIso = new Date().toISOString();
    onSaveRoughWork({
      activeSheetId: activeSheet.id,
      sheets: roughWork.sheets.map((s) =>
        s.id === activeSheet.id ? { ...s, dataUrl: targetData, updatedAt: nowIso } : s
      ),
      updatedAt: nowIso,
    });
  };

  const handleRedo = () => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const targetData = historyRef.current[historyIdxRef.current] || '';
    renderDataUrlToCanvas(targetData);
    setHistoryVersion((v) => v + 1);
    const nowIso = new Date().toISOString();
    onSaveRoughWork({
      activeSheetId: activeSheet.id,
      sheets: roughWork.sheets.map((s) =>
        s.id === activeSheet.id ? { ...s, dataUrl: targetData, updatedAt: nowIso } : s
      ),
      updatedAt: nowIso,
    });
  };

  const handleClearSheet = () => {
    renderDataUrlToCanvas('');
    const sliced = historyRef.current.slice(0, historyIdxRef.current + 1);
    sliced.push('');
    if (sliced.length > MAX_HISTORY) sliced.shift();
    historyRef.current = sliced;
    historyIdxRef.current = sliced.length - 1;
    setHistoryVersion((v) => v + 1);
    const nowIso = new Date().toISOString();
    onSaveRoughWork({
      activeSheetId: activeSheet.id,
      sheets: roughWork.sheets.map((s) =>
        s.id === activeSheet.id ? { ...s, dataUrl: '', updatedAt: nowIso } : s
      ),
      updatedAt: nowIso,
    });
  };

  const handleSwitchSheet = (sheetId: string) => {
    if (sheetId === activeSheet.id) return;
    const nowIso = new Date().toISOString();
    const canvas = canvasRef.current;
    const currentData = canvas ? canvas.toDataURL('image/png') : activeSheet.dataUrl;
    const updatedSheets = roughWork.sheets.map((s) =>
      s.id === activeSheet.id ? { ...s, paperStyle, dataUrl: currentData, updatedAt: nowIso } : s
    );
    onSaveRoughWork({
      activeSheetId: sheetId,
      sheets: updatedSheets,
      updatedAt: nowIso,
    });
  };

  const handleAddSheet = () => {
    if (roughWork.sheets.length >= MAX_SHEETS) return;
    const nowIso = new Date().toISOString();
    const canvas = canvasRef.current;
    const currentData = canvas ? canvas.toDataURL('image/png') : activeSheet.dataUrl;
    const nextNum = roughWork.sheets.length + 1;
    const newId = `sheet-${Date.now()}`;
    const newSheet: RoughWorkSheet = {
      id: newId,
      name: `Sheet ${nextNum}`,
      paperStyle,
      dataUrl: '',
      updatedAt: nowIso,
    };
    const updatedSheets = [
      ...roughWork.sheets.map((s) =>
        s.id === activeSheet.id ? { ...s, paperStyle, dataUrl: currentData, updatedAt: nowIso } : s
      ),
      newSheet,
    ];
    onSaveRoughWork({
      activeSheetId: newId,
      sheets: updatedSheets,
      updatedAt: nowIso,
    });
  };

  const handleDeleteSheet = (sheetId: string) => {
    if (roughWork.sheets.length <= 1) {
      handleClearSheet();
      return;
    }
    const remaining = roughWork.sheets.filter((s) => s.id !== sheetId);
    const nextActive =
      sheetId === activeSheet.id ? remaining[Math.max(0, remaining.length - 1)].id : activeSheet.id;
    onSaveRoughWork({
      activeSheetId: nextActive,
      sheets: remaining,
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePaperChange = (nextPaper: RoughWorkPaperStyle) => {
    setPaperStyle(nextPaper);
    persistActiveCanvas(nextPaper);
  };

  const composeExportCanvas = useCallback(
    async (sheet: RoughWorkSheet, width = 1400, height = 860): Promise<string> => {
      const off = document.createElement('canvas');
      off.width = width;
      off.height = height;
      const ctx = off.getContext('2d');
      if (!ctx) return '';

      drawPaperBackdrop(ctx, width, height, sheet.paperStyle || 'dot', false);

      if (sheet.dataUrl) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, width, height);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = sheet.dataUrl;
        });
      }

      // Clean editorial footer
      ctx.fillStyle = '#61554D';
      ctx.font = '600 14px Inter, sans-serif';
      ctx.fillText(
        `GATE '27 Rough Work · ${sheet.name} · Built by Nihal Pawar`,
        28,
        height - 22
      );
      return off.toDataURL('image/png');
    },
    []
  );

  const handleDownloadPng = async () => {
    const latestUrl = persistActiveCanvas();
    const composed = await composeExportCanvas({
      ...activeSheet,
      paperStyle,
      dataUrl: latestUrl,
    });
    if (!composed) return;
    const link = document.createElement('a');
    const slug = activeSheet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.href = composed;
    link.download = `GATE27_RoughWork_${slug}.png`;
    link.click();
    setExportMessage(`Saved ${activeSheet.name} as PNG`);
    setTimeout(() => setExportMessage(''), 2400);
  };

  const handleDownloadPdf = async () => {
    const latestUrl = persistActiveCanvas();
    const sheetsToExport = roughWork.sheets.map((s) =>
      s.id === activeSheet.id ? { ...s, paperStyle, dataUrl: latestUrl } : s
    );

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    for (let i = 0; i < sheetsToExport.length; i++) {
      if (i > 0) doc.addPage();
      const sheet = sheetsToExport[i];
      const composed = await composeExportCanvas(sheet, 1400, 860);

      doc.setFillColor(250, 248, 244);
      doc.rect(0, 0, pageW, pageH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(28, 22, 19);
      doc.text(`GATE '27 — Standalone Rough-Work Scratchpad · ${sheet.name}`, 12, 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(97, 85, 77);
      doc.text(
        `Page ${i + 1} of ${sheetsToExport.length} · Built by Nihal Pawar`,
        pageW - 12,
        12,
        { align: 'right' }
      );

      if (composed) {
        doc.addImage(composed, 'PNG', 10, 17, pageW - 20, pageH - 27);
      }
    }

    doc.save(`GATE27_RoughWork_Notebook_${new Date().toISOString().slice(0, 10)}.pdf`);
    setExportMessage(`Exported ${sheetsToExport.length} sheet(s) to PDF`);
    setTimeout(() => setExportMessage(''), 2600);
  };

  if (!isOpen) return null;

  const canUndo = historyVersion >= 0 && historyIdxRef.current > 0;
  const canRedo = historyVersion >= 0 && historyIdxRef.current < historyRef.current.length - 1;

  const paperPatternStyle: React.CSSProperties =
    paperStyle === 'dot'
      ? {
          backgroundImage: `radial-gradient(${
            isDark ? 'rgba(245, 240, 232, 0.16)' : 'rgba(28, 22, 19, 0.16)'
          } 1.25px, transparent 1.25px)`,
          backgroundSize: '22px 22px',
        }
      : paperStyle === 'grid'
        ? {
            backgroundImage: `linear-gradient(to right, ${
              isDark ? 'rgba(245, 240, 232, 0.08)' : 'rgba(28, 22, 19, 0.08)'
            } 1px, transparent 1px), linear-gradient(to bottom, ${
              isDark ? 'rgba(245, 240, 232, 0.08)' : 'rgba(28, 22, 19, 0.08)'
            } 1px, transparent 1px)`,
            backgroundSize: '22px 22px',
          }
        : {};

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1C1613]/60 backdrop-blur-sm p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Standalone Rough-Work Sketchpad"
      data-no-swipe="true"
      data-testid="standalone-sketchpad-modal"
    >
      <div className="squircle w-full max-w-6xl h-[92vh] sm:h-[88vh] flex flex-col rounded-[28px] sm:rounded-[32px] bg-[#FAF8F4] dark:bg-[#130F0D] border border-[#E8E0D5] dark:border-[#2E2520] shadow-warm-lg overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3.5 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4] flex items-center justify-center shrink-0">
              <PenTool className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold tracking-[-0.02em] text-[#1C1613] dark:text-[#F5F0E8] truncate">
                General Rough-Work Sketchpad
              </h2>
              <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] truncate">
                Independent scratch notebook · Separate from PYQ Studio sketches
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {exportMessage && (
              <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#EDF5EF] text-[#2E5E3E] dark:bg-[#1A2D21] dark:text-[#78B98E]">
                {exportMessage}
              </span>
            )}
            <button
              type="button"
              onClick={handleDownloadPng}
              className="press-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8] hover:border-[#C89216]"
              title="Download active sheet as PNG"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PNG</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="press-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-[#FAF8F4]"
              title="Download all sheets as PDF"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                persistActiveCanvas();
                onClose();
              }}
              className="press-tactile w-8 h-8 rounded-full flex items-center justify-center bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]"
              aria-label="Close rough-work sketchpad"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Multi-Sheet Strip + Compact Tool Bar */}
        <div className="px-3 sm:px-5 py-2.5 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#F4EFE6] dark:bg-[#191411] space-y-2">
          {/* Sheet Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.12em] text-[#61554D] dark:text-[#A99B8E] mr-1 shrink-0">
              <Layers className="w-3 h-3" />
              Sheets
            </span>
            {roughWork.sheets.map((sheet) => {
              const active = sheet.id === activeSheet.id;
              return (
                <div
                  key={sheet.id}
                  className={`inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors ${
                    active
                      ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                      : 'bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSwitchSheet(sheet.id)}
                    className="whitespace-nowrap"
                  >
                    {sheet.name}
                  </button>
                  {roughWork.sheets.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSheet(sheet.id);
                      }}
                      className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        active
                          ? 'hover:bg-[#FAF8F4]/20 text-[#FAF8F4]/80'
                          : 'hover:bg-[#EFE9DF] dark:hover:bg-[#2E2520]'
                      }`}
                      aria-label={`Delete ${sheet.name}`}
                      title={`Delete ${sheet.name}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {roughWork.sheets.length < MAX_SHEETS && (
              <button
                type="button"
                onClick={handleAddSheet}
                data-testid="standalone-add-sheet-btn"
                className="press-tactile inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border border-dashed border-[#C89216] text-[#6E261A] dark:text-[#E0A92E] hover:bg-[#FDF6E3] dark:hover:bg-[#2C2215] shrink-0 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                New Sheet
              </button>
            )}
          </div>

          {/* Drawing Tools Row */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Tool selector */}
              <div className="inline-flex items-center p-1 rounded-full bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520]">
                {(
                  [
                    { id: 'pen', label: 'Pen', icon: PenTool },
                    { id: 'highlighter', label: 'Highlight', icon: Highlighter },
                    { id: 'eraser', label: 'Eraser', icon: Eraser },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTool(id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      tool === id
                        ? 'bg-[#6E261A] dark:bg-[#9E3E2E] text-[#FAF8F4]'
                        : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>

              {/* Ink Swatches */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520]">
                {inkColors.map((ink) => {
                  const active = strokeColor === ink.hex && tool !== 'eraser';
                  return (
                    <button
                      key={ink.id}
                      type="button"
                      onClick={() => {
                        setStrokeColor(ink.hex);
                        if (tool === 'eraser') setTool('pen');
                      }}
                      title={ink.label}
                      aria-label={ink.label}
                      data-theme-swatch="true"
                      style={{ backgroundColor: ink.hex }}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        active ? 'scale-110 ring-2 ring-offset-2 ring-[#C89216] dark:ring-offset-[#241D19]' : 'opacity-85 hover:opacity-100'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Stroke Width */}
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520]">
                {[
                  { size: 2, label: 'Fine' },
                  { size: 4, label: 'Med' },
                  { size: 7, label: 'Bold' },
                ].map((opt) => (
                  <button
                    key={opt.size}
                    type="button"
                    onClick={() => setStrokeWidth(opt.size)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
                      strokeWidth === opt.size
                        ? 'bg-[#FDF6E3] dark:bg-[#2C2215] text-[#6E261A] dark:text-[#E0A92E] font-semibold'
                        : 'text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Paper Style */}
              <div className="inline-flex items-center p-1 rounded-full bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520]">
                {(
                  [
                    { id: 'dot', label: 'Dot' },
                    { id: 'grid', label: 'Grid' },
                    { id: 'blank', label: 'Blank' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePaperChange(p.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                      paperStyle === p.id
                        ? 'bg-[#EFE9DF] dark:bg-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8] font-semibold'
                        : 'text-[#61554D] dark:text-[#A99B8E]'
                    }`}
                  >
                    {p.id === 'grid' && <Grid className="w-3 h-3" />}
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Undo / Redo / Clear */}
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8] disabled:opacity-40"
                title="Undo"
                aria-label="Undo stroke"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] text-[#1C1613] dark:text-[#F5F0E8] disabled:opacity-40"
                title="Redo"
                aria-label="Redo stroke"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClearSheet}
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-full bg-[#FFFFFF] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] text-xs font-medium text-[#B83227] dark:text-[#E06B60] hover:bg-[#FDF2F2] dark:hover:bg-[#2E1918]"
                title="Clear active sheet"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drawing Canvas Stage */}
        <div className="flex-1 min-h-0 p-3 sm:p-4 bg-[#FAF8F4] dark:bg-[#130F0D]">
          <div
            ref={containerRef}
            style={paperPatternStyle}
            className="squircle relative w-full h-full rounded-[22px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FCFBF8] dark:bg-[#181412] overflow-hidden shadow-inner"
          >
            <canvas
              ref={canvasRef}
              data-testid="standalone-sketchpad-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full h-full block touch-none cursor-crosshair"
            />
          </div>
        </div>

        {/* Subtle Footer Status */}
        <div className="px-5 py-2 border-t border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] flex items-center justify-between text-[11px] text-[#61554D] dark:text-[#A99B8E]">
          <span>
            Auto-saved locally &amp; synced separately under <code className="font-mono">standalone_rough_work</code>
          </span>
          <span className="font-mono">Built by Nihal Pawar</span>
        </div>
      </div>
    </div>
  );
};
