import katex from 'katex';

export type MathTextToken =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'inline-math'; value: string }
  | { type: 'display-math'; value: string };

export interface KatexRenderResult {
  html: string;
  fallbackText: string;
  usedFallback: boolean;
}

const HTML_ENTITY_UNICODE_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
  ndash: '–',
  mdash: '—',
  minus: '−',
  times: '×',
  divide: '÷',
  plusmn: '±',
  le: '≤',
  ge: '≥',
  ne: '≠',
  asymp: '≈',
  equiv: '≡',
  rarr: '→',
  larr: '←',
  harr: '↔',
  rArr: '⇒',
  lArr: '⇐',
  hArr: '⇔',
  infin: '∞',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  isin: '∈',
  notin: '∉',
  sub: '⊂',
  sube: '⊆',
  cap: '∩',
  cup: '∪',
  empty: '∅',
  forall: '∀',
  exist: '∃',
  and: '∧',
  or: '∨',
  not: '¬',
  oplus: '⊕',
  radic: '√',
  sum: 'Σ',
  prod: 'Π',
  middot: '·',
  bull: '•',
  deg: '°',
  Theta: 'Θ',
  theta: 'θ',
  Omega: 'Ω',
  omega: 'ω',
  Sigma: 'Σ',
  sigma: 'σ',
  Delta: 'Δ',
  delta: 'δ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  epsilon: 'ε',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  tau: 'τ',
  phi: 'φ',
};

/**
 * Decodes named and numeric HTML entities cleanly (handles double-encoded entities such as &amp;lt;).
 */
export function decodeHtmlEntities(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = String(raw);
  const decodeOnce = (input: string) =>
    input.replace(/&([a-zA-Z0-9#]+);/g, (full, entity: string) => {
      const exact = HTML_ENTITY_UNICODE_MAP[entity];
      if (exact !== undefined) return exact;
      const lower = HTML_ENTITY_UNICODE_MAP[entity.toLowerCase()];
      if (lower !== undefined) return lower;
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const cp = parseInt(entity.slice(2), 16);
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
          ? String.fromCodePoint(cp)
          : full;
      }
      if (entity.startsWith('#')) {
        const cp = parseInt(entity.slice(1), 10);
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
          ? String.fromCodePoint(cp)
          : full;
      }
      return full;
    });

  const first = decodeOnce(text);
  const second = /&[a-zA-Z0-9#]+;/.test(first) ? decodeOnce(first) : first;
  return second.replace(/\u00A0/g, ' ');
}

/**
 * Unescapes double-escaped LaTeX backslashes (e.g. `\\text`, `\\frac`, `\\log`, `\\;`, `\\quad`)
 * while preserving genuine LaTeX matrix/cases row breaks (`\\ ` or `\\\n`).
 */
export function unescapeDoubleLatex(raw: string): string {
  if (!raw || !raw.includes('\\\\')) return raw;
  return raw.replace(/\\\\(?=[a-zA-Z]{2,}|[;,!:{}[\]()|])/g, '\\');
}

/**
 * Pre-cleans a LaTeX expression before sending it to KaTeX.
 * Unescapes double-escaped backslashes, decodes HTML entities, and strips outer math delimiters.
 */
export function cleanLatexExpression(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = decodeHtmlEntities(String(raw)).trim();
  s = unescapeDoubleLatex(s);

  // Strip stray matching outer delimiters repeatedly (e.g. `$$...$$`, `$...$`, `\[...\]`, `\(...\)`)
  for (let i = 0; i < 2; i++) {
    if (s.startsWith('$$') && s.endsWith('$$') && s.length > 4) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith('\\[') && s.endsWith('\\]') && s.length > 4) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith('\\(') && s.endsWith('\\)') && s.length > 4) {
      s = s.slice(2, -2).trim();
    } else if (
      s.startsWith('$') &&
      s.endsWith('$') &&
      s.length > 2 &&
      !s.slice(1, -1).includes('$')
    ) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }

  // Re-run unescape in case stripping delimiters exposed leading escaped commands
  s = unescapeDoubleLatex(s);

  // Escape bare `&` inside `\text{...}` (or anywhere outside matrix/cases/align environments)
  // so KaTeX never fails with "Misplaced alignment tab character &"
  if (!/\\begin\{(?:cases|dcases|rcases|array|matrix|pmatrix|bmatrix|vmatrix|Bmatrix|Vmatrix|align|aligned|eqnarray|tabular)\}/.test(s)) {
    s = s.replace(/(^|[^\\])&/g, '$1\\&');
  } else {
    // Still escape bare `&` inside \text{...} even when an alignment environment is present
    s = s.replace(/\\text\{([^{}]*)\}/g, (_m, inner: string) => {
      return `\\text{${inner.replace(/(^|[^\\])&/g, '$1\\&')}}`;
    });
  }
  // Escape bare `%` so KaTeX doesn't swallow the rest of the equation as a TeX comment
  s = s.replace(/(^|[^\\])%/g, '$1\\%');

  return s.replace(/\u00A0/g, ' ').trim();
}

/**
 * Reads a balanced `{...}` group starting at `startIdx`. Returns inner text and index after `}`.
 */
function readBalancedBraces(
  str: string,
  startIdx: number
): { content: string; endIdx: number } | null {
  let i = startIdx;
  while (i < str.length && str[i] === ' ') i++;
  if (i >= str.length || str[i] !== '{') return null;
  let depth = 0;
  let contentStart = i + 1;
  for (let j = i; j < str.length; j++) {
    const ch = str[j];
    if (ch === '\\' && j + 1 < str.length) {
      j++; // skip escaped brace
      continue;
    }
    if (ch === '{') {
      depth++;
      if (depth === 1) contentStart = j + 1;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { content: str.slice(contentStart, j), endIdx: j + 1 };
      }
    }
  }
  // Unclosed brace — degrade gracefully by taking remainder
  return { content: str.slice(contentStart), endIdx: str.length };
}

/**
 * Replaces 1-argument LaTeX commands (`\text{...}`, `\sqrt{...}`, etc.) with balanced brace support.
 */
function replaceOneArgCommands(
  input: string,
  commands: string[],
  transform: (cmd: string, arg: string) => string
): string {
  const cmdSet = new Set(commands);
  const regex = new RegExp(`\\\\(${commands.join('|')})(?![a-zA-Z])`, 'g');
  let current = input;

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    let out = '';
    let idx = 0;
    regex.lastIndex = 0;

    while (idx < current.length) {
      regex.lastIndex = idx;
      const match = regex.exec(current);
      if (!match) {
        out += current.slice(idx);
        break;
      }
      const matchStart = match.index;
      const cmd = match[1];
      if (!cmdSet.has(cmd)) {
        out += current.slice(idx, matchStart + match[0].length);
        idx = matchStart + match[0].length;
        continue;
      }

      out += current.slice(idx, matchStart);
      let cursor = matchStart + match[0].length;

      // Optional bracket arg (e.g. `\sqrt[3]{x}`)
      let optArg = '';
      if (cmd === 'sqrt' && current[cursor] === '[') {
        const closeBracket = current.indexOf(']', cursor + 1);
        if (closeBracket !== -1) {
          optArg = current.slice(cursor + 1, closeBracket);
          cursor = closeBracket + 1;
        }
      }

      const group = readBalancedBraces(current, cursor);
      if (group) {
        changed = true;
        const inner = replaceOneArgCommands(group.content, commands, transform);
        if (cmd === 'sqrt' && optArg) {
          out += `${optArg}√(${inner})`;
        } else {
          out += transform(cmd, inner);
        }
        idx = group.endIdx;
      } else {
        // No braces — consume single char or leave transformed empty
        out += '';
        idx = cursor;
        changed = true;
      }
    }

    current = out;
    if (!changed) break;
  }

  return current;
}

/**
 * Replaces 2-argument LaTeX commands (`\frac{a}{b}`, `\binom{n}{k}`, etc.) with balanced brace support.
 */
function replaceTwoArgCommands(
  input: string,
  commands: string[],
  transform: (cmd: string, arg1: string, arg2: string) => string
): string {
  const regex = new RegExp(`\\\\(${commands.join('|')})(?![a-zA-Z])`, 'g');
  let current = input;

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    let out = '';
    let idx = 0;
    regex.lastIndex = 0;

    while (idx < current.length) {
      regex.lastIndex = idx;
      const match = regex.exec(current);
      if (!match) {
        out += current.slice(idx);
        break;
      }
      const matchStart = match.index;
      const cmd = match[1];
      out += current.slice(idx, matchStart);
      const afterCmd = matchStart + match[0].length;

      const g1 = readBalancedBraces(current, afterCmd);
      if (!g1) {
        idx = afterCmd;
        changed = true;
        continue;
      }
      const g2 = readBalancedBraces(current, g1.endIdx);
      if (!g2) {
        out += g1.content;
        idx = g1.endIdx;
        changed = true;
        continue;
      }

      changed = true;
      const a1 = replaceTwoArgCommands(g1.content, commands, transform);
      const a2 = replaceTwoArgCommands(g2.content, commands, transform);
      out += transform(cmd, a1, a2);
      idx = g2.endIdx;
    }

    current = out;
    if (!changed) break;
  }

  return current;
}

const SYMBOL_MAP: Array<[RegExp, string]> = [
  // Logical & arrows (longest commands first)
  [/\\(?:Longleftrightarrow|iff)(?![a-zA-Z])/g, ' ⇔ '],
  [/\\(?:Leftrightarrow)(?![a-zA-Z])/g, ' ⇔ '],
  [/\\(?:Longrightarrow|implies|Rightarrow)(?![a-zA-Z])/g, ' ⇒ '],
  [/\\(?:Longleftarrow|Leftarrow)(?![a-zA-Z])/g, ' ⇐ '],
  [/\\(?:longrightarrow|rightarrow|mapsto|to)(?![a-zA-Z])/g, ' → '],
  [/\\(?:longleftarrow|leftarrow)(?![a-zA-Z])/g, ' ← '],
  [/\\leftrightarrow(?![a-zA-Z])/g, ' ↔ '],

  // Relations & operators
  [/\\(?:leq|le|leqslant)(?![a-zA-Z])/g, ' ≤ '],
  [/\\(?:geq|ge|geqslant)(?![a-zA-Z])/g, ' ≥ '],
  [/\\(?:neq|ne)(?![a-zA-Z])/g, ' ≠ '],
  [/\\approx(?![a-zA-Z])/g, ' ≈ '],
  [/\\equiv(?![a-zA-Z])/g, ' ≡ '],
  [/\\sim(?![a-zA-Z])/g, ' ~ '],
  [/\\propto(?![a-zA-Z])/g, ' ∝ '],
  [/\\ll(?![a-zA-Z])/g, ' ≪ '],
  [/\\gg(?![a-zA-Z])/g, ' ≫ '],
  [/\\times(?![a-zA-Z])/g, ' × '],
  [/\\cdot(?![a-zA-Z])/g, ' · '],
  [/\\div(?![a-zA-Z])/g, ' ÷ '],
  [/\\pm(?![a-zA-Z])/g, ' ± '],
  [/\\mp(?![a-zA-Z])/g, ' ∓ '],
  [/\\oplus(?![a-zA-Z])/g, ' ⊕ '],
  [/\\otimes(?![a-zA-Z])/g, ' ⊗ '],
  [/\\circ(?![a-zA-Z])/g, ' ∘ '],
  [/\\ast(?![a-zA-Z])/g, ' * '],

  // Floor & ceiling
  [/\\lfloor(?![a-zA-Z])/g, '⌊'],
  [/\\rfloor(?![a-zA-Z])/g, '⌋'],
  [/\\lceil(?![a-zA-Z])/g, '⌈'],
  [/\\rceil(?![a-zA-Z])/g, '⌉'],
  [/\\langle(?![a-zA-Z])/g, '⟨'],
  [/\\rangle(?![a-zA-Z])/g, '⟩'],

  // Sets & logic
  [/\\notin(?![a-zA-Z])/g, ' ∉ '],
  [/\\in(?![a-zA-Z])/g, ' ∈ '],
  [/\\subseteq(?![a-zA-Z])/g, ' ⊆ '],
  [/\\subset(?![a-zA-Z])/g, ' ⊂ '],
  [/\\supseteq(?![a-zA-Z])/g, ' ⊇ '],
  [/\\supset(?![a-zA-Z])/g, ' ⊃ '],
  [/\\cap(?![a-zA-Z])/g, ' ∩ '],
  [/\\cup(?![a-zA-Z])/g, ' ∪ '],
  [/\\setminus(?![a-zA-Z])/g, ' \\ '],
  [/\\(?:emptyset|varnothing)(?![a-zA-Z])/g, '∅'],
  [/\\infty(?![a-zA-Z])/g, '∞'],
  [/\\forall(?![a-zA-Z])/g, '∀'],
  [/\\nexists(?![a-zA-Z])/g, '∄'],
  [/\\exists(?![a-zA-Z])/g, '∃'],
  [/\\(?:land|wedge)(?![a-zA-Z])/g, ' ∧ '],
  [/\\(?:lor|vee)(?![a-zA-Z])/g, ' ∨ '],
  [/\\(?:lnot|neg)(?![a-zA-Z])/g, '¬'],
  [/\\vdash(?![a-zA-Z])/g, ' ⊢ '],
  [/\\models(?![a-zA-Z])/g, ' ⊨ '],
  [/\\therefore(?![a-zA-Z])/g, '∴ '],
  [/\\because(?![a-zA-Z])/g, '∵ '],
  [/\\top(?![a-zA-Z])/g, '⊤'],
  [/\\bot(?![a-zA-Z])/g, '⊥'],

  // Big operators & calculus
  [/\\sum(?![a-zA-Z])/g, 'Σ'],
  [/\\prod(?![a-zA-Z])/g, 'Π'],
  [/\\int(?![a-zA-Z])/g, '∫'],
  [/\\partial(?![a-zA-Z])/g, '∂'],
  [/\\nabla(?![a-zA-Z])/g, '∇'],
  [/\\(?:cdots|ldots|dots|vdots|ddots)(?![a-zA-Z])/g, '…'],
  [/\\mid(?![a-zA-Z])/g, ' | '],
  [/\\nmid(?![a-zA-Z])/g, ' ∤ '],

  // Greek letters
  [/\\Theta(?![a-zA-Z])/g, 'Θ'],
  [/\\theta(?![a-zA-Z])/g, 'θ'],
  [/\\Omega(?![a-zA-Z])/g, 'Ω'],
  [/\\omega(?![a-zA-Z])/g, 'ω'],
  [/\\Sigma(?![a-zA-Z])/g, 'Σ'],
  [/\\sigma(?![a-zA-Z])/g, 'σ'],
  [/\\Delta(?![a-zA-Z])/g, 'Δ'],
  [/\\delta(?![a-zA-Z])/g, 'δ'],
  [/\\Gamma(?![a-zA-Z])/g, 'Γ'],
  [/\\gamma(?![a-zA-Z])/g, 'γ'],
  [/\\Lambda(?![a-zA-Z])/g, 'Λ'],
  [/\\lambda(?![a-zA-Z])/g, 'λ'],
  [/\\Pi(?![a-zA-Z])/g, 'Π'],
  [/\\pi(?![a-zA-Z])/g, 'π'],
  [/\\Phi(?![a-zA-Z])/g, 'Φ'],
  [/\\(?:varphi|phi)(?![a-zA-Z])/g, 'φ'],
  [/\\Psi(?![a-zA-Z])/g, 'Ψ'],
  [/\\psi(?![a-zA-Z])/g, 'ψ'],
  [/\\alpha(?![a-zA-Z])/g, 'α'],
  [/\\beta(?![a-zA-Z])/g, 'β'],
  [/\\(?:varepsilon|epsilon)(?![a-zA-Z])/g, 'ε'],
  [/\\zeta(?![a-zA-Z])/g, 'ζ'],
  [/\\eta(?![a-zA-Z])/g, 'η'],
  [/\\iota(?![a-zA-Z])/g, 'ι'],
  [/\\kappa(?![a-zA-Z])/g, 'κ'],
  [/\\mu(?![a-zA-Z])/g, 'μ'],
  [/\\nu(?![a-zA-Z])/g, 'ν'],
  [/\\xi(?![a-zA-Z])/g, 'ξ'],
  [/\\rho(?![a-zA-Z])/g, 'ρ'],
  [/\\tau(?![a-zA-Z])/g, 'τ'],
  [/\\chi(?![a-zA-Z])/g, 'χ'],

  // Standard math function names (with clean spacing)
  [/\\(log|ln|lg|exp|sin|cos|tan|cot|sec|csc|min|max|inf|sup|lim|det|gcd|lcm|Pr|deg|arg)(?![a-zA-Z])/g, ' $1 '],
  [/\\(?:pmod|bmod|mod)(?![a-zA-Z])/g, ' mod '],
];

/**
 * Strips all raw HTML tags, HTML entities, and LaTeX syntax into crisp, readable plain Unicode.
 * Guarantees ZERO raw `\text{`, `\frac`, `\;`, `\quad`, `$...$`, or HTML entity leaks.
 */
export function formatMathToPlainUnicode(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = String(raw);

  // Strip HTML tags cleanly while preserving structural line breaks
  if (/<[a-zA-Z!/]/.test(text)) {
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
  }

  text = decodeHtmlEntities(text);
  text = unescapeDoubleLatex(text);

  // Strip math delimiters cleanly without damaging currency like "$50"
  text = text
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, (full, inner: string) => {
      // Avoid stripping "$50 to $100" currency pairs where inner starts with digits and plain English
      if (/^\d+(?:\.\d+)?\s+[a-zA-Z]{2,}/.test(inner.trim())) {
        return full;
      }
      return inner;
    });

  // Remove environment wrappers
  text = text
    .replace(/\\begin\{[^{}]+\}/g, '')
    .replace(/\\end\{[^{}]+\}/g, '')
    .replace(/\\\\(?=\s|$)/g, '; ');

  // 2-arg commands: \frac, \dfrac, \tfrac, \cfrac, \binom
  text = replaceTwoArgCommands(
    text,
    ['frac', 'dfrac', 'tfrac', 'cfrac', 'binom'],
    (cmd, a, b) => {
      if (cmd === 'binom') return `C(${a.trim()}, ${b.trim()})`;
      return `(${a.trim()})/(${b.trim()})`;
    }
  );

  // 1-arg commands: \text, \mathrm, \sqrt, \overline, etc.
  text = replaceOneArgCommands(
    text,
    [
      'text',
      'textbf',
      'textit',
      'textrm',
      'texttt',
      'textsf',
      'mathrm',
      'mathbf',
      'mathit',
      'mathcal',
      'mathbb',
      'mathsf',
      'mathtt',
      'operatorname',
      'mbox',
      'hbox',
      'sqrt',
      'overline',
      'bar',
      'hat',
      'tilde',
      'vec',
      'underline',
      'boxed',
      'underbrace',
      'overbrace',
    ],
    (cmd, inner) => {
      if (cmd === 'sqrt') return `√(${inner.trim()})`;
      if (cmd === 'overline' || cmd === 'bar') {
        const trimmed = inner.trim();
        return trimmed.length === 1 ? `${trimmed}\u0304` : `(${trimmed})'`;
      }
      return inner;
    }
  );

  // Sizing & spacing commands (no broken \b after non-word punctuation!)
  text = text
    .replace(/\\(?:left|right|big|Big|bigg|Bigg|middle|displaystyle|textstyle|scriptstyle|limits|nolimits)(?![a-zA-Z])/g, '')
    .replace(/\\(?:qquad|quad|enspace|thinspace|medspace|thickspace)(?![a-zA-Z])/g, ' ')
    .replace(/\\hspace\{[^{}]*\}/g, ' ')
    .replace(/\\[;,!: ]/g, ' ')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\\|/g, '‖')
    .replace(/\\%/g, '%')
    .replace(/\\&/g, '&')
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
    .replace(/\\\$/g, '$');

  // Symbol replacements
  for (const [pattern, replacement] of SYMBOL_MAP) {
    text = text.replace(pattern, replacement);
  }

  // Clean subscripts & superscripts with balanced brace handling
  const cleanSubSup = (src: string): string => {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if ((ch === '_' || ch === '^') && src[i + 1] === '{') {
        const g = readBalancedBraces(src, i + 1);
        if (g) {
          const inner = cleanSubSup(g.content).trim();
          const simpleToken = /^[A-Za-z0-9]+$/.test(inner);
          out += simpleToken ? `${ch}${inner}` : `${ch}(${inner})`;
          i = g.endIdx;
          continue;
        }
      }
      out += ch;
      i++;
    }
    return out;
  };
  text = cleanSubSup(text);

  // Strip any leftover unrecognized \command backslashes cleanly so zero raw LaTeX leaks
  text = text.replace(/\\([a-zA-Z]+)/g, '$1');

  // Tidy spacing around punctuation and parentheses
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]+/g, ' ')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/⌊\s+/g, '⌊')
        .replace(/\s+⌋/g, '⌋')
        .replace(/⌈\s+/g, '⌈')
        .replace(/\s+⌉/g, '⌉')
        .replace(/\s+,/g, ',')
        .replace(/\s+;/g, ';')
        .replace(/([a-zA-Z0-9)])\s+log\s+([a-zA-Z0-9(|])/g, '$1 log $2')
        .replace(/\(\s*log\s+/g, '(log ')
        .trim()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Detects plain-English / code-style invariant strings (such as "EPI criterion: ∃ minterm m ∈ On-Set...")
 * that contain NO LaTeX commands and would have their spaces stripped by KaTeX math mode.
 */
function isPlainProseWithoutLatex(cleaned: string): boolean {
  if (/\\[a-zA-Z;,!{}[\]()|]/.test(cleaned)) return false;
  if (/[_^]\{[^{}]+\}/.test(cleaned)) return false;
  // Contains C logical operators or multiple consecutive English words (3+ letters each)
  if (cleaned.includes('&&') || cleaned.includes('||')) return true;
  if (/\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/.test(cleaned)) return true;
  return false;
}

/**
 * Safely renders a LaTeX expression to KaTeX HTML.
 * If KaTeX throws, produces an error node, or input is plain-English prose without LaTeX,
 * gracefully returns `usedFallback: true` with clean Unicode text.
 */
export function renderKatexSafe(
  rawLatex: string | undefined | null,
  displayMode: boolean
): KatexRenderResult {
  const cleaned = cleanLatexExpression(rawLatex);
  const fallbackText = formatMathToPlainUnicode(cleaned);

  if (!cleaned) {
    return { html: '', fallbackText: '', usedFallback: false };
  }

  if (isPlainProseWithoutLatex(cleaned)) {
    return { html: '', fallbackText, usedFallback: true };
  }

  try {
    const html = katex.renderToString(cleaned, {
      displayMode,
      throwOnError: true,
      strict: false,
      trust: false,
    });
    if (!html || html.includes('katex-error')) {
      return { html: '', fallbackText, usedFallback: true };
    }
    return { html, fallbackText, usedFallback: false };
  } catch {
    return { html: '', fallbackText, usedFallback: true };
  }
}

// Pattern identifying genuine bare LaTeX commands (never plain English prose or Windows paths)
const BARE_LATEX_COMMAND_RE =
  /\\(?:text|textbf|textit|textrm|mathrm|mathbf|mathcal|mathbb|operatorname|frac|dfrac|tfrac|cfrac|sqrt|sum|prod|int|log|ln|lg|le|leq|ge|geq|ne|neq|approx|equiv|to|rightarrow|leftarrow|implies|Rightarrow|iff|Leftrightarrow|times|cdot|pm|mp|oplus|otimes|in|notin|subset|subseteq|supset|supseteq|cap|cup|emptyset|varnothing|infty|forall|exists|land|wedge|lor|vee|lnot|neg|Theta|theta|Omega|omega|Sigma|sigma|alpha|beta|gamma|delta|Delta|epsilon|varepsilon|lambda|Lambda|mu|pi|Pi|tau|phi|varphi|psi|Psi|lfloor|rfloor|lceil|rceil|binom|overline|bar|hat|tilde|left|right|quad|qquad|bmod|pmod|mod|cdots|ldots|dots|begin|end)(?![a-zA-Z])|\\[;,!]|\\\{|\\\}/;

const BRACED_SUB_SUP_RE = /[A-Za-z0-9)\]][_^]\{[^{}]+\}/;

/**
 * Detects whether a plain text segment contains bare un-delimited LaTeX syntax.
 */
export function containsBareLatex(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const unescaped = unescapeDoubleLatex(String(raw));
  return BARE_LATEX_COMMAND_RE.test(unescaped) || BRACED_SUB_SUP_RE.test(unescaped);
}

/**
 * Heuristically determines if an entire un-delimited text segment is a standalone LaTeX formula
 * (such as `T_{\text{Huffman}} = O(n\log n) \;(\text{or } O(n) \text{ if...})`).
 */
function isStandaloneBareFormula(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed || trimmed.includes('\n')) return false;
  // Contains explicit LaTeX text/spacing commands -> whole string was authored as a LaTeX formula
  if (/\\(?:text|mathrm|mathbf|quad|qquad)(?![a-zA-Z])|\\[;,!]/.test(trimmed)) {
    return true;
  }
  // Starts with a LaTeX command or short math LHS followed by =, ≤, ≥, →, ∈, etc.
  if (
    /^\\/.test(trimmed) ||
    /^[A-Za-z0-9_^{}()[\]|]+\s*(?:=|\\le|\\leq|\\ge|\\geq|\\neq|\\approx|\\equiv|\\to|\\rightarrow|\\implies|\\iff|\\in|\\subseteq)/.test(
      trimmed
    )
  ) {
    // Make sure it isn't a long multi-sentence English paragraph
    const plainWords = trimmed
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[{}^_0-9=<>+\-*/()[\]|,.:;]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    return plainWords.length <= 6;
  }
  return false;
}

/**
 * Splits a plain text chunk (already outside code ticks and explicit `$` delimiters)
 * into `text` and `inline-math` tokens when bare LaTeX snippets appear inside prose.
 */
function tokenizeBareLatexSegment(rawSegment: string): MathTextToken[] {
  const segment = unescapeDoubleLatex(decodeHtmlEntities(rawSegment));
  if (!containsBareLatex(segment)) {
    return segment ? [{ type: 'text', value: segment }] : [];
  }

  // If the whole segment is a formula, render the whole segment with KaTeX
  if (isStandaloneBareFormula(segment)) {
    return [{ type: 'inline-math', value: segment.trim() }];
  }

  // Otherwise, extract embedded bare LaTeX expressions inside prose cleanly
  // Matches:
  // 1) \cmd{...}{...} or \cmd{...} or \cmd(...) or single \cmd (e.g. \frac{1}{2}, \Theta(n \log n), \le)
  // 2) Math token with braced sub/sup (e.g. O(2^{n}), T_{n-1}, x_{i}^{2})
  const embeddedRe =
    /(?:[A-Za-z0-9)\]]+[_^]\{[^{}]+\}(?:[_^]\{[^{}]+\})?)|(?:\\(?:frac|dfrac|tfrac|binom)\{[^{}]+\}\{[^{}]+\})|(?:\\(?:text|mathrm|mathbf|mathcal|sqrt|overline|bar)\{[^{}]+\})|(?:\\(?:Theta|Omega|Sigma|O|log|ln)\([^()]*\))|(?:\\(?:le|leq|ge|geq|ne|neq|approx|equiv|to|rightarrow|leftarrow|implies|Rightarrow|iff|Leftrightarrow|times|cdot|pm|oplus|in|notin|subset|subseteq|cap|cup|emptyset|infty|forall|exists|land|lor|lnot|neg|Theta|theta|Omega|omega|Sigma|sigma|alpha|beta|gamma|delta|Delta|epsilon|varepsilon|lambda|mu|pi|tau|phi|varphi|sum|prod|log|ln|lfloor|rfloor|lceil|rceil)(?![a-zA-Z]))/g;

  const tokens: MathTextToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = embeddedRe.exec(segment)) !== null) {
    if (match.index > lastIndex) {
      const prefix = segment.slice(lastIndex, match.index);
      tokens.push({
        type: 'text',
        value: containsBareLatex(prefix) ? formatMathToPlainUnicode(prefix) : prefix,
      });
    }
    tokens.push({ type: 'inline-math', value: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < segment.length) {
    const tail = segment.slice(lastIndex);
    tokens.push({
      type: 'text',
      value: containsBareLatex(tail) ? formatMathToPlainUnicode(tail) : tail,
    });
  }

  return tokens;
}

/**
 * Tokenizes arbitrary mixed prose/code/math text into structured tokens for `<MathText />`:
 * - Inline backtick `` `code` `` spans (untouched by math parser)
 * - Display math (`$$...$$`, `\[...\]`)
 * - Inline math (`$...$`, `\(...\)`)
 * - Auto-detected bare un-delimited LaTeX inside prose or standalone formulas
 * - Clean HTML-entity-decoded plain text (zero raw LaTeX leaks)
 */
export function tokenizeMathText(raw: string | undefined | null): MathTextToken[] {
  if (!raw) return [];
  const source = decodeHtmlEntities(String(raw));

  // Step 1: Isolate inline backtick `code` segments first so code is never mangled
  const codeSplitRe = /`([^`\n]+)`/g;
  const outerSegments: Array<{ isCode: boolean; value: string }> = [];
  let cursor = 0;
  let codeMatch: RegExpExecArray | null;

  while ((codeMatch = codeSplitRe.exec(source)) !== null) {
    if (codeMatch.index > cursor) {
      outerSegments.push({ isCode: false, value: source.slice(cursor, codeMatch.index) });
    }
    outerSegments.push({ isCode: true, value: codeMatch[1] });
    cursor = codeMatch.index + codeMatch[0].length;
  }
  if (cursor < source.length) {
    outerSegments.push({ isCode: false, value: source.slice(cursor) });
  }

  // Step 2: Inside non-code segments, split explicit math delimiters ($$...$$, \[...\], \(...\), $...$)
  const mathDelimiterRe =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

  const tokens: MathTextToken[] = [];

  for (const seg of outerSegments) {
    if (seg.isCode) {
      tokens.push({ type: 'code', value: seg.value });
      continue;
    }

    // Normalize double-escaped delimiters like `\\(` or `\\[` before matching
    const normalizedSeg = seg.value
      .replace(/\\\\\(/g, '\\(')
      .replace(/\\\\\)/g, '\\)')
      .replace(/\\\\\[/g, '\\[')
      .replace(/\\\\\]/g, '\\]');

    let last = 0;
    let m: RegExpExecArray | null;
    mathDelimiterRe.lastIndex = 0;

    while ((m = mathDelimiterRe.exec(normalizedSeg)) !== null) {
      // Protect currency patterns like "$50 to $100" when matched by single-$ group m[4]
      if (m[4] !== undefined && /^\d+(?:\.\d+)?\s+[a-zA-Z]{2,}/.test(m[4].trim())) {
        continue;
      }

      if (m.index > last) {
        tokens.push(...tokenizeBareLatexSegment(normalizedSeg.slice(last, m.index)));
      }

      if (m[1] !== undefined) {
        tokens.push({ type: 'display-math', value: m[1] });
      } else if (m[2] !== undefined) {
        tokens.push({ type: 'display-math', value: m[2] });
      } else if (m[3] !== undefined) {
        tokens.push({ type: 'inline-math', value: m[3] });
      } else if (m[4] !== undefined) {
        tokens.push({ type: 'inline-math', value: m[4] });
      }

      last = m.index + m[0].length;
    }

    if (last < normalizedSeg.length) {
      tokens.push(...tokenizeBareLatexSegment(normalizedSeg.slice(last)));
    }
  }

  return tokens;
}
