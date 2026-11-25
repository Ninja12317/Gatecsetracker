import React, { useMemo } from 'react';

interface CodeBlockProps {
  code: string;
  label?: string;
}

type TokenKind = 'plain' | 'keyword' | 'type' | 'string' | 'number' | 'comment';

interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'return', 'switch', 'case', 'break', 'continue',
  'struct', 'typedef', 'sizeof', 'static', 'const', 'extern', 'register', 'volatile',
  'union', 'enum', 'default', 'goto', 'NULL', 'true', 'false',
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'JOIN', 'INNER',
  'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS', 'DISTINCT', 'AND', 'OR', 'NOT', 'IN',
  'EXISTS', 'ALL', 'ANY', 'UNION', 'INTERSECT', 'EXCEPT', 'CREATE', 'TABLE', 'KEY',
  'PRIMARY', 'FOREIGN', 'REFERENCES', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'BEGIN', 'END', 'FUNCTION', 'PROCEDURE', 'ALGORITHM',
]);

const TYPES_AND_BUILTINS = new Set([
  'int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'bool',
  'size_t', 'printf', 'scanf', 'malloc', 'calloc', 'free', 'fork', 'exec', 'wait',
  'signal', 'semaphore', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'main', 'foo', 'bar', 'f', 'g',
]);

// Warm Espresso Syntax Theme (Zero Blue Tokens)
const TOKEN_COLOR: Record<TokenKind, string> = {
  keyword: 'text-[#E5B23A] font-medium',     // Imperial Gold
  type: 'text-[#E07A5F]',                    // Warm Terracotta
  string: 'text-[#A3B88C]',                  // Muted Sage
  number: 'text-[#F0C987]',                  // Soft Amber
  comment: 'text-[#8C7E75] italic',          // Warm Taupe
  plain: 'text-[#F5EFE6]',                   // Ivory
};

function tokenizeWarmEspresso(code: string): Token[] {
  const tokens: Token[] = [];
  const regex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'plain', text: code.slice(lastIndex, match.index) });
    }
    const word = match[0];
    let kind: TokenKind = 'plain';

    if (word.startsWith('//') || word.startsWith('/*') || word.startsWith('--')) {
      kind = 'comment';
    } else if (word.startsWith('"') || word.startsWith("'")) {
      kind = 'string';
    } else if (/^\d|^0x/i.test(word)) {
      kind = 'number';
    } else if (KEYWORDS.has(word)) {
      kind = 'keyword';
    } else if (TYPES_AND_BUILTINS.has(word)) {
      kind = 'type';
    } else {
      // Check if followed immediately by '(' to color function calls in Warm Terracotta
      const nextChar = code[match.index + word.length];
      if (nextChar === '(') {
        kind = 'type';
      }
    }

    tokens.push({ kind, text: word });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push({ kind: 'plain', text: code.slice(lastIndex) });
  }
  return tokens;
}

export const CodeBlock: React.FC<CodeBlockProps> = React.memo(({ code, label }) => {
  const tokens = useMemo(() => tokenizeWarmEspresso(code), [code]);

  return (
    <div
      data-testid="espresso-code-block"
      className="rounded-[20px] squircle border border-[#322823] bg-[#1E1815] overflow-hidden shadow-warm"
    >
      {label && (
        <div className="px-4 py-2 border-b border-[#322823] flex items-center justify-between text-[11px] font-mono text-[#A99B8E]">
          <span>{label}</span>
          <span className="text-[#8C7E75]">UTF-8</span>
        </div>
      )}
      <pre className="p-4 font-mono text-xs leading-relaxed overflow-x-auto text-[#F5EFE6]">
        <code>
          {tokens.map((tok, i) => (
            <span key={i} className={TOKEN_COLOR[tok.kind]}>
              {tok.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';
