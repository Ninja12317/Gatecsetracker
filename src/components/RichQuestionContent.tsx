import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { X, ZoomIn } from 'lucide-react';

interface RichQuestionContentProps {
  html?: string;
  plainText?: string;
  inline?: boolean;
  className?: string;
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 's', 'del',
  'ol', 'ul', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'pre', 'code', 'img', 'blockquote', 'span', 'div', 'hr', 'h3', 'h4', 'a',
  // KaTeX MathML/SVG tags rendered after math expansion
  'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup',
  'mfrac', 'msqrt', 'mroot', 'mtext', 'mspace', 'mtable', 'mtr', 'mtd',
  'mover', 'munder', 'munderover', 'annotation', 'svg', 'path', 'line', 'rect', 'g',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan',
  'class', 'style', 'aria-hidden', 'target', 'rel',
  'xmlns', 'viewBox', 'd', 'preserveAspectRatio', 'encoding', 'mathvariant',
];

/**
 * Renders LaTeX math expressions ($$...$$, \[...\], $...$, \(...\)) into KaTeX HTML
 * while preserving <pre> and <code> blocks untouched.
 */
function renderLatexInHtml(rawInput: string): string {
  // 1. Protect <pre>...</pre> and <code>...</code> blocks from math replacement
  const codePlaceholders: string[] = [];
  let text = rawInput.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(match);
    return `@@CODE_BLOCK_${idx}@@`;
  });

  // Decode common HTML entities inside math expressions (e.g. &lt; &gt; &amp;)
  const decodeMathEntities = (expr: string) =>
    expr
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/<br\s*\/?>/gi, ' \\\\ ');

  const safeKatex = (expr: string, displayMode: boolean): string => {
    const cleaned = decodeMathEntities(expr).trim();
    if (!cleaned) return '';
    try {
      return katex.renderToString(cleaned, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      return cleaned;
    }
  };

  // 2. Display math: $$...$$ and \[...\]
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => safeKatex(expr, true));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, expr: string) => safeKatex(expr, true));

  // 3. Inline math: \(...\) and $...$ (avoid matching currency like "$5 and $10" across huge spans)
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, expr: string) => safeKatex(expr, false));
  text = text.replace(/(?<!\\)\$(?!\s)([^$\n]{1,500}?)(?<!\s)\$/g, (_m, expr: string) => {
    // Skip pure currency numbers like $50
    if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(expr.trim())) {
      return `$${expr}$`;
    }
    return safeKatex(expr, false);
  });

  // 4. Restore <pre> / <code> blocks
  text = text.replace(/@@CODE_BLOCK_(\d+)@@/g, (_m, idxStr: string) => {
    return codePlaceholders[Number(idxStr)] ?? '';
  });

  return text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeAndFormatHtml(rawHtml?: string, plainText?: string): string {
  const source = rawHtml && rawHtml.trim().length > 0
    ? rawHtml
    : plainText
    ? `<p>${escapeHtml(plainText).replace(/\n/g, '<br/>')}</p>`
    : '';

  if (!source) return '';

  // Pre-sanitize raw external HTML before math rendering to eliminate scripts/handlers
  const preClean = DOMPurify.sanitize(source, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });

  // Render KaTeX math safely
  const withMath = renderLatexInHtml(preClean);

  // Final DOMPurify pass enforcing safe protocols and safe external links
  const finalClean = DOMPurify.sanitize(withMath, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style'],
  });

  // Ensure all anchor links open cleanly in a new tab with noopener noreferrer
  return finalClean.replace(/<a\b([^>]*?)>/gi, (match, attrs: string) => {
    if (!/href\s*=\s*["']https?:\/\//i.test(attrs)) return '<span>';
    const hasTarget = /target\s*=/i.test(attrs);
    const hasRel = /rel\s*=/i.test(attrs);
    const extra = `${hasTarget ? '' : ' target="_blank"'}${hasRel ? '' : ' rel="noopener noreferrer"'}`;
    return `<a${attrs}${extra}>`;
  });
}

export const RichQuestionContent: React.FC<RichQuestionContentProps> = React.memo(
  ({ html, plainText, inline = false, className = '' }) => {
    const [zoomedImg, setZoomedImg] = useState<{ src: string; alt: string } | null>(null);

    const sanitizedHtml = useMemo(
      () => sanitizeAndFormatHtml(html, plainText),
      [html, plainText]
    );

    const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        if (img.src && /^https?:\/\//i.test(img.src)) {
          e.stopPropagation();
          e.preventDefault();
          setZoomedImg({ src: img.src, alt: img.alt || 'GATE Question Diagram' });
        }
      }
    }, []);

    useEffect(() => {
      if (!zoomedImg) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setZoomedImg(null);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [zoomedImg]);

    return (
      <>
        <div
          onClick={handleContainerClick}
          className={`gater-prose ${inline ? 'gater-prose-inline' : ''} ${className}`}
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />

        {zoomedImg &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Zoomed diagram viewer"
              onClick={() => setZoomedImg(null)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[#130F0D]/80 p-4 sm:p-8"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center rounded-[28px] squircle border border-[#352A24] bg-[#FAF8F4] dark:bg-[#1C1714] p-4 sm:p-6 shadow-warm-lg"
              >
                <div className="w-full flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#E8E0D5] dark:border-[#2E2520]">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                    <ZoomIn className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
                    <span>{zoomedImg.alt}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setZoomedImg(null)}
                    aria-label="Close diagram zoom"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#E8E0D5] dark:border-[#2E2520] text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8] press-tactile"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="overflow-auto max-h-[75vh] w-full flex items-center justify-center rounded-[20px] bg-[#FFFFFF] p-4 border border-[#E8E0D5]">
                  <img
                    src={zoomedImg.src}
                    alt={zoomedImg.alt}
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                </div>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }
);

RichQuestionContent.displayName = 'RichQuestionContent';
