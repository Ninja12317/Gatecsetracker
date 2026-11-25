import type {
  CodeFlowchartGraph,
  CodeTraceFrame,
  CodeVisualizationResult,
  DryRunTraceTable,
  FlowchartEdge,
  FlowchartNode,
  Question,
} from '../types';

export interface GateCodePreset {
  id: string;
  label: string;
  tag: string;
  code: string;
}

export const GATE_C_PRESETS: GateCodePreset[] = [
  {
    id: 'static_recursion',
    label: 'Static Variable Recursion',
    tag: 'GATE CS Classic',
    code: `int fun(int n) {
  static int i = 1;
  if (n >= 5) return n;
  n = n + i;
  i++;
  return fun(n);
}

int main() {
  int ans = fun(1);
  printf("ans = %d\\n", ans);
  return 0;
}`,
  },
  {
    id: 'pointer_arith',
    label: 'Pointer Arithmetic',
    tag: 'C Pointers',
    code: `int main() {
  int a[4] = {10, 20, 30, 40};
  int *p = a;
  int sum = 0;
  for (int i = 0; i < 4; i++) {
    sum += *(p + i);
  }
  *p = sum / 4;
  printf("a[0]=%d sum=%d\\n", a[0], sum);
  return 0;
}`,
  },
  {
    id: 'tree_recursion',
    label: 'Binary Tree / Recursion Tree',
    tag: 'Recursion Tree',
    code: `int fib(int n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

int main() {
  int r = fib(4);
  printf("fib(4) = %d\\n", r);
  return 0;
}`,
  },
  {
    id: 'nested_loop',
    label: 'Nested Loop Complexity',
    tag: 'Algorithms',
    code: `int main() {
  int n = 4;
  int count = 0;
  for (int i = 1; i <= n; i++) {
    for (int j = i; j <= n; j++) {
      count = count + 1;
    }
  }
  printf("ops = %d\\n", count);
  return 0;
}`,
  },
];

/**
 * Extracts C / pseudocode block from a PYQ's codeSnippet or HTML body (<pre>/<code>).
 */
export function extractCodeFromPyq(q: Question | null | undefined): string | null {
  if (!q) return null;
  if (q.codeSnippet && q.codeSnippet.trim().length > 0) {
    return q.codeSnippet.trim();
  }
  const html = q.bodyHtml || '';
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const codeMatch = preMatch ? preMatch[1] : html.match(/<code[^>]*>([\s\S]*?)<\/code>/i)?.[1];
  if (!codeMatch) return null;
  const decoded = codeMatch
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
  return decoded.length >= 6 ? decoded : null;
}

// ===================== SAFE PURE-TS C-SUBSET INTERPRETER (NO eval / new Function) =====================

type TokenType =
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'CHAR'
  | 'OP'
  | 'PUNCT'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  line: number;
}

const TWO_CHAR_OPS = new Set([
  '==', '!=', '<=', '>=', '&&', '||', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '<<', '>>', '->',
]);

const SINGLE_OPS = new Set([
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':',
]);

const PUNCTS = new Set(['(', ')', '{', '}', '[', ']', ';', ',']);

const TYPE_KEYWORDS = new Set([
  'int', 'float', 'double', 'char', 'void', 'long', 'short', 'unsigned', 'signed', 'const',
]);

function preprocessC(rawCode: string): string {
  const lines = rawCode.replace(/\r\n/g, '\n').split('\n');
  const defines = new Map<string, string>();
  const cleanedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#include')) {
      cleanedLines.push('');
      continue;
    }
    const defMatch = trimmed.match(/^#define\s+([A-Za-z_]\w*)\s+(.+)$/);
    if (defMatch) {
      defines.set(defMatch[1], defMatch[2].trim());
      cleanedLines.push('');
      continue;
    }
    let outLine = line;
    for (const [k, v] of defines.entries()) {
      outLine = outLine.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
    }
    cleanedLines.push(outLine);
  }
  return cleanedLines.join('\n');
}

function tokenizeC(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = code.length;

  while (i < n) {
    const ch = code[i];
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Line comment
    if (ch === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    // String literal
    if (ch === '"') {
      let str = '';
      i++;
      while (i < n && code[i] !== '"') {
        if (code[i] === '\\' && i + 1 < n) {
          const nxt = code[i + 1];
          if (nxt === 'n') str += '\n';
          else if (nxt === 't') str += '\t';
          else str += nxt;
          i += 2;
        } else {
          str += code[i++];
        }
      }
      i++; // closing quote
      tokens.push({ type: 'STRING', value: str, line });
      continue;
    }
    // Char literal
    if (ch === "'") {
      let c = '';
      i++;
      if (code[i] === '\\' && i + 1 < n) {
        c = code[i + 1] === 'n' ? '\n' : code[i + 1];
        i += 2;
      } else if (i < n) {
        c = code[i++];
      }
      if (code[i] === "'") i++;
      tokens.push({ type: 'CHAR', value: c, line });
      continue;
    }
    // Number literal (int or float or hex)
    if (/[0-9]/.test(ch)) {
      let num = '';
      if (ch === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        num += code[i++] + code[i++];
        while (i < n && /[0-9a-fA-F]/.test(code[i])) num += code[i++];
      } else {
        while (i < n && /[0-9.]/.test(code[i])) num += code[i++];
      }
      tokens.push({ type: 'NUMBER', value: num, line });
      continue;
    }
    // Identifier / keyword
    if (/[A-Za-z_]/.test(ch)) {
      let ident = '';
      while (i < n && /[A-Za-z0-9_]/.test(code[i])) ident += code[i++];
      tokens.push({ type: 'IDENT', value: ident, line });
      continue;
    }
    // Two-char operator
    const two = code.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: 'OP', value: two, line });
      i += 2;
      continue;
    }
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ type: 'OP', value: ch, line });
      i++;
      continue;
    }
    if (PUNCTS.has(ch)) {
      tokens.push({ type: 'PUNCT', value: ch, line });
      i++;
      continue;
    }
    // Skip unknown punctuation gracefully
    i++;
  }

  tokens.push({ type: 'EOF', value: '', line });
  return tokens;
}

// AST Node Definitions
type Expr =
  | { kind: 'num'; value: number; isFloat: boolean; line: number }
  | { kind: 'str'; value: string; line: number }
  | { kind: 'ident'; name: string; line: number }
  | { kind: 'unary'; op: string; expr: Expr; line: number }
  | { kind: 'postfix'; op: '++' | '--'; expr: Expr; line: number }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; line: number }
  | { kind: 'ternary'; cond: Expr; thenExpr: Expr; elseExpr: Expr; line: number }
  | { kind: 'assign'; op: string; target: Expr; value: Expr; line: number }
  | { kind: 'call'; name: string; args: Expr[]; line: number }
  | { kind: 'index'; target: Expr; index: Expr; line: number };

interface VarDeclItem {
  name: string;
  isPointer: boolean;
  arraySize?: number | null; // null means unsized int a[] = {...}
  init?: Expr | Expr[];
  line: number;
}

type Stmt =
  | { kind: 'block'; stmts: Stmt[]; line: number }
  | { kind: 'decl'; baseType: string; isStatic: boolean; items: VarDeclItem[]; line: number }
  | { kind: 'expr'; expr: Expr; line: number }
  | { kind: 'if'; cond: Expr; thenBranch: Stmt; elseBranch?: Stmt; line: number }
  | { kind: 'while'; cond: Expr; body: Stmt; line: number }
  | { kind: 'dowhile'; body: Stmt; cond: Expr; line: number }
  | { kind: 'for'; init?: Stmt; cond?: Expr; post?: Expr; body: Stmt; line: number }
  | { kind: 'return'; value?: Expr; line: number }
  | { kind: 'break'; line: number }
  | { kind: 'continue'; line: number };

interface FuncParam {
  name: string;
  baseType: string;
  isPointer: boolean;
}

interface FuncDef {
  name: string;
  returnType: string;
  params: FuncParam[];
  body: Stmt;
  line: number;
}

interface ProgramAst {
  globals: Stmt[];
  functions: FuncDef[];
}

class CParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private match(type: TokenType, value?: string): boolean {
    const t = this.peek();
    if (t.type === type && (value === undefined || t.value === value)) {
      this.next();
      return true;
    }
    return false;
  }

  private expect(type: TokenType, value?: string): Token {
    const t = this.peek();
    if (t.type === type && (value === undefined || t.value === value)) {
      return this.next();
    }
    throw new Error(`Line ${t.line}: Expected '${value ?? type}', found '${t.value || t.type}'`);
  }

  private isTypeStart(offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'IDENT' && (t.value === 'static' || TYPE_KEYWORDS.has(t.value));
  }

  parseProgram(): ProgramAst {
    const globals: Stmt[] = [];
    const functions: FuncDef[] = [];

    while (this.peek().type !== 'EOF') {
      if (this.isTypeStart()) {
        const startPos = this.pos;
        const startLine = this.peek().line;
        if (this.peek().value === 'static') this.next();
        let baseType = '';
        while (this.peek().type === 'IDENT' && TYPE_KEYWORDS.has(this.peek().value)) {
          baseType = this.next().value;
        }
        while (this.match('OP', '*')) {
          // pointer return
        }
        if (this.peek().type === 'IDENT' && this.peek(1).type === 'PUNCT' && this.peek(1).value === '(') {
          const name = this.next().value;
          this.expect('PUNCT', '(');
          const params: FuncParam[] = [];
          if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
            if (
              this.peek().type === 'IDENT' &&
              this.peek().value === 'void' &&
              this.peek(1).value === ')'
            ) {
              this.next();
            } else {
              do {
                let pType = 'int';
                while (this.peek().type === 'IDENT' && TYPE_KEYWORDS.has(this.peek().value)) {
                  pType = this.next().value;
                }
                let isPtr = false;
                while (this.match('OP', '*')) isPtr = true;
                const pName = this.expect('IDENT').value;
                if (this.match('PUNCT', '[')) {
                  if (this.peek().type === 'NUMBER') this.next();
                  this.expect('PUNCT', ']');
                  isPtr = true;
                }
                params.push({ name: pName, baseType: pType, isPointer: isPtr });
              } while (this.match('PUNCT', ','));
            }
          }
          this.expect('PUNCT', ')');
          if (this.match('PUNCT', ';')) {
            // Prototype declaration — skip
            continue;
          }
          const body = this.parseBlock();
          functions.push({ name, returnType: baseType || 'int', params, body, line: startLine });
          continue;
        }
        // Otherwise rewind and parse as global declaration
        this.pos = startPos;
        globals.push(this.parseDecl(true));
      } else {
        // Standalone statement (user pasted snippet without main())
        globals.push(this.parseStmt());
      }
    }

    return { globals, functions };
  }

  private parseBlock(): Stmt {
    const line = this.peek().line;
    this.expect('PUNCT', '{');
    const stmts: Stmt[] = [];
    while (this.peek().type !== 'EOF' && !(this.peek().type === 'PUNCT' && this.peek().value === '}')) {
      stmts.push(this.parseStmt());
    }
    this.expect('PUNCT', '}');
    return { kind: 'block', stmts, line };
  }

  private parseDecl(consumeSemi: boolean): Stmt {
    const line = this.peek().line;
    let isStatic = false;
    if (this.peek().type === 'IDENT' && this.peek().value === 'static') {
      isStatic = true;
      this.next();
    }
    let baseType = 'int';
    while (this.peek().type === 'IDENT' && TYPE_KEYWORDS.has(this.peek().value)) {
      baseType = this.next().value;
    }

    const items: VarDeclItem[] = [];
    do {
      const itemLine = this.peek().line;
      let isPointer = false;
      while (this.match('OP', '*')) isPointer = true;
      const name = this.expect('IDENT').value;
      let arraySize: number | null | undefined = undefined;
      if (this.match('PUNCT', '[')) {
        if (this.peek().type === 'NUMBER') {
          arraySize = Math.max(1, Math.min(64, parseInt(this.next().value, 10)));
        } else {
          arraySize = null;
        }
        this.expect('PUNCT', ']');
      }
      let init: Expr | Expr[] | undefined = undefined;
      if (this.match('OP', '=')) {
        if (this.match('PUNCT', '{')) {
          const elems: Expr[] = [];
          if (!(this.peek().type === 'PUNCT' && this.peek().value === '}')) {
            do {
              elems.push(this.parseAssignment());
            } while (this.match('PUNCT', ','));
          }
          this.expect('PUNCT', '}');
          init = elems;
        } else {
          init = this.parseAssignment();
        }
      }
      items.push({ name, isPointer, arraySize, init, line: itemLine });
    } while (this.match('PUNCT', ','));

    if (consumeSemi) this.match('PUNCT', ';');
    return { kind: 'decl', baseType, isStatic, items, line };
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    if (t.type === 'PUNCT' && t.value === '{') {
      return this.parseBlock();
    }
    if (this.isTypeStart()) {
      return this.parseDecl(true);
    }
    if (t.type === 'IDENT' && t.value === 'if') {
      this.next();
      this.expect('PUNCT', '(');
      const cond = this.parseExpr();
      this.expect('PUNCT', ')');
      const thenBranch = this.parseStmt();
      let elseBranch: Stmt | undefined;
      if (this.peek().type === 'IDENT' && this.peek().value === 'else') {
        this.next();
        elseBranch = this.parseStmt();
      }
      return { kind: 'if', cond, thenBranch, elseBranch, line: t.line };
    }
    if (t.type === 'IDENT' && t.value === 'while') {
      this.next();
      this.expect('PUNCT', '(');
      const cond = this.parseExpr();
      this.expect('PUNCT', ')');
      const body = this.parseStmt();
      return { kind: 'while', cond, body, line: t.line };
    }
    if (t.type === 'IDENT' && t.value === 'do') {
      this.next();
      const body = this.parseStmt();
      this.expect('IDENT', 'while');
      this.expect('PUNCT', '(');
      const cond = this.parseExpr();
      this.expect('PUNCT', ')');
      this.match('PUNCT', ';');
      return { kind: 'dowhile', body, cond, line: t.line };
    }
    if (t.type === 'IDENT' && t.value === 'for') {
      this.next();
      this.expect('PUNCT', '(');
      let init: Stmt | undefined;
      if (!(this.peek().type === 'PUNCT' && this.peek().value === ';')) {
        if (this.isTypeStart()) {
          init = this.parseDecl(false);
        } else {
          const e = this.parseExpr();
          init = { kind: 'expr', expr: e, line: e.line };
        }
      }
      this.expect('PUNCT', ';');
      let cond: Expr | undefined;
      if (!(this.peek().type === 'PUNCT' && this.peek().value === ';')) {
        cond = this.parseExpr();
      }
      this.expect('PUNCT', ';');
      let post: Expr | undefined;
      if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
        post = this.parseExpr();
      }
      this.expect('PUNCT', ')');
      const body = this.parseStmt();
      return { kind: 'for', init, cond, post, body, line: t.line };
    }
    if (t.type === 'IDENT' && t.value === 'return') {
      this.next();
      let value: Expr | undefined;
      if (!(this.peek().type === 'PUNCT' && this.peek().value === ';')) {
        value = this.parseExpr();
      }
      this.match('PUNCT', ';');
      return { kind: 'return', value, line: t.line };
    }
    if (t.type === 'IDENT' && t.value === 'break') {
      this.next();
      this.match('PUNCT', ';');
      return { kind: 'break', line: t.line };
    }
    if (t.type === 'IDENT' && t.value === 'continue') {
      this.next();
      this.match('PUNCT', ';');
      return { kind: 'continue', line: t.line };
    }
    if (this.match('PUNCT', ';')) {
      return { kind: 'block', stmts: [], line: t.line };
    }
    const expr = this.parseExpr();
    this.match('PUNCT', ';');
    return { kind: 'expr', expr, line: expr.line };
  }

  private parseExpr(): Expr {
    return this.parseAssignment();
  }

  private parseAssignment(): Expr {
    const left = this.parseTernary();
    const t = this.peek();
    if (
      t.type === 'OP' &&
      ['=', '+=', '-=', '*=', '/=', '%='].includes(t.value)
    ) {
      this.next();
      const right = this.parseAssignment();
      return { kind: 'assign', op: t.value, target: left, value: right, line: t.line };
    }
    return left;
  }

  private parseTernary(): Expr {
    const cond = this.parseLogicalOr();
    if (this.match('OP', '?')) {
      const thenExpr = this.parseExpr();
      this.expect('OP', ':');
      const elseExpr = this.parseTernary();
      return { kind: 'ternary', cond, thenExpr, elseExpr, line: cond.line };
    }
    return cond;
  }

  private parseLogicalOr(): Expr {
    let left = this.parseLogicalAnd();
    while (this.match('OP', '||')) {
      left = { kind: 'binary', op: '||', left, right: this.parseLogicalAnd(), line: left.line };
    }
    return left;
  }

  private parseLogicalAnd(): Expr {
    let left = this.parseBitOr();
    while (this.match('OP', '&&')) {
      left = { kind: 'binary', op: '&&', left, right: this.parseBitOr(), line: left.line };
    }
    return left;
  }

  private parseBitOr(): Expr {
    let left = this.parseBitXor();
    while (this.match('OP', '|')) {
      left = { kind: 'binary', op: '|', left, right: this.parseBitXor(), line: left.line };
    }
    return left;
  }

  private parseBitXor(): Expr {
    let left = this.parseBitAnd();
    while (this.match('OP', '^')) {
      left = { kind: 'binary', op: '^', left, right: this.parseBitAnd(), line: left.line };
    }
    return left;
  }

  private parseBitAnd(): Expr {
    let left = this.parseEquality();
    while (this.match('OP', '&')) {
      left = { kind: 'binary', op: '&', left, right: this.parseEquality(), line: left.line };
    }
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseRelational();
    while (this.peek().type === 'OP' && (this.peek().value === '==' || this.peek().value === '!=')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseRelational(), line: left.line };
    }
    return left;
  }

  private parseRelational(): Expr {
    let left = this.parseShift();
    while (
      this.peek().type === 'OP' &&
      ['<', '<=', '>', '>='].includes(this.peek().value)
    ) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseShift(), line: left.line };
    }
    return left;
  }

  private parseShift(): Expr {
    let left = this.parseAdditive();
    while (this.peek().type === 'OP' && (this.peek().value === '<<' || this.peek().value === '>>')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseAdditive(), line: left.line };
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseMultiplicative(), line: left.line };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (
      this.peek().type === 'OP' &&
      ['*', '/', '%'].includes(this.peek().value)
    ) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseUnary(), line: left.line };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (
      t.type === 'OP' &&
      ['+', '-', '!', '~', '*', '&', '++', '--'].includes(t.value)
    ) {
      this.next();
      return { kind: 'unary', op: t.value, expr: this.parseUnary(), line: t.line };
    }
    // Simple C cast like (int)x or (float)x
    if (
      t.type === 'PUNCT' &&
      t.value === '(' &&
      this.peek(1).type === 'IDENT' &&
      TYPE_KEYWORDS.has(this.peek(1).value) &&
      this.peek(2).value === ')'
    ) {
      this.next();
      const castType = this.next().value;
      this.next();
      return { kind: 'unary', op: `cast:${castType}`, expr: this.parseUnary(), line: t.line };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match('PUNCT', '[')) {
        const index = this.parseExpr();
        this.expect('PUNCT', ']');
        expr = { kind: 'index', target: expr, index, line: expr.line };
      } else if (this.peek().type === 'OP' && (this.peek().value === '++' || this.peek().value === '--')) {
        const op = this.next().value as '++' | '--';
        expr = { kind: 'postfix', op, expr, line: expr.line };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === 'NUMBER') {
      this.next();
      const isFloat = t.value.includes('.');
      const value = t.value.startsWith('0x') || t.value.startsWith('0X')
        ? parseInt(t.value, 16)
        : Number(t.value);
      return { kind: 'num', value, isFloat, line: t.line };
    }
    if (t.type === 'STRING') {
      this.next();
      return { kind: 'str', value: t.value, line: t.line };
    }
    if (t.type === 'CHAR') {
      this.next();
      return { kind: 'num', value: t.value.charCodeAt(0) || 0, isFloat: false, line: t.line };
    }
    if (t.type === 'IDENT') {
      this.next();
      if (this.match('PUNCT', '(')) {
        const args: Expr[] = [];
        if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
          do {
            args.push(this.parseAssignment());
          } while (this.match('PUNCT', ','));
        }
        this.expect('PUNCT', ')');
        return { kind: 'call', name: t.value, args, line: t.line };
      }
      return { kind: 'ident', name: t.value, line: t.line };
    }
    if (this.match('PUNCT', '(')) {
      const inner = this.parseExpr();
      this.expect('PUNCT', ')');
      return inner;
    }
    throw new Error(`Line ${t.line}: Unexpected token '${t.value || t.type}'`);
  }
}

// Runtime Value & Memory Cell Model
interface RuntimeVal {
  num: number;
  str?: string;
  isFloat?: boolean;
  isPtr?: boolean;
  ptrAddr?: number;
}

interface MemoryCell {
  addr: number;
  label: string;
  val: RuntimeVal;
}

interface VarBinding {
  name: string;
  addr: number;
  isArray?: boolean;
  arrayLen?: number;
  isStatic?: boolean;
}

interface CallFrame {
  funcName: string;
  nodeId: string;
  scopes: Map<string, VarBinding>[];
  argsLabel: string;
}

class ReturnSignal {
  value: RuntimeVal;
  constructor(value: RuntimeVal) {
    this.value = value;
  }
}
class BreakSignal {}
class ContinueSignal {}

function formatPrintf(fmt: string, args: RuntimeVal[]): string {
  let argIdx = 0;
  return fmt.replace(/%%|%(\.\d+)?([diufcsx])/g, (match, prec: string | undefined, spec: string) => {
    if (match === '%%') return '%';
    const arg = args[argIdx++];
    if (!arg) return match;
    if (spec === 's') return arg.str ?? String(arg.num);
    if (spec === 'c') return String.fromCharCode(Math.trunc(arg.num));
    if (spec === 'x') return (Math.trunc(arg.num) >>> 0).toString(16);
    if (spec === 'f') {
      const digits = prec ? parseInt(prec.slice(1), 10) : 2;
      return arg.num.toFixed(Math.min(6, Math.max(0, digits)));
    }
    return String(Math.trunc(arg.num));
  });
}

function formatRuntimeVal(v: RuntimeVal): string {
  if (v.str !== undefined) return `"${v.str}"`;
  if (v.isPtr && typeof v.ptrAddr === 'number') {
    return `0x${v.ptrAddr.toString(16).toUpperCase()}`;
  }
  if (v.isFloat) return String(Number(v.num.toFixed(3)));
  return String(Math.trunc(v.num));
}

const MAX_STEPS = 220;
const MAX_CALL_DEPTH = 24;
const MAX_LOOP_ITERS = 100;

export function executeCCodeLocally(rawCode: string): CodeVisualizationResult {
  const preprocessed = preprocessC(rawCode);
  let ast: ProgramAst;
  try {
    const tokens = tokenizeC(preprocessed);
    const parser = new CParser(tokens);
    ast = parser.parseProgram();
  } catch (err) {
    return {
      ok: false,
      engine: 'local',
      stdout: '',
      frames: [],
      flowchart: { mode: 'flowchart', nodes: [], edges: [] },
      error: err instanceof Error ? err.message : 'Unable to parse C code snippet.',
    };
  }

  const funcMap = new Map<string, FuncDef>();
  for (const fn of ast.functions) {
    funcMap.set(fn.name, fn);
  }

  const memory = new Map<number, MemoryCell>();
  let nextAddr = 0x1000;
  const allocCell = (label: string, val: RuntimeVal): number => {
    const addr = nextAddr;
    nextAddr += 4;
    memory.set(addr, { addr, label, val });
    return addr;
  };

  const globalScope = new Map<string, VarBinding>();
  const staticStorage = new Map<string, VarBinding>(); // key = funcName::varName
  const callStack: CallFrame[] = [];
  const frames: CodeTraceFrame[] = [];
  let stdout = '';
  let truncated = false;
  let isRecursiveProgram = false;

  // Dynamic Flowchart / Recursion Graph accumulators
  const cfgNodes = new Map<string, FlowchartNode>();
  const cfgEdges = new Map<string, FlowchartEdge>();
  let lastCfgNodeId = 'start';

  const recNodes: FlowchartNode[] = [];
  const recEdges: FlowchartEdge[] = [];
  let recNodeCounter = 0;

  cfgNodes.set('start', {
    id: 'start',
    label: 'Start',
    type: 'start',
    line: 1,
    stepRefs: [],
  });

  const ensureCfgNode = (
    id: string,
    label: string,
    type: FlowchartNode['type'],
    line: number,
    stepNum: number
  ) => {
    const existing = cfgNodes.get(id);
    if (existing) {
      if (!existing.stepRefs.includes(stepNum)) existing.stepRefs.push(stepNum);
    } else {
      cfgNodes.set(id, { id, label, type, line, stepRefs: [stepNum] });
    }
  };

  const addCfgEdge = (from: string, to: string, label?: string) => {
    if (!from || !to || from === to) return;
    const key = `${from}->${to}:${label ?? ''}`;
    if (!cfgEdges.has(key)) {
      cfgEdges.set(key, { from, to, label });
    }
  };

  const snapshotState = (): {
    variables: Record<string, string>;
    memoryPointers: Array<{ name: string; address: string; value: string }>;
    callStackLabels: string[];
  } => {
    const variables: Record<string, string> = {};
    const memoryPointers: Array<{ name: string; address: string; value: string }> = [];

    const collectScope = (scope: Map<string, VarBinding>, prefix = '') => {
      for (const [name, binding] of scope.entries()) {
        const displayName = prefix ? `${prefix}${name}` : name;
        if (binding.isArray && binding.arrayLen) {
          const vals: string[] = [];
          for (let idx = 0; idx < binding.arrayLen; idx++) {
            const cell = memory.get(binding.addr + idx * 4);
            vals.push(cell ? formatRuntimeVal(cell.val) : '0');
          }
          variables[displayName] = `[${vals.join(', ')}]`;
          memoryPointers.push({
            name: `${displayName}[0]`,
            address: `0x${binding.addr.toString(16).toUpperCase()}`,
            value: vals[0] ?? '0',
          });
        } else {
          const cell = memory.get(binding.addr);
          if (cell) {
            const valStr = formatRuntimeVal(cell.val);
            variables[displayName] = valStr;
            if (cell.val.isPtr && typeof cell.val.ptrAddr === 'number') {
              const target = memory.get(cell.val.ptrAddr);
              memoryPointers.push({
                name: displayName,
                address: `0x${cell.val.ptrAddr.toString(16).toUpperCase()}`,
                value: target ? `*${displayName} = ${formatRuntimeVal(target.val)}` : valStr,
              });
            }
          }
        }
      }
    };

    collectScope(globalScope);
    // Show active static variables
    for (const [key, binding] of staticStorage.entries()) {
      const cell = memory.get(binding.addr);
      if (cell) {
        const shortName = key.includes('::') ? `static ${key.split('::')[1]}` : key;
        variables[shortName] = formatRuntimeVal(cell.val);
      }
    }
    const topFrame = callStack[callStack.length - 1];
    if (topFrame) {
      for (const sc of topFrame.scopes) {
        collectScope(sc);
      }
    }

    const callStackLabels = callStack.map((f) => `${f.funcName}(${f.argsLabel})`);
    return { variables, memoryPointers, callStackLabels };
  };

  const recordStep = (
    line: number,
    nodeId: string,
    nodeLabel: string,
    nodeType: FlowchartNode['type'],
    explanation: string,
    branchTaken?: 'true' | 'false' | null,
    edgeLabel?: string
  ) => {
    if (frames.length >= MAX_STEPS) {
      truncated = true;
      throw new Error('__TRUNCATED__');
    }
    const stepNum = frames.length + 1;
    ensureCfgNode(nodeId, nodeLabel, nodeType, line, stepNum);
    addCfgEdge(lastCfgNodeId, nodeId, edgeLabel);
    lastCfgNodeId = nodeId;

    const topRecNodeId = callStack[callStack.length - 1]?.nodeId;
    const snap = snapshotState();
    frames.push({
      step: stepNum,
      line,
      activeNodeId: isRecursiveProgram && topRecNodeId ? topRecNodeId : nodeId,
      cfgNodeId: nodeId,
      recNodeId: topRecNodeId,
      variables: snap.variables,
      memoryPointers: snap.memoryPointers,
      callStack: snap.callStackLabels,
      outputSoFar: stdout,
      branchTaken: branchTaken ?? null,
      explanation,
    });
  };

  const lookupBinding = (name: string): VarBinding | undefined => {
    const top = callStack[callStack.length - 1];
    if (top) {
      for (let i = top.scopes.length - 1; i >= 0; i--) {
        const b = top.scopes[i].get(name);
        if (b) return b;
      }
      const staticB = staticStorage.get(`${top.funcName}::${name}`);
      if (staticB) return staticB;
    }
    return globalScope.get(name);
  };

  const resolveLValueAddr = (expr: Expr): number => {
    if (expr.kind === 'ident') {
      const b = lookupBinding(expr.name);
      if (!b) throw new Error(`Line ${expr.line}: Undeclared variable '${expr.name}'`);
      return b.addr;
    }
    if (expr.kind === 'index') {
      const baseVal = evalExpr(expr.target);
      const idxVal = evalExpr(expr.index);
      const baseAddr = baseVal.isPtr && baseVal.ptrAddr !== undefined ? baseVal.ptrAddr : baseVal.num;
      return baseAddr + Math.trunc(idxVal.num) * 4;
    }
    if (expr.kind === 'unary' && expr.op === '*') {
      const ptr = evalExpr(expr.expr);
      if (!ptr.isPtr || ptr.ptrAddr === undefined) {
        throw new Error(`Line ${expr.line}: Cannot dereference non-pointer value`);
      }
      return ptr.ptrAddr;
    }
    throw new Error(`Line ${expr.line}: Invalid assignment target`);
  };

  const evalExpr = (expr: Expr): RuntimeVal => {
    switch (expr.kind) {
      case 'num':
        return { num: expr.value, isFloat: expr.isFloat };
      case 'str':
        return { num: 0, str: expr.value };
      case 'ident': {
        const b = lookupBinding(expr.name);
        if (!b) throw new Error(`Line ${expr.line}: Undeclared identifier '${expr.name}'`);
        if (b.isArray) {
          return { num: b.addr, isPtr: true, ptrAddr: b.addr };
        }
        const cell = memory.get(b.addr);
        return cell ? { ...cell.val } : { num: 0 };
      }
      case 'index': {
        const addr = resolveLValueAddr(expr);
        const cell = memory.get(addr);
        return cell ? { ...cell.val } : { num: 0 };
      }
      case 'unary': {
        if (expr.op === '&') {
          const addr = resolveLValueAddr(expr.expr);
          return { num: addr, isPtr: true, ptrAddr: addr };
        }
        if (expr.op === '*') {
          const ptr = evalExpr(expr.expr);
          if (!ptr.isPtr || ptr.ptrAddr === undefined) {
            throw new Error(`Line ${expr.line}: Invalid pointer dereference`);
          }
          const cell = memory.get(ptr.ptrAddr);
          return cell ? { ...cell.val } : { num: 0 };
        }
        if (expr.op === '++' || expr.op === '--') {
          const addr = resolveLValueAddr(expr.expr);
          const cell = memory.get(addr);
          if (!cell) throw new Error(`Line ${expr.line}: Invalid memory cell`);
          const delta = expr.op === '++' ? 1 : -1;
          if (cell.val.isPtr && cell.val.ptrAddr !== undefined) {
            cell.val = { ...cell.val, ptrAddr: cell.val.ptrAddr + delta * 4, num: cell.val.ptrAddr + delta * 4 };
          } else {
            cell.val = { ...cell.val, num: cell.val.num + delta };
          }
          return { ...cell.val };
        }
        const v = evalExpr(expr.expr);
        if (expr.op === '-') return { num: -v.num, isFloat: v.isFloat };
        if (expr.op === '+') return v;
        if (expr.op === '!') return { num: v.num === 0 ? 1 : 0 };
        if (expr.op === '~') return { num: ~Math.trunc(v.num) };
        if (expr.op.startsWith('cast:')) {
          const target = expr.op.slice(5);
          if (target === 'float' || target === 'double') return { num: v.num, isFloat: true };
          return { num: Math.trunc(v.num), isFloat: false };
        }
        return v;
      }
      case 'postfix': {
        const addr = resolveLValueAddr(expr.expr);
        const cell = memory.get(addr);
        if (!cell) throw new Error(`Line ${expr.line}: Invalid memory cell`);
        const prev = { ...cell.val };
        const delta = expr.op === '++' ? 1 : -1;
        if (cell.val.isPtr && cell.val.ptrAddr !== undefined) {
          cell.val = { ...cell.val, ptrAddr: cell.val.ptrAddr + delta * 4, num: cell.val.ptrAddr + delta * 4 };
        } else {
          cell.val = { ...cell.val, num: cell.val.num + delta };
        }
        return prev;
      }
      case 'binary': {
        if (expr.op === '&&') {
          const l = evalExpr(expr.left);
          if (l.num === 0) return { num: 0 };
          return { num: evalExpr(expr.right).num !== 0 ? 1 : 0 };
        }
        if (expr.op === '||') {
          const l = evalExpr(expr.left);
          if (l.num !== 0) return { num: 1 };
          return { num: evalExpr(expr.right).num !== 0 ? 1 : 0 };
        }
        const l = evalExpr(expr.left);
        const r = evalExpr(expr.right);
        // Pointer arithmetic: ptr + int or ptr - int
        if (l.isPtr && l.ptrAddr !== undefined && (expr.op === '+' || expr.op === '-')) {
          const offset = Math.trunc(r.num) * 4 * (expr.op === '+' ? 1 : -1);
          const next = l.ptrAddr + offset;
          return { num: next, isPtr: true, ptrAddr: next };
        }
        const isFloat = Boolean(l.isFloat || r.isFloat);
        switch (expr.op) {
          case '+': return { num: l.num + r.num, isFloat };
          case '-': return { num: l.num - r.num, isFloat };
          case '*': return { num: l.num * r.num, isFloat };
          case '/':
            if (r.num === 0) throw new Error(`Line ${expr.line}: Division by zero`);
            return isFloat ? { num: l.num / r.num, isFloat: true } : { num: Math.trunc(l.num / r.num) };
          case '%':
            if (r.num === 0) throw new Error(`Line ${expr.line}: Modulo by zero`);
            return { num: Math.trunc(l.num) % Math.trunc(r.num) };
          case '<': return { num: l.num < r.num ? 1 : 0 };
          case '<=': return { num: l.num <= r.num ? 1 : 0 };
          case '>': return { num: l.num > r.num ? 1 : 0 };
          case '>=': return { num: l.num >= r.num ? 1 : 0 };
          case '==': return { num: l.num === r.num ? 1 : 0 };
          case '!=': return { num: l.num !== r.num ? 1 : 0 };
          case '&': return { num: Math.trunc(l.num) & Math.trunc(r.num) };
          case '|': return { num: Math.trunc(l.num) | Math.trunc(r.num) };
          case '^': return { num: Math.trunc(l.num) ^ Math.trunc(r.num) };
          case '<<': return { num: Math.trunc(l.num) << Math.trunc(r.num) };
          case '>>': return { num: Math.trunc(l.num) >> Math.trunc(r.num) };
          default: return { num: 0 };
        }
      }
      case 'ternary': {
        const c = evalExpr(expr.cond);
        return c.num !== 0 ? evalExpr(expr.thenExpr) : evalExpr(expr.elseExpr);
      }
      case 'assign': {
        const addr = resolveLValueAddr(expr.target);
        const cell = memory.get(addr);
        if (!cell) throw new Error(`Line ${expr.line}: Invalid assignment memory address`);
        const rhs = evalExpr(expr.value);
        let nextVal: RuntimeVal = rhs;
        if (expr.op !== '=') {
          const cur = cell.val;
          if (expr.op === '+=') nextVal = { num: cur.num + rhs.num, isFloat: cur.isFloat || rhs.isFloat };
          else if (expr.op === '-=') nextVal = { num: cur.num - rhs.num, isFloat: cur.isFloat || rhs.isFloat };
          else if (expr.op === '*=') nextVal = { num: cur.num * rhs.num, isFloat: cur.isFloat || rhs.isFloat };
          else if (expr.op === '/=') nextVal = { num: cur.isFloat || rhs.isFloat ? cur.num / rhs.num : Math.trunc(cur.num / rhs.num), isFloat: cur.isFloat || rhs.isFloat };
          else if (expr.op === '%=') nextVal = { num: Math.trunc(cur.num) % Math.trunc(rhs.num) };
        }
        cell.val = nextVal;
        return { ...nextVal };
      }
      case 'call': {
        if (expr.name === 'printf') {
          const argVals = expr.args.map(evalExpr);
          if (argVals.length > 0) {
            const fmt = argVals[0].str ?? String(argVals[0].num);
            stdout += formatPrintf(fmt, argVals.slice(1));
          }
          return { num: 0 };
        }
        const fn = funcMap.get(expr.name);
        if (!fn) {
          throw new Error(`Line ${expr.line}: Unknown function '${expr.name}'`);
        }
        const argVals = expr.args.map(evalExpr);
        return invokeFunction(fn, argVals, expr.line);
      }
    }
  };

  const invokeFunction = (fn: FuncDef, argVals: RuntimeVal[], callLine: number): RuntimeVal => {
    if (callStack.length >= MAX_CALL_DEPTH) {
      truncated = true;
      throw new Error('__TRUNCATED__');
    }
    const parentFrame = callStack[callStack.length - 1];
    if (callStack.some((f) => f.funcName === fn.name)) {
      isRecursiveProgram = true;
    }

    recNodeCounter += 1;
    const recNodeId = `call_${recNodeCounter}`;
    const argsLabel = argVals.map(formatRuntimeVal).join(', ');

    const recNode: FlowchartNode = {
      id: recNodeId,
      label: `${fn.name}(${argsLabel})`,
      type: fn.name === 'main' ? 'start' : 'call',
      line: fn.line,
      stepRefs: [],
    };
    recNodes.push(recNode);
    if (parentFrame) {
      recEdges.push({ from: parentFrame.nodeId, to: recNodeId });
    }

    const paramScope = new Map<string, VarBinding>();
    fn.params.forEach((p, idx) => {
      const val = argVals[idx] ?? { num: 0 };
      const addr = allocCell(`${fn.name}.${p.name}`, val);
      paramScope.set(p.name, { name: p.name, addr });
    });

    callStack.push({
      funcName: fn.name,
      nodeId: recNodeId,
      scopes: [paramScope],
      argsLabel,
    });

    recordStep(
      fn.line,
      `fn_${fn.name}_${fn.line}`,
      `${fn.name}(${argsLabel})`,
      'call',
      `Entered ${fn.name}(${argsLabel}) (called from line ${callLine})`
    );
    recNode.stepRefs.push(frames.length);

    let retVal: RuntimeVal = { num: 0 };
    try {
      execStmt(fn.body);
    } catch (sig) {
      if (sig instanceof ReturnSignal) {
        retVal = sig.value;
      } else {
        throw sig;
      }
    }

    recNode.returnLabel = formatRuntimeVal(retVal);
    recordStep(
      fn.line,
      `ret_${fn.name}_${fn.line}`,
      `return ${formatRuntimeVal(retVal)}`,
      'return',
      `${fn.name}(${argsLabel}) returned ${formatRuntimeVal(retVal)}`
    );
    recNode.stepRefs.push(frames.length);

    callStack.pop();
    return retVal;
  };

  const execStmt = (stmt: Stmt): void => {
    const activeScope = (): Map<string, VarBinding> => {
      const top = callStack[callStack.length - 1];
      return top ? top.scopes[top.scopes.length - 1] : globalScope;
    };

    switch (stmt.kind) {
      case 'block': {
        const top = callStack[callStack.length - 1];
        if (top) top.scopes.push(new Map());
        try {
          for (const s of stmt.stmts) execStmt(s);
        } finally {
          if (top) top.scopes.pop();
        }
        return;
      }
      case 'decl': {
        const scope = activeScope();
        const top = callStack[callStack.length - 1];
        const summaryParts: string[] = [];
        for (const item of stmt.items) {
          if (stmt.isStatic && top) {
            const key = `${top.funcName}::${item.name}`;
            if (!staticStorage.has(key)) {
              const initVal =
                item.init && !Array.isArray(item.init)
                  ? evalExpr(item.init)
                  : { num: 0, isFloat: stmt.baseType === 'float' || stmt.baseType === 'double' };
              const addr = allocCell(key, initVal);
              staticStorage.set(key, { name: item.name, addr, isStatic: true });
              summaryParts.push(`static ${item.name} = ${formatRuntimeVal(initVal)}`);
            } else {
              const existing = staticStorage.get(key)!;
              const cell = memory.get(existing.addr);
              summaryParts.push(`static ${item.name} retains ${cell ? formatRuntimeVal(cell.val) : '0'}`);
            }
            continue;
          }

          if (item.arraySize !== undefined) {
            const initArr = Array.isArray(item.init) ? item.init.map(evalExpr) : [];
            const len = item.arraySize ?? Math.max(1, initArr.length);
            const baseAddr = nextAddr;
            for (let k = 0; k < len; k++) {
              allocCell(`${item.name}[${k}]`, initArr[k] ?? { num: 0 });
            }
            scope.set(item.name, { name: item.name, addr: baseAddr, isArray: true, arrayLen: len });
            summaryParts.push(`${item.name}[${len}]`);
          } else {
            const initVal =
              item.init && !Array.isArray(item.init)
                ? evalExpr(item.init)
                : { num: 0, isFloat: stmt.baseType === 'float' || stmt.baseType === 'double', isPtr: item.isPointer };
            const addr = allocCell(item.name, initVal);
            scope.set(item.name, { name: item.name, addr });
            summaryParts.push(`${item.name} = ${formatRuntimeVal(initVal)}`);
          }
        }
        recordStep(
          stmt.line,
          `decl_${stmt.line}`,
          summaryParts.join(', ').slice(0, 34),
          'process',
          `Declared ${summaryParts.join(', ')}`
        );
        return;
      }
      case 'expr': {
        const val = evalExpr(stmt.expr);
        const label =
          stmt.expr.kind === 'call'
            ? `${stmt.expr.name}(...)`
            : stmt.expr.kind === 'assign' && stmt.expr.target.kind === 'ident'
            ? `${stmt.expr.target.name} ${stmt.expr.op} ${formatRuntimeVal(val)}`
            : `Line ${stmt.line} (${formatRuntimeVal(val)})`;
        recordStep(
          stmt.line,
          `expr_${stmt.line}`,
          label.slice(0, 34),
          stmt.expr.kind === 'call' && stmt.expr.name === 'printf' ? 'io' : 'process',
          stmt.expr.kind === 'call' && stmt.expr.name === 'printf'
            ? `Printed to stdout`
            : `Evaluated ${label}`
        );
        return;
      }
      case 'if': {
        const c = evalExpr(stmt.cond);
        const taken = c.num !== 0;
        recordStep(
          stmt.line,
          `if_${stmt.line}`,
          `if (L${stmt.line})?`,
          'decision',
          `Condition on line ${stmt.line} evaluated to ${taken ? 'TRUE' : 'FALSE'}`,
          taken ? 'true' : 'false'
        );
        if (taken) {
          execStmt(stmt.thenBranch);
        } else if (stmt.elseBranch) {
          execStmt(stmt.elseBranch);
        }
        return;
      }
      case 'while': {
        let iters = 0;
        while (iters < MAX_LOOP_ITERS) {
          iters++;
          const c = evalExpr(stmt.cond);
          const taken = c.num !== 0;
          recordStep(
            stmt.line,
            `while_${stmt.line}`,
            `while (L${stmt.line})?`,
            'decision',
            `While condition on line ${stmt.line} is ${taken ? 'TRUE' : 'FALSE'}`,
            taken ? 'true' : 'false'
          );
          if (!taken) break;
          try {
            execStmt(stmt.body);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) continue;
            throw sig;
          }
        }
        if (iters >= MAX_LOOP_ITERS) truncated = true;
        return;
      }
      case 'dowhile': {
        let iters = 0;
        while (iters < MAX_LOOP_ITERS) {
          iters++;
          try {
            execStmt(stmt.body);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (!(sig instanceof ContinueSignal)) throw sig;
          }
          const c = evalExpr(stmt.cond);
          const taken = c.num !== 0;
          recordStep(
            stmt.line,
            `dowhile_${stmt.line}`,
            `do-while (L${stmt.line})?`,
            'decision',
            `Do-while condition on line ${stmt.line} is ${taken ? 'TRUE' : 'FALSE'}`,
            taken ? 'true' : 'false'
          );
          if (!taken) break;
        }
        return;
      }
      case 'for': {
        const top = callStack[callStack.length - 1];
        if (top) top.scopes.push(new Map());
        try {
          if (stmt.init) execStmt(stmt.init);
          let iters = 0;
          while (iters < MAX_LOOP_ITERS) {
            iters++;
            if (stmt.cond) {
              const c = evalExpr(stmt.cond);
              const taken = c.num !== 0;
              recordStep(
                stmt.line,
                `for_${stmt.line}`,
                `for loop (L${stmt.line})?`,
                'decision',
                `For condition on line ${stmt.line} is ${taken ? 'TRUE' : 'FALSE'}`,
                taken ? 'true' : 'false'
              );
              if (!taken) break;
            }
            try {
              execStmt(stmt.body);
            } catch (sig) {
              if (sig instanceof BreakSignal) break;
              if (!(sig instanceof ContinueSignal)) throw sig;
            }
            if (stmt.post) {
              evalExpr(stmt.post);
            }
          }
          if (iters >= MAX_LOOP_ITERS) truncated = true;
        } finally {
          if (top) top.scopes.pop();
        }
        return;
      }
      case 'return': {
        const val = stmt.value ? evalExpr(stmt.value) : { num: 0 };
        recordStep(
          stmt.line,
          `return_${stmt.line}`,
          `return ${formatRuntimeVal(val)}`,
          'return',
          `Returning ${formatRuntimeVal(val)}`
        );
        throw new ReturnSignal(val);
      }
      case 'break':
        throw new BreakSignal();
      case 'continue':
        throw new ContinueSignal();
    }
  };

  try {
    for (const g of ast.globals) {
      execStmt(g);
    }
    const mainFn = funcMap.get('main');
    if (mainFn) {
      invokeFunction(mainFn, [], mainFn.line);
    } else if (ast.functions.length > 0 && ast.globals.length === 0) {
      // Auto-invoke first helper with sample input if user pasted just a single function
      const firstFn = ast.functions[0];
      const defaultArgs = firstFn.params.map(() => ({ num: 3 }));
      invokeFunction(firstFn, defaultArgs, firstFn.line);
    }
    ensureCfgNode('end', 'End', 'end', frames[frames.length - 1]?.line ?? 1, frames.length);
    addCfgEdge(lastCfgNodeId, 'end');
  } catch (err) {
    if (!(err instanceof Error && err.message === '__TRUNCATED__')) {
      return {
        ok: false,
        engine: 'local',
        stdout,
        frames,
        flowchart: {
          mode: isRecursiveProgram ? 'recursion_tree' : 'flowchart',
          nodes: isRecursiveProgram ? recNodes : Array.from(cfgNodes.values()),
          edges: isRecursiveProgram ? recEdges : Array.from(cfgEdges.values()),
        },
        error: err instanceof Error ? err.message : 'Runtime error during dry-run.',
      };
    }
  }

  // Finalize graph mode: Recursion Tree for recursive functions, CFG Flowchart for procedural code
  const flowchart: CodeFlowchartGraph = isRecursiveProgram && recNodes.length > 1
    ? { mode: 'recursion_tree', nodes: recNodes, edges: recEdges }
    : {
        mode: 'flowchart',
        nodes: Array.from(cfgNodes.values()),
        edges: Array.from(cfgEdges.values()),
      };

  // Normalize activeNodeId for every frame so node clicks always align cleanly
  for (const frame of frames) {
    if (flowchart.mode === 'recursion_tree') {
      frame.activeNodeId = frame.recNodeId || flowchart.nodes[0]?.id || 'start';
    } else {
      frame.activeNodeId = frame.cfgNodeId || frame.activeNodeId;
    }
  }

  return {
    ok: true,
    engine: 'local',
    stdout,
    frames,
    flowchart,
    truncated,
  };
}

/**
 * Converts recorded execution frames directly into a Dry-Run Trace Table (1-click Copy Trace to Table).
 */
export function convertFramesToTraceTable(
  questionId: string,
  frames: CodeTraceFrame[]
): DryRunTraceTable {
  const columns = ['Step', 'Line', 'Variables / Pointers', 'Condition', 'Stdout'];
  const rows = frames.slice(0, 60).map((f, idx) => {
    const varSummary = Object.entries(f.variables)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const condText =
      f.branchTaken === 'true'
        ? 'TRUE'
        : f.branchTaken === 'false'
        ? 'FALSE'
        : f.explanation.slice(0, 42);
    return {
      id: `r_${Date.now()}_${idx}`,
      cells: [
        String(f.step),
        `L${f.line}`,
        varSummary || '—',
        condText || '—',
        f.outputSoFar.replace(/\n/g, ' ↵ ').slice(-48) || '—',
      ],
    };
  });

  return {
    questionId,
    columns,
    rows,
    presetName: 'Auto-Trace',
    updatedAt: new Date().toISOString(),
  };
}
