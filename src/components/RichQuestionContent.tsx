import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { X, ZoomIn } from 'lucide-react';
import {
  containsBareLatex,
  decodeHtmlEntities,
  formatMathToPlainUnicode,
  renderKatexSafe,
  tokenizeMathText,
  unescapeDoubleLatex,
} from '../utils/mathFormat';

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Renders LaTeX math expressions ($$...$$, \[...\], $...$, \(...\), and bare un-delimited LaTeX)
 * into KaTeX HTML while preserving <pre> and <code> blocks untouched and gracefully degrading
 * malformed math to crisp plain Unicode (never raw `\text{` or `\;`).
 */
function renderLatexInHtml(rawInput: string): string {
  // 1. Protect <pre>...</pre> and <code>...</code> blocks from math replacement
  const placeholders: string[] = [];
  const stash = (fragment: string): string => {
    const idx = placeholders.length;
    placeholders.push(fragment);
    return `@@GATE_PROTECTED_${idx}@@`;
  };

  let text = rawInput.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => stash(match));

  // Normalize double-escaped delimiters outside code blocks
  text = text
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]');

  const safeKatex = (expr: string, displayMode: boolean): string => {
    const prepped = unescapeDoubleLatex(
      expr.replace(/<br\s*\/?>/gi, ' \\\\ ')
    ).trim();
    if (!prepped) return '';
    const res = renderKatexSafe(prepped, displayMode);
    if (!res.usedFallback && res.html) {
      return stash(res.html);
    }
    return stash(
      `<span class="font-mono text-[0.92em]">${escapeHtml(res.fallbackText)}</span>`
    );
  };

  // 2. Display math: $$...$$ and \[...\]
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => safeKatex(expr, true));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, expr: string) => safeKatex(expr, true));

  // 3. Inline math: \(...\) and $...$ (avoid matching currency like "$5 and $10")
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, expr: string) => safeKatex(expr, false));
  text = text.replace(/(?<!\\)\$(?!\s)([^$\n]{1,500}?)(?<!\s)\$/g, (full, expr: string) => {
    const trimmed = expr.trim();
    if (/^\d+(?:,\d{3})*(?:\.\d+)?(?:\s+[a-zA-Z]{2,})?$/.test(trimmed)) {
      return full;
    }
    return safeKatex(expr, false);
  });

  // 4. Catch bare un-delimited LaTeX inside HTML text nodes (between tags, outside stashed KaTeX/code)
  text = text.replace(/(^|>)([^<]+)(?=<|$)/g, (_m, prefix: string, chunk: string) => {
    if (!chunk || !containsBareLatex(chunk)) return `${prefix}${chunk}`;
    // Preserve any stashed placeholders inside the chunk
    const parts = chunk.split(/(@@GATE_PROTECTED_\d+@@)/g);
    const rendered = parts
      .map((part) => {
        if (!part || /^@@GATE_PROTECTED_\d+@@$/.test(part) || !containsBareLatex(part)) {
          return part;
        }
        const tokens = tokenizeMathText(part);
        return tokens
          .map((tok) => {
            if (tok.type === 'text') {
              return escapeHtml(
                containsBareLatex(tok.value) ? formatMathToPlainUnicode(tok.value) : tok.value
              );
            }
            if (tok.type === 'code') {
              return `<code>${escapeHtml(tok.value)}</code>`;
            }
            return safeKatex(tok.value, tok.type === 'display-math');
          })
          .join('');
      })
      .join('');
    return `${prefix}${rendered}`;
  });

  // 5. Restore protected code & KaTeX blocks (2 passes in case of nested stashes)
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/@@GATE_PROTECTED_(\d+)@@/g, (_m, idxStr: string) => {
      return placeholders[Number(idxStr)] ?? '';
    });
  }

  return text;
}

function sanitizeAndFormatHtml(rawHtml?: string, plainText?: string): string {
  const source = rawHtml && rawHtml.trim().length > 0
    ? rawHtml
    : plainText
    ? `<p>${escapeHtml(decodeHtmlEntities(plainText)).replace(/\n/g, '<br/>')}</p>`
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
