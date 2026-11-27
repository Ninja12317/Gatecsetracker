import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanLatexExpression,
  containsBareLatex,
  decodeHtmlEntities,
  formatMathToPlainUnicode,
  renderKatexSafe,
  tokenizeMathText,
  unescapeDoubleLatex,
} from './mathFormat.ts';
import { GATE_2027_MASTER_VAULT } from '../data/gate27FormulaTrapBundle.ts';
import { GATE_TIPS } from '../data/tips.ts';

const RAW_LATEX_LEAK_RE =
  /\\(?:text|frac|dfrac|tfrac|sum|prod|quad|qquad|log|ln|le|leq|ge|geq|neq|ne|to|rightarrow|implies|Rightarrow|iff|oplus|in|notin|subset|subseteq|cap|cup|infty|Theta|Omega|Sigma|lambda|left|right|lfloor|rfloor|lceil|rceil|binom|overline|sqrt)\b|\\[;,!]|&(?:nbsp|lt|gt|amp|quot);/;

describe('mathFormat — universal LaTeX & HTML entity engine', () => {
  it('cleanly renders the exact Huffman formula (single & double escaped) via KaTeX AND plain Unicode', () => {
    const singleEscaped =
      'T_{\\text{Huffman}} = O(n\\log n) \\;(\\text{or } O(n) \\text{ if frequencies pre-sorted using 2 queues})';
    const doubleEscaped =
      'T_{\\\\text{Huffman}} = O(n\\\\log n) \\\\;(\\\\text{or } O(n) \\\\text{ if frequencies pre-sorted using 2 queues})';

    // KaTeX render succeeds without fallback for both
    const r1 = renderKatexSafe(singleEscaped, true);
    assert.equal(r1.usedFallback, false);
    assert.ok(r1.html.includes('katex'));
    assert.ok(!r1.html.includes('katex-error'));

    const r2 = renderKatexSafe(doubleEscaped, true);
    assert.equal(r2.usedFallback, false);
    assert.ok(r2.html.includes('katex'));
    assert.ok(!r2.html.includes('katex-error'));

    // Plain Unicode fallback has zero raw LaTeX
    const plain1 = formatMathToPlainUnicode(singleEscaped);
    const plain2 = formatMathToPlainUnicode(doubleEscaped);
    assert.equal(plain1, plain2);
    assert.ok(plain1.includes('T_Huffman = O(n log n)'));
    assert.ok(plain1.includes('(or O(n) if frequencies pre-sorted using 2 queues)'));
    assert.equal(RAW_LATEX_LEAK_RE.test(plain1), false, `Raw LaTeX leaked: ${plain1}`);
  });

  it('unescapes double-escaped LaTeX while preserving matrix/cases row breaks', () => {
    assert.equal(
      unescapeDoubleLatex('\\\\frac{1}{2} \\\\le \\\\infty \\\\; \\\\quad \\\\text{ok}'),
      '\\frac{1}{2} \\le \\infty \\; \\quad \\text{ok}'
    );
    const casesExpr = '\\begin{cases} x & x > 0 \\\\ 0 & x \\le 0 \\end{cases}';
    assert.equal(unescapeDoubleLatex(casesExpr), casesExpr);
  });

  it('decodes named, numeric, and double-encoded HTML entities cleanly', () => {
    assert.equal(
      decodeHtmlEntities('A&nbsp;&lt;&nbsp;B &amp; C &gt; &quot;D&quot; &#39;E&#39; &amp;lt; F'),
      'A < B & C > "D" \'E\' < F'
    );
  });

  it('strips outer math delimiters in cleanLatexExpression', () => {
    assert.equal(cleanLatexExpression('$$\\frac{a}{b}$$'), '\\frac{a}{b}');
    assert.equal(cleanLatexExpression('$O(n \\log n)$'), 'O(n \\log n)');
    assert.equal(cleanLatexExpression('\\[x^2 + y^2\\]'), 'x^2 + y^2');
    assert.equal(cleanLatexExpression('\\(a \\oplus b\\)'), 'a \\oplus b');
  });

  it('converts nested fractions, operators, sets, Greek letters, and spacing to crisp Unicode', () => {
    const complex =
      'S_{\\text{overall}} = \\frac{1}{(1 - f) + \\frac{f}{S_{\\text{enhanced}}}} \\quad ; \\quad \\Theta(n\\log n) \\le \\Omega(2^n) \\implies A \\oplus B \\in \\Sigma \\cup \\emptyset, \\; \\lfloor \\frac{n}{2} \\rfloor \\neq \\infty';
    const plain = formatMathToPlainUnicode(complex);
    assert.ok(plain.includes('(1)/((1 - f) + (f)/(S_enhanced))'));
    assert.ok(plain.includes('Θ(n log n) ≤ Ω(2^n) ⇒ A ⊕ B ∈ Σ ∪ ∅'));
    assert.ok(plain.includes('⌊(n)/(2)⌋ ≠ ∞'));
    assert.equal(RAW_LATEX_LEAK_RE.test(plain), false, `Raw LaTeX leaked: ${plain}`);
  });

  it('falls back gracefully to clean Unicode on malformed LaTeX with zero raw command leaks', () => {
    const broken = '\\frac{\\text{Broken}}{\\unknowncmd{1} \\; \\quad \\le 5';
    const res = renderKatexSafe(broken, false);
    assert.equal(res.usedFallback, true);
    assert.ok(res.fallbackText.includes('Broken'));
    assert.ok(res.fallbackText.includes('≤ 5'));
    assert.equal(RAW_LATEX_LEAK_RE.test(res.fallbackText), false, `Leak: ${res.fallbackText}`);
  });

  it('tokenizes mixed prose, inline code, delimited math, bare LaTeX, and preserves currency', () => {
    // Currency is NOT mangled as math
    const currencyTokens = tokenizeMathText('Cost is $50 to $100 for textbooks.');
    assert.equal(currencyTokens.length, 1);
    assert.equal(currencyTokens[0].type, 'text');
    assert.equal(currencyTokens[0].value, 'Cost is $50 to $100 for textbooks.');

    // Inline code backticks stay code tokens even if they contain underscores/backslashes
    const codeTokens = tokenizeMathText('Call `printf("%d\\n", x_1)` when $x_1 \\le 5$.');
    assert.ok(codeTokens.some((t) => t.type === 'code' && t.value === 'printf("%d\\n", x_1)'));
    assert.ok(codeTokens.some((t) => t.type === 'inline-math' && t.value === 'x_1 \\le 5'));

    // Bare un-delimited standalone formula is auto-detected as math
    const bareFormula =
      'T_{\\text{Huffman}} = O(n\\log n) \\;(\\text{or } O(n) \\text{ if sorted})';
    assert.equal(containsBareLatex(bareFormula), true);
    const bareTokens = tokenizeMathText(bareFormula);
    assert.equal(bareTokens.length, 1);
    assert.equal(bareTokens[0].type, 'inline-math');

    // Bare LaTeX embedded inside English sentence is extracted cleanly
    const embeddedTokens = tokenizeMathText('Worst-case time is \\Theta(n \\log n) when k \\le 2.');
    assert.ok(embeddedTokens.some((t) => t.type === 'inline-math'));
    assert.ok(embeddedTokens.some((t) => t.type === 'text' && t.value.includes('Worst-case time is')));
  });

  it('renders EVERY formula in GATE_2027_MASTER_VAULT and CURATED_TIPS cleanly with ZERO raw leaks', () => {
    for (const card of GATE_2027_MASTER_VAULT) {
      if (card.formulaLatex) {
        const rendered = renderKatexSafe(card.formulaLatex, true);
        assert.equal(
          rendered.usedFallback,
          false,
          `KaTeX failed on vault card "${card.id}": ${card.formulaLatex}`
        );
        const plain = formatMathToPlainUnicode(card.formulaLatex);
        assert.equal(
          RAW_LATEX_LEAK_RE.test(plain),
          false,
          `Plain fallback leaked raw LaTeX on vault card "${card.id}": ${plain}`
        );
      }
      for (const field of [card.title, card.commonTrap, card.gateTruth, card.quickExample ?? '']) {
        const plain = formatMathToPlainUnicode(field);
        assert.equal(
          RAW_LATEX_LEAK_RE.test(plain),
          false,
          `Vault card "${card.id}" text leaked raw syntax: ${plain}`
        );
      }
    }

    for (const tip of GATE_TIPS) {
      if (tip.formula) {
        const plain = formatMathToPlainUnicode(tip.formula);
        assert.equal(
          RAW_LATEX_LEAK_RE.test(plain),
          false,
          `Curated tip "${tip.id}" formula leaked raw syntax: ${plain}`
        );
      }
    }

    // Plain-English formula without LaTeX commands uses crisp readable text instead of space-squashed KaTeX
    const plainInvariant = renderKatexSafe(
      'Guaranteed order: (expr1 && expr2), (expr1 || expr2)',
      false
    );
    assert.equal(plainInvariant.usedFallback, true);
    assert.equal(
      plainInvariant.fallbackText,
      'Guaranteed order: (expr1 && expr2), (expr1 || expr2)'
    );
  });
});
