import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  formatMathToPlainUnicode,
  renderKatexSafe,
  tokenizeMathText,
} from '../utils/mathFormat';

export { formatMathToPlainUnicode };

const KATEX_PURIFY_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_ATTR: [
    'style',
    'aria-hidden',
    'xmlns',
    'encoding',
    'viewBox',
    'preserveAspectRatio',
    'width',
    'height',
    'd',
  ],
};

function sanitizeKatexHtml(html: string): string {
  if (!html) return '';
  return String(DOMPurify.sanitize(html, KATEX_PURIFY_CONFIG));
}

export interface FormulaBlockProps {
  latex: string;
  compact?: boolean;
  darkSurface?: boolean;
  className?: string;
}

/**
 * Universal display/compact KaTeX equation block with double-backslash unescaping,
 * HTML entity decoding, horizontal scroll protection, and zero-raw-text Unicode fallback.
 */
export const FormulaBlock: React.FC<FormulaBlockProps> = React.memo(
  ({ latex, compact = false, darkSurface = false, className = '' }) => {
    const rendered = useMemo(() => {
      const res = renderKatexSafe(latex, !compact);
      if (!res.usedFallback && res.html) {
        return {
          usedFallback: false,
          safeHtml: sanitizeKatexHtml(res.html),
          fallbackText: res.fallbackText,
        };
      }
      return {
        usedFallback: true,
        safeHtml: '',
        fallbackText: res.fallbackText,
      };
    }, [latex, compact]);

    if (!rendered.safeHtml && !rendered.fallbackText) return null;

    const containerTone = darkSurface
      ? 'text-[#FAF5EB]'
      : 'text-[#1C1613] dark:text-[#F5F0E8]';

    if (rendered.usedFallback || !rendered.safeHtml) {
      return (
        <div
          data-no-swipe="true"
          className={`max-w-full overflow-x-auto no-scrollbar font-mono ${
            compact ? 'text-xs' : 'text-[13px]'
          } leading-relaxed whitespace-pre-wrap break-words ${containerTone} ${className}`}
        >
          {rendered.fallbackText}
        </div>
      );
    }

    return (
      <div
        data-no-swipe="true"
        className={`gate-formula-block max-w-full overflow-x-auto no-scrollbar py-0.5 ${
          compact ? 'text-[13px]' : 'text-[14px] sm:text-[15px]'
        } leading-relaxed ${containerTone} ${className}`}
        dangerouslySetInnerHTML={{ __html: rendered.safeHtml }}
      />
    );
  }
);

FormulaBlock.displayName = 'FormulaBlock';

export interface MathTextProps {
  text: string;
  darkSurface?: boolean;
  inline?: boolean;
  className?: string;
}

/**
 * Universal prose + inline code + KaTeX math renderer.
 * Automatically decodes HTML entities, renders `$...$`, `$$...$$`, `\(...\)`, `\[...\]`,
 * catches bare un-delimited LaTeX, and degrades malformed math to crisp plain Unicode.
 */
export const MathText: React.FC<MathTextProps> = React.memo(
  ({ text, darkSurface = false, inline = false, className = '' }) => {
    const tokens = useMemo(() => tokenizeMathText(text), [text]);

    if (!text) return null;

    const codeChipClass = darkSurface
      ? 'mx-0.5 rounded-md bg-[#120D0A] border border-[#3E3028] px-1.5 py-0.5 font-mono text-[0.88em] text-[#E5B23A]'
      : 'mx-0.5 rounded-md bg-[#F4EFE6] dark:bg-[#241D19] border border-[#E8E0D5] dark:border-[#352A24] px-1.5 py-0.5 font-mono text-[0.88em] text-[#6E261A] dark:text-[#E0A92E]';

    const content = tokens.map((tok, idx) => {
      if (tok.type === 'text') {
        return <React.Fragment key={idx}>{tok.value}</React.Fragment>;
      }
      if (tok.type === 'code') {
        return (
          <code key={idx} className={codeChipClass}>
            {tok.value}
          </code>
        );
      }
      if (tok.type === 'display-math') {
        if (inline) {
          const res = renderKatexSafe(tok.value, false);
          if (!res.usedFallback && res.html) {
            return (
              <span
                key={idx}
                className="gate-inline-math inline-block align-middle max-w-full overflow-x-auto no-scrollbar"
                dangerouslySetInnerHTML={{ __html: sanitizeKatexHtml(res.html) }}
              />
            );
          }
          return (
            <span key={idx} className="font-mono text-[0.92em]">
              {res.fallbackText}
            </span>
          );
        }
        return (
          <FormulaBlock
            key={idx}
            latex={tok.value}
            darkSurface={darkSurface}
            className="my-1.5"
          />
        );
      }

      // inline-math
      const res = renderKatexSafe(tok.value, false);
      if (!res.usedFallback && res.html) {
        return (
          <span
            key={idx}
            className="gate-inline-math align-baseline"
            dangerouslySetInnerHTML={{ __html: sanitizeKatexHtml(res.html) }}
          />
        );
      }
      return (
        <span key={idx} className="font-mono text-[0.92em]">
          {res.fallbackText}
        </span>
      );
    });

    if (inline) {
      return <span className={className}>{content}</span>;
    }

    return <span className={className}>{content}</span>;
  }
);

MathText.displayName = 'MathText';
