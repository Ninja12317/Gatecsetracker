import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DryRunTraceTable,
  PdfExportLayout,
  PdfExportRequest,
  Question,
  VaultCard,
  WarRoomState,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import {
  computeCountdown,
  computeOverallMastery,
  computeStudyStreak,
  computeSubjectMastery,
  toLocalIsoDate,
} from './gateMath';
import { formatPaceDuration, isSlowPaceQuestion } from './examPolish';
import { computeMockDiagnostics, getNormalizedMockPct } from './mockResultParser';

export interface PdfExportJob {
  request: PdfExportRequest;
  layout: PdfExportLayout;
  includeExplanation: boolean;
  includeSketch: boolean;
  includeSourceLink: boolean;
  generatedAt: string;
}

export interface DirectPdfResult {
  ok: boolean;
  filename: string;
  pageCount: number;
  sizeBytes: number;
  error?: string;
}

// IIT Madras Heritage Palette (strictly zero-blue)
const MAROON: [number, number, number] = [110, 38, 26]; // #6E261A
const GOLD: [number, number, number] = [200, 146, 22]; // #C89216
const INK: [number, number, number] = [28, 22, 19]; // #1C1613
const MUTED: [number, number, number] = [97, 85, 77]; // #61554D
const OLIVE: [number, number, number] = [46, 94, 62]; // #2E5E3E
const CRIMSON: [number, number, number] = [184, 50, 39]; // #B83227
const IVORY: [number, number, number] = [250, 248, 244]; // #FAF8F4
const BORDER: [number, number, number] = [224, 214, 200]; // #E0D6C8

const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
  ndash: '-',
  mdash: ' - ',
  minus: '-',
  times: ' x ',
  divide: ' / ',
  plusmn: '+/-',
  le: '<=',
  ge: '>=',
  ne: '!=',
  rarr: '->',
  larr: '<-',
  harr: '<->',
  rArr: '=>',
  infin: 'inf',
  hellip: '...',
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

const UNICODE_ASCII_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2013\u2014\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00D7/g, ' x '],
  [/\u00F7/g, ' / '],
  [/\u00B1/g, '+/-'],
  [/\u2264/g, '<='],
  [/\u2265/g, '>='],
  [/\u2260/g, '!='],
  [/\u2248/g, '~='],
  [/\u2192/g, '->'],
  [/\u2190/g, '<-'],
  [/\u21D2/g, '=>'],
  [/\u21D4/g, '<=>'],
  [/\u221E/g, 'inf'],
  [/\u2208/g, ' in '],
  [/\u2209/g, ' not in '],
  [/\u2286/g, ' subseteq '],
  [/\u2282/g, ' subset '],
  [/\u222A/g, ' U '],
  [/\u2229/g, ' cap '],
  [/\u2205/g, 'empty'],
  [/\u2200/g, 'forall '],
  [/\u2203/g, 'exists '],
  [/\u2227/g, ' AND '],
  [/\u2228/g, ' OR '],
  [/\u00AC/g, 'NOT '],
  [/\u0398/g, 'Theta'],
  [/\u03B8/g, 'theta'],
  [/\u03A9/g, 'Omega'],
  [/\u03C9/g, 'omega'],
  [/\u03A3/g, 'Sigma'],
  [/\u03C3/g, 'sigma'],
  [/\u03B1/g, 'alpha'],
  [/\u03B2/g, 'beta'],
  [/\u03B3/g, 'gamma'],
  [/\u03B4/g, 'delta'],
  [/\u0394/g, 'Delta'],
  [/\u03B5|\u03F5/g, 'epsilon'],
  [/\u03BB/g, 'lambda'],
  [/\u03BC/g, 'mu'],
  [/\u03C0/g, 'pi'],
  [/\u03C4/g, 'tau'],
  [/\u03C6|\u03D5/g, 'phi'],
  [/\u221A/g, 'sqrt'],
  [/\u2211/g, 'sum'],
  [/\u220F/g, 'prod'],
  [/\u00B7|\u2022/g, ' · '],
  [/\u2713/g, '[OK]'],
  [/\u2717/g, '[X]'],
];

/**
 * Converts question HTML + KaTeX/LaTeX into crisp, ASCII-safe readable text for jsPDF Helvetica
 * so standard Type-1 PDF fonts never output garbled glyphs.
 */
export function stripHtmlAndLatexForPdf(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = String(raw);

  // Preserve block breaks before stripping tags
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|pre|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<t[dh][^>]*>/gi, '  ')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi, ' [Figure: $1] ')
    .replace(/<img[^>]*>/gi, ' [Diagram] ')
    .replace(/<[^>]+>/g, '');

  // Decode named & numeric HTML entities
  text = text.replace(/&([a-zA-Z0-9#]+);/g, (full, entity: string) => {
    const mapped = HTML_ENTITY_MAP[entity.toLowerCase()] ?? HTML_ENTITY_MAP[entity];
    if (mapped !== undefined) return mapped;
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const cp = parseInt(entity.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    if (entity.startsWith('#')) {
      const cp = parseInt(entity.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    return full;
  });

  // Simplify common LaTeX constructs cleanly
  text = text
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^{}]+)\}/g, '$1')
    .replace(/\\mathcal\{([^{}]+)\}/g, '$1')
    .replace(/\\(leq|le)\b/g, '<=')
    .replace(/\\(geq|ge)\b/g, '>=')
    .replace(/\\(neq|ne)\b/g, '!=')
    .replace(/\\times\b/g, ' x ')
    .replace(/\\cdot\b/g, ' * ')
    .replace(/\\pm\b/g, '+/-')
    .replace(/\\(rightarrow|to)\b/g, '->')
    .replace(/\\Rightarrow\b/g, '=>')
    .replace(/\\leftarrow\b/g, '<-')
    .replace(/\\infty\b/g, 'inf')
    .replace(/\\in\b/g, ' in ')
    .replace(/\\notin\b/g, ' not in ')
    .replace(/\\subseteq\b/g, ' subseteq ')
    .replace(/\\subset\b/g, ' subset ')
    .replace(/\\cup\b/g, ' U ')
    .replace(/\\cap\b/g, ' cap ')
    .replace(/\\emptyset\b/g, 'empty')
    .replace(/\\forall\b/g, 'forall ')
    .replace(/\\exists\b/g, 'exists ')
    .replace(/\\(land|wedge)\b/g, ' AND ')
    .replace(/\\(lor|vee)\b/g, ' OR ')
    .replace(/\\(lnot|neg)\b/g, 'NOT ')
    .replace(/\\(Theta|theta|Omega|omega|Sigma|sigma|alpha|beta|gamma|delta|Delta|epsilon|lambda|mu|pi|tau|phi|log|ln|sin|cos|tan|mod|sum|prod)\b/g, '$1')
    .replace(/\\(left|right|quad|qquad|,|;|!)\b/g, ' ')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\^\{([^{}]+)\}/g, '^($1)')
    .replace(/_\{([^{}]+)\}/g, '_($1)');

  // Replace Unicode math/punctuation symbols with PDF-safe ASCII
  for (const [pattern, replacement] of UNICODE_ASCII_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  // Strip any remaining non-WinAnsi characters outside printable ASCII + basic Latin-1
  text = text.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ');

  // Normalize excessive blank lines & whitespace
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizePdfFilename(prefix: string, isoDate?: string): string {
  const datePart = (isoDate && /^\d{4}-\d{2}-\d{2}/.test(isoDate)
    ? isoDate.slice(0, 10)
    : toLocalIsoDate());
  const slug = prefix
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `GATE27_${slug || 'Export'}_${datePart}.pdf`;
}

export function getOfficialAnswerSummary(q: Question): string {
  if (q.format === 'MCQ') return q.correctOption || 'Verify on GateOverflow';
  if (q.format === 'MSQ') {
    return q.correctOptions && q.correctOptions.length > 0
      ? q.correctOptions.join(', ')
      : 'Verify on GateOverflow';
  }
  if (typeof q.natAnswer === 'number') {
    return `${q.natAnswer}${q.natTolerance ? ` (+/-${q.natTolerance})` : ''}${q.natUnit ? ` ${q.natUnit}` : ''}`;
  }
  return 'Verify on GateOverflow';
}

function formatStudyMins(totalMins: number): string {
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs <= 0) return `${mins}m`;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function drawIitmBanner(
  doc: jsPDF,
  title: string,
  subtitle: string,
  dateLabel: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Solid IIT Madras Heritage Maroon-Brown Header Bar
  doc.setFillColor(...MAROON);
  doc.rect(0, 0, pageWidth, 27, 'F');

  // Imperial Gold Accent Rule
  doc.setFillColor(...GOLD);
  doc.rect(0, 27, pageWidth, 1.5, 'F');

  // Brand Eyebrow
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(240, 200, 100);
  doc.text("GATE CSE 2027 · IIT MADRAS WAR ROOM · BUILT BY NIHAL PAWAR", margin, 8.5);

  // Date stamp on top-right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(245, 236, 224);
  doc.text(dateLabel, pageWidth - margin, 8.5, { align: 'right' });

  // Main Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(255, 253, 249);
  const cleanTitle = stripHtmlAndLatexForPdf(title).slice(0, 88);
  doc.text(cleanTitle, margin, 16.5);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(238, 226, 212);
  const cleanSub = stripHtmlAndLatexForPdf(subtitle).slice(0, 118);
  doc.text(cleanSub, margin, 22.8);

  return 35;
}

function stampFooters(doc: jsPDF): number {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `GATE CSE 2027 · Built by Nihal Pawar · Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 7,
      { align: 'center' }
    );
  }
  return pageCount;
}

function ensureSpace(doc: jsPDF, currentY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY + neededHeight > pageHeight - 18) {
    doc.addPage();
    return 18;
  }
  return currentY;
}

function renderWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  let cursorY = y;
  for (const line of lines) {
    cursorY = ensureSpace(doc, cursorY, lineHeight + 2);
    doc.text(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

function embedSketchSafely(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number
): number {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return y;
  try {
    const format = dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
    let cursorY = ensureSpace(doc, y, maxHeight + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...MAROON);
    doc.text('Saved Rough-Work Sketch:', x, cursorY);
    cursorY += 3;

    doc.setDrawColor(...BORDER);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cursorY, maxWidth, maxHeight, 2.5, 2.5, 'FD');

    doc.addImage(dataUrl, format, x + 2, cursorY + 2, maxWidth - 4, maxHeight - 4, undefined, 'FAST');
    return cursorY + maxHeight + 5;
  } catch {
    return y;
  }
}

function renderQuestionBlock(
  doc: jsPDF,
  q: Question,
  indexNumber: number | null,
  startY: number,
  opts: {
    isWorksheet: boolean;
    includeExplanation: boolean;
    includeSketch: boolean;
    includeSourceLink: boolean;
    userAnswerLabel?: string;
    timeSpentSeconds?: number;
    mistakeTag?: string;
    mistakeNote?: string;
    sketchDataUrl?: string;
    traceTable?: DryRunTraceTable;
  }
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const subj = SUBJECT_MAP[q.subjectId];
  let y = ensureSpace(doc, startY, 38);

  // Question Header Strip
  doc.setFillColor(...IVORY);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(margin, y, contentWidth, 9, 2, 2, 'FD');

  const prefix = indexNumber !== null ? `Q${indexNumber}. ` : '';
  const leftLabel = stripHtmlAndLatexForPdf(
    `${prefix}${subj?.shortName ?? q.subjectId.toUpperCase()} · ${q.subtopic}`
  ).slice(0, 68);
  const slow = typeof opts.timeSpentSeconds === 'number' && isSlowPaceQuestion(q.marks, opts.timeSpentSeconds);
  const rightMeta = [
    q.format,
    `${q.marks}M`,
    q.year ? `GATE ${q.year}` : q.sourceTag,
    opts.timeSpentSeconds && opts.timeSpentSeconds > 0
      ? `${formatPaceDuration(opts.timeSpentSeconds)}${slow ? ' (Slow)' : ''}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MAROON);
  doc.text(leftLabel, margin + 3, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(rightMeta, pageWidth - margin - 3, y + 6, { align: 'right' });

  y += 14;

  // Question Body
  const cleanBody = stripHtmlAndLatexForPdf(q.bodyHtml || q.prompt);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.8);
  doc.setTextColor(...INK);
  y = renderWrappedText(doc, cleanBody || 'Question text unavailable.', margin + 1, y, contentWidth - 2, 4.7);
  y += 2;

  // Code Snippet Box (if present)
  if (q.codeSnippet && q.codeSnippet.trim()) {
    const cleanCode = stripHtmlAndLatexForPdf(q.codeSnippet);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.2);
    const codeLines = doc.splitTextToSize(cleanCode, contentWidth - 8) as string[];
    const boxHeight = Math.min(95, codeLines.length * 4 + 6);
    y = ensureSpace(doc, y, boxHeight + 4);
    doc.setFillColor(246, 243, 237);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin + 1, y, contentWidth - 2, boxHeight, 2, 2, 'FD');
    doc.setTextColor(...INK);
    let cy = y + 4.8;
    for (const line of codeLines.slice(0, 22)) {
      doc.text(line, margin + 4, cy);
      cy += 4;
    }
    y += boxHeight + 4;
  }

  // Options (MCQ / MSQ)
  if (q.format !== 'NAT' && q.options && q.options.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    for (const opt of q.options) {
      const optText = stripHtmlAndLatexForPdf(opt.text);
      const marker = opts.isWorksheet ? `[ ] (${opt.id}) ` : `(${opt.id}) `;
      const wrapped = doc.splitTextToSize(`${marker}${optText}`, contentWidth - 8) as string[];
      const optHeight = wrapped.length * 4.4 + 3.5;
      y = ensureSpace(doc, y, optHeight + 2);
      doc.setDrawColor(235, 228, 218);
      doc.roundedRect(margin + 2, y - 3.2, contentWidth - 4, optHeight, 1.5, 1.5, 'S');
      doc.setTextColor(...INK);
      for (const l of wrapped) {
        doc.text(l, margin + 4.5, y + 0.5);
        y += 4.4;
      }
      y += 2.5;
    }
    y += 1.5;
  }

  // Worksheet Mode: Rough-work box
  if (opts.isWorksheet) {
    y = ensureSpace(doc, y, 22);
    doc.setDrawColor(208, 196, 180);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(margin + 1, y, contentWidth - 2, 18, 2, 2, 'S');
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.8);
    doc.setTextColor(145, 132, 120);
    doc.text('Rough work / Answer box:', margin + 4, y + 5);
    return y + 23;
  }

  // Solutions / Single-Question Answer & Explanation Section
  if (opts.includeExplanation) {
    y = ensureSpace(doc, y, 18);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(margin + 1, y, pageWidth - margin - 1, y);
    y += 4.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...OLIVE);
    const ansSummary = `Verified Answer: ${getOfficialAnswerSummary(q)}`;
    const attemptPart = opts.userAnswerLabel ? `   |   Your Attempt: ${opts.userAnswerLabel}` : '';
    const tagPart = opts.mistakeTag ? `   |   Tag: ${opts.mistakeTag}` : '';
    y = renderWrappedText(
      doc,
      stripHtmlAndLatexForPdf(`${ansSummary}${attemptPart}${tagPart}`),
      margin + 1,
      y,
      contentWidth - 2,
      4.5
    );

    if (q.explanation) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(...INK);
      y = renderWrappedText(
        doc,
        stripHtmlAndLatexForPdf(q.explanation),
        margin + 1,
        y + 1,
        contentWidth - 2,
        4.3
      );
    }

    if (q.wrongOptionAnalysis) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      y = renderWrappedText(
        doc,
        `Trap / Distractor Note: ${stripHtmlAndLatexForPdf(q.wrongOptionAnalysis)}`,
        margin + 1,
        y + 1,
        contentWidth - 2,
        4.2
      );
    }

    if (opts.mistakeNote) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...MAROON);
      y = renderWrappedText(
        doc,
        `Personal Note: ${stripHtmlAndLatexForPdf(opts.mistakeNote)}`,
        margin + 1,
        y + 1,
        contentWidth - 2,
        4.2
      );
    }
    y += 2;
  }

  // Optional Embedded HTML5 Canvas Sketch
  if (opts.includeSketch && opts.sketchDataUrl) {
    y = embedSketchSafely(doc, opts.sketchDataUrl, margin + 1, y, contentWidth - 2, 54);
  }

  // Optional Structured Dry-Run Trace Table (auto-rendered whenever saved for this question)
  if (
    opts.includeSketch &&
    opts.traceTable &&
    opts.traceTable.columns.length > 0 &&
    opts.traceTable.rows.length > 0
  ) {
    y = ensureSpace(doc, y, 26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...MAROON);
    doc.text(
      `Dry-Run Trace Table (${opts.traceTable.rows.length} steps · ${opts.traceTable.columns.length} cols):`,
      margin + 1,
      y
    );
    y += 3;

    autoTable(doc, {
      startY: y,
      margin: { left: margin + 1, right: margin + 1, bottom: 18 },
      head: [opts.traceTable.columns.map((c) => stripHtmlAndLatexForPdf(c))],
      body: opts.traceTable.rows.map((r) =>
        opts.traceTable!.columns.map((_, colIdx) =>
          stripHtmlAndLatexForPdf(r.cells[colIdx] ?? '')
        )
      ),
      styles: {
        font: 'courier',
        fontSize: 7.5,
        textColor: INK,
        cellPadding: 1.8,
        lineColor: BORDER,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: MAROON,
        textColor: [255, 253, 249],
        font: 'helvetica',
        fontStyle: 'bold',
        fontSize: 7.8,
      },
      alternateRowStyles: {
        fillColor: IVORY,
      },
    });
    y =
      ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
        y + 20) + 4;
  }

  // Optional GateOverflow Source Link
  if (opts.includeSourceLink && q.sourceUrl) {
    y = ensureSpace(doc, y, 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...MUTED);
    doc.text(`Source: ${q.sourceUrl.slice(0, 110)}`, margin + 1, y);
    y += 5;
  }

  return y + 5;
}

/**
 * Pure jsPDF document builder supporting all 4 GATE '27 report types.
 * Works identically in browser and Node (unit-testable).
 */
export function buildPdfDocument(
  job: PdfExportJob,
  state: WarRoomState
): { doc: jsPDF; filename: string; pageCount: number } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { request, layout, includeExplanation, includeSketch, includeSourceLink, generatedAt } = job;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const dateLabel = new Date(generatedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  let filename = sanitizePdfFilename('Export', generatedAt);

  // 1. SINGLE QUESTION PDF
  if (request.kind === 'single-question') {
    const q = request.question;
    const subj = SUBJECT_MAP[q.subjectId];
    filename = sanitizePdfFilename(
      `PYQ_${subj?.code ?? q.subjectId}_${q.year ?? 'Practice'}`,
      generatedAt
    );

    const y = drawIitmBanner(
      doc,
      q.title || `${subj?.shortName ?? q.subjectId.toUpperCase()} · ${q.subtopic}`,
      `${q.sourceTag} · ${q.format} · ${q.marks} Mark${q.marks > 1 ? 's' : ''}`,
      dateLabel
    );

    renderQuestionBlock(doc, q, null, y, {
      isWorksheet: false,
      includeExplanation,
      includeSketch,
      includeSourceLink,
      userAnswerLabel: request.userAnswerLabel,
      timeSpentSeconds: request.timeSpentSeconds,
      mistakeTag: request.mistakeTag,
      mistakeNote: request.mistakeNote,
      sketchDataUrl: request.sketchDataUrl,
      traceTable: request.traceTable ?? state.traceTables?.[q.id],
    });
  }

  // 2. TEST PACK / WORKSHEET / MISTAKE BUCKET PDF
  else if (request.kind === 'test-pack') {
    const isWorksheet = layout === 'worksheet';
    const questions = request.questions;
    const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);
    filename = sanitizePdfFilename(
      `${request.title}_${isWorksheet ? 'Worksheet' : 'Solutions'}`,
      generatedAt
    );

    let y = drawIitmBanner(
      doc,
      request.title,
      `${isWorksheet ? 'Practice Worksheet' : 'Solution & Review Booklet'} · ${questions.length} Qs · ${totalMarks} Marks${request.subtitle ? ` · ${request.subtitle}` : ''}`,
      dateLabel
    );

    if (questions.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text('No questions matched the selected export criteria.', margin, y + 6);
    } else {
      questions.forEach((q, idx) => {
        const mistake = request.mistakeMap?.[q.id];
        y = renderQuestionBlock(doc, q, idx + 1, y, {
          isWorksheet,
          includeExplanation: !isWorksheet && includeExplanation,
          includeSketch: !isWorksheet && includeSketch,
          includeSourceLink,
          userAnswerLabel: request.userAnswers?.[q.id],
          timeSpentSeconds: request.questionSeconds?.[q.id],
          mistakeTag: mistake?.errorTag,
          mistakeNote: mistake?.userNote,
          sketchDataUrl: request.savedSketches?.[q.id],
          traceTable: request.savedTraceTables?.[q.id] ?? state.traceTables?.[q.id],
        });
      });

      // Last-Page Compact Answer Key Table for Practice Worksheet
      if (isWorksheet) {
        doc.addPage();
        const keyY = drawIitmBanner(
          doc,
          `${request.title} — Answer Key`,
          `Compact Verification Table · ${questions.length} Questions`,
          dateLabel
        );

        autoTable(doc, {
          startY: keyY,
          margin: { left: margin, right: margin, bottom: 18 },
          head: [['Q#', 'Subject & Subtopic', 'Type / Marks', 'Verified Answer Key']],
          body: questions.map((q, idx) => [
            `Q${idx + 1}`,
            stripHtmlAndLatexForPdf(
              `${SUBJECT_MAP[q.subjectId]?.shortName ?? q.subjectId.toUpperCase()} · ${q.subtopic}`
            ),
            `${q.format} · ${q.marks}M`,
            getOfficialAnswerSummary(q),
          ]),
          styles: {
            font: 'helvetica',
            fontSize: 8.5,
            textColor: INK,
            cellPadding: 2.5,
            lineColor: BORDER,
            lineWidth: 0.2,
          },
          headStyles: {
            fillColor: MAROON,
            textColor: [255, 253, 249],
            fontStyle: 'bold',
          },
          alternateRowStyles: {
            fillColor: IVORY,
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 16 },
            2: { cellWidth: 28 },
            3: { fontStyle: 'bold', textColor: OLIVE },
          },
        });
      }
    }
  }

  // 3. MOCK ANALYTICS & DIAGNOSTICS REPORT PDF
  else if (request.kind === 'mock-report') {
    const diag = computeMockDiagnostics(state.mocks, state.progress);
    filename = sanitizePdfFilename('Mock_Analytics_Report', generatedAt);

    let y = drawIitmBanner(
      doc,
      request.title || 'GATE CSE 2027 · Mock Test Analytics & Diagnostics',
      `${diag.totalTests} Logged Tests · Avg Norm ${diag.avgNormalizedPct.toFixed(1)}% · Mean Accuracy ${diag.meanAccuracy}%`,
      dateLabel
    );

    // 4-KPI Summary Strip
    const kpis = [
      { label: 'TESTS LOGGED', value: `${diag.totalTests}` },
      { label: 'AVG / PEAK %', value: `${diag.avgNormalizedPct.toFixed(1)}% / ${diag.peakNormalizedPct.toFixed(1)}%` },
      { label: 'MEAN ACCURACY', value: `${diag.meanAccuracy}%` },
      { label: 'PENALTY BLEED', value: `-${diag.totalPenaltyBleed.toFixed(2)}M` },
    ];
    const cardW = (contentWidth - 9) / 4;
    kpis.forEach((k, idx) => {
      const cx = margin + idx * (cardW + 3);
      doc.setFillColor(...IVORY);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(cx, y, cardW, 17, 2.5, 2.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...MUTED);
      doc.text(k.label, cx + 3, y + 5.5);
      doc.setFontSize(11);
      doc.setTextColor(...(idx === 3 ? CRIMSON : MAROON));
      doc.text(k.value, cx + 3, y + 13);
    });
    y += 23;

    // 1M vs 2M Telemetry Note if available
    if (diag.q1Stats.attempted > 0 || diag.q2Stats.attempted > 0) {
      doc.setFillColor(253, 246, 227);
      doc.setDrawColor(...GOLD);
      doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...MAROON);
      doc.text(
        `1-Mark Split: ${diag.q1Stats.correct}/${diag.q1Stats.attempted} (${diag.q1Stats.accuracy}% acc, -${diag.q1Stats.penaltyMarks.toFixed(2)}M bleed)   |   2-Mark Split: ${diag.q2Stats.correct}/${diag.q2Stats.attempted} (${diag.q2Stats.accuracy}% acc, -${diag.q2Stats.penaltyMarks.toFixed(2)}M bleed)`,
        margin + 3.5,
        y + 7.5
      );
      y += 17;
    }

    // Complete Mock Test History Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...MAROON);
    doc.text('Logged Mock Tests Archive', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 18 },
      head: [['Date', 'Test Name', 'Type', 'Score', 'Norm %', 'Acc %', 'Bleed']],
      body:
        state.mocks.length === 0
          ? [['—', 'No mock tests logged yet. Paste a GO Classes result in Mocks tab.', '—', '—', '—', '—', '—']]
          : [...state.mocks].reverse().map((m) => [
              m.date,
              stripHtmlAndLatexForPdf(m.name).slice(0, 44),
              m.type.replace('Full-Length Mock', 'FLT').replace('Subject Test', 'SWT').replace('Topic-Wise Test', 'TWT'),
              `${m.score.toFixed(2)}/${m.maxScore}`,
              `${getNormalizedMockPct(m).toFixed(1)}%`,
              `${m.accuracy}%`,
              `-${(m.penaltyMarks ?? 0).toFixed(2)}M`,
            ]),
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        textColor: INK,
        cellPadding: 2.3,
        lineColor: BORDER,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: MAROON,
        textColor: [255, 253, 249],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: IVORY,
      },
      columnStyles: {
        0: { cellWidth: 22 },
        2: { cellWidth: 15 },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right' },
        5: { halign: 'right', textColor: OLIVE, fontStyle: 'bold' },
        6: { halign: 'right', textColor: CRIMSON },
      },
    });

    // Diagnostic Insights
    if (diag.insights.length > 0) {
      const afterTableY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 40;
      let insY = ensureSpace(doc, afterTableY + 10, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...MAROON);
      doc.text('Automated Diagnostic Takeaways', margin, insY);
      insY += 6;
      for (const ins of diag.insights) {
        insY = ensureSpace(doc, insY, 12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(...INK);
        doc.text(`• ${stripHtmlAndLatexForPdf(ins.title)}`, margin + 1, insY);
        insY += 4.3;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.3);
        doc.setTextColor(...MUTED);
        insY = renderWrappedText(doc, stripHtmlAndLatexForPdf(ins.detail), margin + 4, insY, contentWidth - 6, 4.1);
        insY += 2;
      }
    }
  }

  // 4. 70-DAY STUDY & READINESS REPORT PDF
  else {
    const countdown = computeCountdown(state.settings.targetDateIso);
    const streak = computeStudyStreak(state.studyLogs, toLocalIsoDate());
    const weightedMastery = computeOverallMastery(GATE_2027_SYLLABUS, state.progress);
    const totalMinutes = state.studyLogs.reduce((acc, l) => acc + l.minutes, 0);
    const unresolvedMistakes = Object.values(state.mistakes).filter((m) => !m.resolved);
    filename = sanitizePdfFilename('70Day_Study_Report', generatedAt);

    let y = drawIitmBanner(
      doc,
      request.title || 'GATE CSE 2027 · 70-Day Study & Readiness Report',
      `Target: ${state.settings.targetDateIso.slice(0, 10)} (${state.settings.shift}) · ${countdown.days} Days Remaining`,
      dateLabel
    );

    // 4-KPI Summary Strip
    const kpis = [
      { label: 'DAYS TO GATE', value: `${countdown.days}d` },
      { label: 'WEIGHTED MASTERY', value: `${weightedMastery}%` },
      { label: 'STUDY LOGGED', value: formatStudyMins(totalMinutes) },
      { label: 'ACTIVE STREAK', value: `${streak} days` },
    ];
    const cardW = (contentWidth - 9) / 4;
    kpis.forEach((k, idx) => {
      const cx = margin + idx * (cardW + 3);
      doc.setFillColor(...IVORY);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(cx, y, cardW, 17, 2.5, 2.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...MUTED);
      doc.text(k.label, cx + 3, y + 5.5);
      doc.setFontSize(12);
      doc.setTextColor(...MAROON);
      doc.text(k.value, cx + 3, y + 13.2);
    });
    y += 24;

    // 11-Subject Mastery Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...MAROON);
    doc.text('11 GATE CSE Subjects — Weighted Readiness Breakdown', margin, y);
    y += 4;

    const subjectRows = GATE_2027_SYLLABUS.map((subj) => {
      const percent = computeSubjectMastery(subj, state.progress);
      const masteredCount = subj.subtopics.filter(
        (st) => state.progress[st.id]?.status === 'mastered'
      ).length;
      return {
        subj,
        percent,
        masteredCount,
        totalCount: subj.subtopics.length,
      };
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 18 },
      head: [['Code', 'GATE CSE Subject', 'Weightage', 'Mastered Topics', 'Readiness']],
      body: subjectRows.map((r) => [
        r.subj.code,
        r.subj.name,
        `${r.subj.weightage}M`,
        `${r.masteredCount} / ${r.totalCount}`,
        `${r.percent}%`,
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: INK,
        cellPadding: 2.4,
        lineColor: BORDER,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: MAROON,
        textColor: [255, 253, 249],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: IVORY,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 16, textColor: MAROON },
        2: { halign: 'right', cellWidth: 24 },
        3: { halign: 'right', cellWidth: 32 },
        4: { halign: 'right', cellWidth: 24, fontStyle: 'bold', textColor: OLIVE },
      },
    });

    const afterTableY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 95;
    const summaryY = ensureSpace(doc, afterTableY + 8, 30);

    const avgMockNorm =
      state.mocks.length > 0
        ? (
            state.mocks.reduce((acc, m) => acc + getNormalizedMockPct(m), 0) /
            state.mocks.length
          ).toFixed(1)
        : null;

    const weakest = [...subjectRows]
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 3)
      .map((r) => `${r.subj.shortName} (${r.percent}%)`)
      .join(', ');

    doc.setFillColor(...IVORY);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin, summaryY, contentWidth, 24, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...MAROON);
    doc.text('Priority Focus & Mock Summary', margin + 4, summaryY + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(
      `Mocks Logged: ${state.mocks.length}${avgMockNorm ? ` (Avg Normalized: ${avgMockNorm}%)` : ''}   |   Unresolved Mistake Bucket Items: ${unresolvedMistakes.length}`,
      margin + 4,
      summaryY + 13
    );
    doc.setTextColor(...MUTED);
    doc.text(`Lowest Readiness Subjects to Prioritize: ${weakest}`, margin + 4, summaryY + 19.2);
  }

  const pageCount = stampFooters(doc);
  return { doc, filename, pageCount };
}

/**
 * Engine A — Direct Real `.pdf` File Download (works inside iframes, mobile WebViews & desktop browsers).
 */
export async function downloadDirectPdf(
  job: PdfExportJob,
  state: WarRoomState
): Promise<DirectPdfResult> {
  try {
    const { doc, filename, pageCount } = buildPdfDocument(job, state);
    const blob = doc.output('blob');
    const sizeBytes = blob.size;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    window.setTimeout(() => {
      try {
        document.body.removeChild(anchor);
      } catch {
        // ignore if already removed
      }
      URL.revokeObjectURL(url);
    }, 1500);

    return {
      ok: true,
      filename,
      pageCount,
      sizeBytes,
    };
  } catch (err) {
    return {
      ok: false,
      filename: '',
      pageCount: 0,
      sizeBytes: 0,
      error: err instanceof Error ? err.message : 'PDF generation failed unexpectedly.',
    };
  }
}

/**
 * Pure jsPDF A4 Formula, Traps & Tricks Cheat Sheet builder.
 * Groups cards by GATE CSE 2027 subject in crisp IIT Madras maroon/gold/ivory tables
 * with "Built by Nihal Pawar" page footers. Works identically in browser and Node.
 */
export function buildVaultCheatSheetPdf(
  cards: VaultCard[],
  options?: {
    title?: string;
    subtitle?: string;
    generatedAt?: string;
  }
): { doc: jsPDF; filename: string; pageCount: number } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const dateLabel = new Date(generatedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const title = options?.title || 'GATE CSE 2027 · Traps, Tricks & Formula Cheat Sheet';
  const subtitle =
    options?.subtitle ||
    `${cards.length} Exam-Grade Cards · IIT Madras 2027 Syllabus`;
  const filename = sanitizePdfFilename('Formula_Trap_CheatSheet', generatedAt);
  const margin = 14;

  let y = drawIitmBanner(doc, title, subtitle, dateLabel);

  if (cards.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No vault cards matched the current filter.', margin, y + 6);
    const pageCount = stampFooters(doc);
    return { doc, filename, pageCount };
  }

  // Group cards cleanly by official 11-subject order
  const subjectOrder = GATE_2027_SYLLABUS.map((s) => s.id);
  const grouped = new Map<string, VaultCard[]>();
  for (const sid of subjectOrder) {
    grouped.set(sid, []);
  }
  for (const card of cards) {
    const arr = grouped.get(card.subject) ?? [];
    arr.push(card);
    grouped.set(card.subject, arr);
  }

  for (const sid of subjectOrder) {
    const list = grouped.get(sid) ?? [];
    if (list.length === 0) continue;
    const subj = SUBJECT_MAP[sid];

    y = ensureSpace(doc, y, 22);
    doc.setFillColor(...IVORY);
    doc.setDrawColor(...GOLD);
    doc.roundedRect(margin, y, doc.internal.pageSize.getWidth() - margin * 2, 8.5, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...MAROON);
    doc.text(
      `${subj?.code ?? sid.toUpperCase()} — ${subj?.name ?? sid.toUpperCase()} (${list.length} cards)`,
      margin + 3.5,
      y + 5.7
    );
    y += 11;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 18 },
      head: [['Card / Type', 'Formula / Snippet', 'GATE Truth & Common Trap']],
      body: list.map((c) => {
        const badge = `${c.kind.replace('_', ' ')}${c.highYield ? ' [HIGH-YIELD]' : ''}${c.outOf2027Syllabus ? ' [2027 REMOVED]' : ''}`;
        const leftCol = stripHtmlAndLatexForPdf(
          `${c.title}\n(${c.subtopic} · ${badge})`
        );
        const formulaOrCode = c.formulaLatex
          ? stripHtmlAndLatexForPdf(c.formulaLatex)
          : c.codeSnippet
          ? stripHtmlAndLatexForPdf(c.codeSnippet).slice(0, 260)
          : '—';
        const truthParts = [
          `TRUTH: ${stripHtmlAndLatexForPdf(c.gateTruth)}`,
          c.commonTrap ? `TRAP: ${stripHtmlAndLatexForPdf(c.commonTrap)}` : '',
          c.quickExample ? `EX: ${stripHtmlAndLatexForPdf(c.quickExample)}` : '',
        ].filter(Boolean);
        return [leftCol, formulaOrCode, truthParts.join('\n')];
      }),
      styles: {
        font: 'helvetica',
        fontSize: 7.6,
        textColor: INK,
        cellPadding: 2.2,
        lineColor: BORDER,
        lineWidth: 0.2,
        valign: 'top',
      },
      headStyles: {
        fillColor: MAROON,
        textColor: [255, 253, 249],
        fontStyle: 'bold',
        fontSize: 7.8,
      },
      alternateRowStyles: {
        fillColor: IVORY,
      },
      columnStyles: {
        0: { cellWidth: 44, fontStyle: 'bold', textColor: MAROON },
        1: { cellWidth: 48, font: 'courier', fontSize: 7.2 },
        2: { cellWidth: 'auto' },
      },
    });

    y =
      ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
        y + 24) + 6;
  }

  const pageCount = stampFooters(doc);
  return { doc, filename, pageCount };
}

/**
 * Direct A4 Formula Cheat Sheet `.pdf` downloader (works in sandboxed iframes & mobile WebViews).
 */
export async function downloadVaultCheatSheetPdf(
  cards: VaultCard[],
  options?: { title?: string; subtitle?: string }
): Promise<DirectPdfResult> {
  try {
    const { doc, filename, pageCount } = buildVaultCheatSheetPdf(cards, options);
    const blob = doc.output('blob');
    const sizeBytes = blob.size;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    window.setTimeout(() => {
      try {
        document.body.removeChild(anchor);
      } catch {
        // ignore
      }
      URL.revokeObjectURL(url);
    }, 1500);

    return { ok: true, filename, pageCount, sizeBytes };
  } catch (err) {
    return {
      ok: false,
      filename: '',
      pageCount: 0,
      sizeBytes: 0,
      error: err instanceof Error ? err.message : 'Cheat Sheet PDF generation failed.',
    };
  }
}
