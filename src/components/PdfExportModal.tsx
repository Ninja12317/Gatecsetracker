import React, { useState, useEffect } from 'react';
import {
  X,
  FileDown,
  Printer,
  FileText,
  BookOpenCheck,
  CheckSquare,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
} from 'lucide-react';
import type { PdfExportLayout, PdfExportRequest, WarRoomState } from '../types';
import type { ActivePrintJob } from './VectorPrintSheet';
import { downloadDirectPdf } from '../utils/pdfExporter';
import { formatBytesCompact } from '../utils/examPolish';

interface PdfExportModalProps {
  request: PdfExportRequest | null;
  state: WarRoomState;
  onClose: () => void;
  onTriggerPrint: (job: ActivePrintJob) => void;
  onDownloadSuccess?: (message: string) => void;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  request,
  state,
  onClose,
  onTriggerPrint,
  onDownloadSuccess,
}) => {
  const [layout, setLayout] = useState<PdfExportLayout>('worksheet');
  const [includeExplanation, setIncludeExplanation] = useState(true);
  const [includeSketch, setIncludeSketch] = useState(true);
  const [includeSourceLink, setIncludeSourceLink] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!request) return;
    if (request.kind === 'test-pack') {
      setLayout(request.defaultLayout ?? 'worksheet');
    } else {
      setLayout('solutions');
    }
    setIncludeExplanation(true);
    setIncludeSketch(true);
    setIncludeSourceLink(true);
    setGenerating(false);
    setFeedback(null);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, generating, onClose]);

  if (!request) return null;

  const buildJob = (): ActivePrintJob => ({
    request,
    layout,
    includeExplanation,
    includeSketch,
    includeSourceLink,
    generatedAt: new Date().toISOString(),
  });

  // Engine A (Default): Direct Real .PDF File Download via jsPDF + jspdf-autotable
  const handleDirectDownload = async () => {
    if (generating) return;
    setGenerating(true);
    setFeedback(null);

    // Yield one frame so the loading state renders immediately
    await new Promise<void>((resolve) => window.setTimeout(resolve, 24));

    const result = await downloadDirectPdf(buildJob(), state);
    setGenerating(false);

    if (result.ok) {
      const msg = `PDF downloaded: ${result.filename} (${result.pageCount} ${
        result.pageCount === 1 ? 'page' : 'pages'
      } · ${formatBytesCompact(result.sizeBytes)})`;
      setFeedback({ type: 'success', text: msg });
      onDownloadSuccess?.(msg);
    } else {
      setFeedback({
        type: 'error',
        text: result.error || 'Could not generate PDF. Try again or use Print Preview.',
      });
    }
  };

  // Engine B (Optional): Native Print / Save Vector PDF
  const handlePrintNow = () => {
    setFeedback({
      type: 'info',
      text: 'Opening browser print dialog... If blocked by an embedded preview, click "Download .PDF Directly".',
    });
    onTriggerPrint(buildJob());
  };

  const heading =
    request.kind === 'single-question'
      ? 'Export Single Question (.PDF)'
      : request.kind === 'test-pack'
      ? `Export ${request.questions.length} Questions (.PDF)`
      : request.kind === 'mock-report'
      ? 'Export Mock Analytics Report (.PDF)'
      : 'Export 70-Day Study Report (.PDF)';

  return (
    <div
      className="fixed inset-0 z-50 no-print flex items-center justify-center p-4 bg-[#1C1613]/45 dark:bg-black/70 backdrop-blur-[2px]"
      onClick={() => {
        if (!generating) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        data-testid="pdf-export-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[28px] squircle bg-white dark:bg-[#1C1714] border border-[#E8E0D5] dark:border-[#2E2520] shadow-warm-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-[#EFE9DF] dark:border-[#2E2520]">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-[14px] bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[#6E261A] dark:text-[#E0A92E] flex items-center justify-center shrink-0">
              <FileDown className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                {heading}
              </h2>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E]">
                Direct .PDF file download (works on desktop, mobile &amp; iframes) + A4 print option
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={onClose}
            aria-label="Close export dialog"
            className="h-8 w-8 rounded-full bg-[#F4EFE6] dark:bg-[#241D19] text-[#61554D] dark:text-[#A99B8E] flex items-center justify-center press-tactile disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {request.kind === 'test-pack' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                Academic PDF Layout
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setLayout('worksheet')}
                  className={`rounded-[20px] p-3.5 text-left border transition-all press-tactile ${
                    layout === 'worksheet'
                      ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#C89216] dark:border-[#E0A92E]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520]'
                  }`}
                >
                  <FileText className="w-4 h-4 text-[#6E261A] dark:text-[#E0A92E] mb-1.5" />
                  <p className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    Practice Worksheet PDF
                  </p>
                  <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                    Numbered Q1–Q{request.questions.length}, option boxes, rough-work space &amp; last-page Answer Key Table.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setLayout('solutions')}
                  className={`rounded-[20px] p-3.5 text-left border transition-all press-tactile ${
                    layout === 'solutions'
                      ? 'bg-[#FDF6E3] dark:bg-[#2C2215] border-[#C89216] dark:border-[#E0A92E]'
                      : 'bg-[#FAF8F4] dark:bg-[#241D19] border-[#E8E0D5] dark:border-[#2E2520]'
                  }`}
                >
                  <BookOpenCheck className="w-4 h-4 text-[#6E261A] dark:text-[#E0A92E] mb-1.5" />
                  <p className="text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                    Solution &amp; Review Booklet
                  </p>
                  <p className="text-[11px] text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                    Includes attempted vs. official answers, pace timing, full proofs, sketches &amp; mistake tags.
                  </p>
                </button>
              </div>
            </div>
          )}

          {request.kind === 'single-question' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#61554D] dark:text-[#A99B8E]">
                Include in Sheet
              </p>
              <div className="space-y-2">
                {[
                  {
                    checked: includeExplanation,
                    toggle: () => setIncludeExplanation((v) => !v),
                    label: 'Answer & Step-by-Step Explanation',
                  },
                  {
                    checked: includeSketch,
                    toggle: () => setIncludeSketch((v) => !v),
                    label: request.sketchDataUrl
                      ? 'My Saved Rough-Work Sketch (Attached)'
                      : 'My Saved Rough-Work Sketch (None saved for this question)',
                  },
                  {
                    checked: includeSourceLink,
                    toggle: () => setIncludeSourceLink((v) => !v),
                    label: 'GateOverflow Source Link',
                  },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={opt.toggle}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-[16px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] text-left text-xs font-medium text-[#1C1613] dark:text-[#F5F0E8] press-tactile"
                  >
                    {opt.checked ? (
                      <CheckSquare className="w-4 h-4 text-[#6E261A] dark:text-[#E0A92E] shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-[#8E7F72] shrink-0" />
                    )}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {request.kind === 'study-report' && (
            <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4 text-xs text-[#61554D] dark:text-[#A99B8E] space-y-1.5">
              <p className="font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                Includes your live GATE CSE 2027 snapshot:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Countdown phase, active study streak &amp; total deep-work hours</li>
                <li>All 12 GATE CSE subjects weighted mastery table</li>
                <li>Mock test performance summary &amp; priority weak areas</li>
              </ul>
            </div>
          )}

          {request.kind === 'mock-report' && (
            <div className="rounded-[20px] bg-[#FAF8F4] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#2E2520] p-4 text-xs text-[#61554D] dark:text-[#A99B8E] space-y-1.5">
              <p className="font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                Includes your full Mock Analytics dossier:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Normalized score %, mean accuracy &amp; total negative-marking bleed</li>
                <li>1-Mark vs. 2-Mark accuracy &amp; penalty split (GO Classes telemetry)</li>
                <li>Complete chronological Mock Test Archive table &amp; diagnostic takeaways</li>
              </ul>
            </div>
          )}

          <div className="rounded-[16px] bg-[#F4EFE6] dark:bg-[#241D19] px-3.5 py-2.5 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
            IIT Madras Header Stamp:{' '}
            <span className="font-semibold text-[#6E261A] dark:text-[#E0A92E]">
              GATE CSE 2027 · Built by Nihal Pawar
            </span>{' '}
            · Clean A4 pagination with page numbers.
          </div>

          {feedback && (
            <div
              role="status"
              data-testid={
                feedback.type === 'success'
                  ? 'pdf-download-success'
                  : feedback.type === 'error'
                  ? 'pdf-download-error'
                  : 'pdf-download-info'
              }
              className={`flex items-start gap-2.5 rounded-[18px] border px-4 py-3 text-xs font-semibold ${
                feedback.type === 'success'
                  ? 'border-[#B9D6C2] dark:border-[#254A33] bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F]'
                  : feedback.type === 'error'
                  ? 'border-[#EBC7C3] dark:border-[#5E2823] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80]'
                  : 'border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8E620C] dark:text-[#E0A92E]'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        {/* Footer — Dual-Engine Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-6 py-4 bg-[#FAF8F4] dark:bg-[#16110E] border-t border-[#EFE9DF] dark:border-[#2E2520]">
          <button
            type="button"
            disabled={generating}
            onClick={handlePrintNow}
            data-testid="pdf-print-dialog-btn"
            className="px-4 py-2 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-white dark:bg-[#1C1714] text-xs font-semibold text-[#61554D] dark:text-[#D8CBB8] hover:border-[#C89216] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] flex items-center gap-1.5 press-tactile disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Vector
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={generating}
              onClick={onClose}
              className="px-3.5 py-2 rounded-full text-xs font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] press-tactile disabled:opacity-50"
            >
              {feedback?.type === 'success' ? 'Done' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleDirectDownload()}
              data-testid="pdf-direct-download-btn"
              className="px-5 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white text-xs font-semibold flex items-center gap-2 shadow-sm press-tactile disabled:opacity-70"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download .PDF Directly
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
