export type Slots = {
  input: unknown;
  state: Record<string, unknown>;
  output: unknown;
  resume: unknown;
  /** Set only inside control:map workers. */
  item?: unknown;
  /** Set only inside control:map workers. */
  index?: number;
};
type PathNode = { type: 'path'; path: string };
type LiteralNode = { type: 'literal'; value: string | number | boolean | null };
type UnaryNode = { type: 'unary'; op: '!'; expr: Ast };
type BinaryNode = { type: 'binary'; op: string; left: Ast; right: Ast };
type CallNode = { type: 'call'; name: 'exists' | 'length'; path: string };
export type Ast = PathNode | LiteralNode | UnaryNode | BinaryNode | CallNode;
type Token = { type: 'path'; value: string } | { type: 'string'; value: string } | { type: 'number'; value: number } | { type: 'boolean'; value: boolean } | { type: 'null'; value: null } | { type: 'ident'; value: string } | { type: 'op'; value: string } | { type: 'lparen' } | { type: 'rparen' } | { type: 'comma' } | { type: 'eof' };
function syntaxError(msg: string): never { const e = new Error(msg) as Error & { code: string }; e.code = 'expr_syntax'; throw e; }
function unknownPathError(msg: string): never { const e = new Error(msg) as Error & { code: string }; e.code = 'unknown_path'; throw e; }
function parseStringLiteral(src: string, st: number): { value: string; end: number } {
  const q = src[st]; let i = st + 1; let out = '';
  while (i < src.length) {
    const ch = src[i] as string;
    if (ch === '\\') {
      const n = src[i + 1]; if (n === undefined) syntaxError('unterminated string');
      if (n === 'n') out += '\n'; else if (n === 't') out += '\t'; else if (n === 'r') out += '\r'; else out += n as string;
      i += 2; continue;
    }
    if (ch === q) return { value: out, end: i + 1 };
    out += ch; i += 1;
  }
  syntaxError('unterminated string');
}
function tokenize(expr: string): Token[] {
  const t: Token[] = []; let i = 0; const n = expr.length;
  while (i < n) {
    const ch = expr[i] as string;
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '$') {
      const rest = expr.slice(i); const m = rest.match(/^\$(input|state|output|resume|item|index)\b/);
      if (!m) syntaxError(`invalid path at ${i}`); let end = i + m[0].length;
      while (end < n) {
        const c = expr[end] as string;
        if (c === '.') {
          if (end + 1 >= n || !/[a-zA-Z_]/.test(expr[end + 1] as string)) syntaxError(`invalid segment at ${end}`);
          let j = end + 1; while (j < n && /[a-zA-Z0-9_]/.test(expr[j] as string)) j += 1; end = j;
        } else if (c === '[') {
          let j = end + 1; while (j < n && /\s/.test(expr[j] as string)) j += 1;
          if (j >= n) syntaxError('unterminated [ in path'); const cj = expr[j] as string;
          if (cj === '"' || cj === "'") {
            const p = parseStringLiteral(expr, j); j = p.end; while (j < n && /\s/.test(expr[j] as string)) j += 1;
            if (expr[j] !== ']') syntaxError('missing ]'); end = j + 1;
          } else if (/[0-9]/.test(cj) || (cj === '-' && /[0-9]/.test(expr[j + 1] ?? ''))) {
            let k = j; if (expr[k] === '-') k += 1; while (k < n && /[0-9]/.test(expr[k] as string)) k += 1;
            while (k < n && /\s/.test(expr[k] as string)) k += 1; if (expr[k] !== ']') syntaxError('missing ]'); end = k + 1;
          } else syntaxError(`invalid bracket at ${j}`);
        } else break;
      }
      t.push({ type: 'path', value: expr.slice(i, end) }); i = end; continue;
    }
    if (ch === '"' || ch === "'") { const p = parseStringLiteral(expr, i); t.push({ type: 'string', value: p.value }); i = p.end; continue; }
    if (/[0-9]/.test(ch) || (ch === '-' && i + 1 < n && /[0-9]/.test(expr[i + 1] as string))) {
      let j = i; if (expr[j] === '-') j += 1; while (j < n && /[0-9]/.test(expr[j] as string)) j += 1;
      if (j < n && expr[j] === '.' && j + 1 < n && /[0-9]/.test(expr[j + 1] as string)) { j += 1; while (j < n && /[0-9]/.test(expr[j] as string)) j += 1; }
      const raw = expr.slice(i, j); const num = Number(raw); if (Number.isNaN(num)) syntaxError(`invalid number ${raw}`);
      t.push({ type: 'number', value: num }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i; while (j < n && /[a-zA-Z0-9_]/.test(expr[j] as string)) j += 1; const w = expr.slice(i, j);
      if (w === 'true') t.push({ type: 'boolean', value: true }); else if (w === 'false') t.push({ type: 'boolean', value: false });
      else if (w === 'null') t.push({ type: 'null', value: null }); else if (w === 'exists' || w === 'length') t.push({ type: 'ident', value: w });
      else syntaxError(`unknown identifier "${w}"`); i = j; continue;
    }
    if (ch === '(') { t.push({ type: 'lparen' }); i += 1; continue; }
    if (ch === ')') { t.push({ type: 'rparen' }); i += 1; continue; }
    if (ch === ',') { t.push({ type: 'comma' }); i += 1; continue; }
    if (ch === '&' && expr[i + 1] === '&') { t.push({ type: 'op', value: '&&' }); i += 2; continue; }
    if (ch === '|' && expr[i + 1] === '|') { t.push({ type: 'op', value: '||' }); i += 2; continue; }
    if (ch === '!' && expr[i + 1] === '=') { t.push({ type: 'op', value: '!=' }); i += 2; continue; }
    if (ch === '>' && expr[i + 1] === '=') { t.push({ type: 'op', value: '>=' }); i += 2; continue; }
    if (ch === '<' && expr[i + 1] === '=') { t.push({ type: 'op', value: '<=' }); i += 2; continue; }
    if (ch === '=' && expr[i + 1] === '=') { t.push({ type: 'op', value: '==' }); i += 2; continue; }
    if (ch === '=' || ch === '>' || ch === '<' || ch === '!') { t.push({ type: 'op', value: ch }); i += 1; continue; }
    syntaxError(`unexpected "${ch}" at ${i}`);
  }
  t.push({ type: 'eof' }); return t;
}
class Parser {
  pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) { this.tokens = tokens; }
  peek(): Token { return this.tokens[this.pos] as Token; }
  consume(): Token { const v = this.tokens[this.pos] as Token; this.pos += 1; return v; }
  matchOp(v: string): boolean { const p = this.peek(); if (p.type === 'op' && p.value === v) { this.consume(); return true; } return false; }
  parse(): Ast {
    if (this.peek().type === 'eof') syntaxError('empty expression'); const node = this.parseOr();
    if (this.peek().type !== 'eof') syntaxError('unexpected token after expression'); return node;
  }
  parseOr(): Ast { let l = this.parseAnd(); while (this.matchOp('||')) { const r = this.parseAnd(); l = { type: 'binary', op: '||', left: l, right: r }; } return l; }
  parseAnd(): Ast { let l = this.parseEquality(); while (this.matchOp('&&')) { const r = this.parseEquality(); l = { type: 'binary', op: '&&', left: l, right: r }; } return l; }
  parseEquality(): Ast {
    let l = this.parseComparison();
    while (true) {
      const p = this.peek();
      if (p.type === 'op' && (p.value === '=' || p.value === '==' || p.value === '!=')) {
        this.consume(); const op = p.value === '=' ? '=' : p.value; const r = this.parseComparison(); l = { type: 'binary', op, left: l, right: r };
      } else break;
    }
    return l;
  }
  parseComparison(): Ast {
    let l = this.parseUnary();
    while (true) {
      const p = this.peek();
      if (p.type === 'op' && (p.value === '>' || p.value === '<' || p.value === '>=' || p.value === '<=')) {
        this.consume(); const r = this.parseUnary(); l = { type: 'binary', op: p.value, left: l, right: r };
      } else break;
    }
    return l;
  }
  parseUnary(): Ast { const p = this.peek(); if (p.type === 'op' && p.value === '!') { this.consume(); return { type: 'unary', op: '!', expr: this.parseUnary() }; } return this.parsePrimary(); }
  parsePrimary(): Ast {
    const p = this.peek();
    if (p.type === 'lparen') {
      this.consume(); const inner = this.parseOr(); if (this.peek().type !== 'rparen') syntaxError('missing )'); this.consume(); return inner;
    }
    if (p.type === 'path') { this.consume(); return { type: 'path', path: p.value }; }
    if (p.type === 'string' || p.type === 'number' || p.type === 'boolean' || p.type === 'null') {
      this.consume(); return { type: 'literal', value: p.value as string | number | boolean | null };
    }
    if (p.type === 'ident') {
      const name = p.value; this.consume(); if (this.peek().type !== 'lparen') syntaxError(`expected ( after ${name}`);
      this.consume(); const arg = this.peek(); if (arg.type !== 'path') syntaxError(`${name} expects path`);
      this.consume(); if (this.peek().type !== 'rparen') syntaxError(`missing ) after ${name}`); this.consume();
      return { type: 'call', name: name as 'exists' | 'length', path: (arg as { value: string }).value };
    }
    syntaxError('unexpected token');
  }
}
export function parseExpr(expr: string): Ast { return new Parser(tokenize(expr)).parse(); }
export function getByPath(root: Slots, path: string): unknown {
  const trimmed = path.trim(); const m = trimmed.match(/^\$(input|state|output|resume|item|index)\b/);
  if (!m) unknownPathError(`invalid path ${path}`);
  const base = m[1] as 'input' | 'state' | 'output' | 'resume' | 'item' | 'index';
  let cur: unknown =
    base === 'input' ? root.input
    : base === 'state' ? root.state
    : base === 'output' ? root.output
    : base === 'resume' ? root.resume
    : base === 'item' ? root.item
    : root.index;
  if ((base === 'item' || base === 'index') && cur === undefined) unknownPathError(`unknown_path ${path}`);
  let rest = trimmed.slice(m[0].length); let i = 0;
  while (i < rest.length) {
    const ch = rest[i] as string;
    if (ch === '.') {
      let j = i + 1; while (j < rest.length && /[a-zA-Z0-9_]/.test(rest[j] as string)) j += 1;
      const key = rest.slice(i + 1, j); if (!key) unknownPathError(`invalid segment in ${path}`);
      if (cur === null || cur === undefined || typeof cur !== 'object') unknownPathError(`unknown_path ${path} at .${key}`);
      const obj = cur as Record<string, unknown>; if (!(key in obj)) unknownPathError(`unknown_path ${path} missing ${key}`);
      cur = obj[key]; i = j;
    } else if (ch === '[') {
      let j = i + 1; while (j < rest.length && /\s/.test(rest[j] as string)) j += 1;
      if (j >= rest.length) unknownPathError(`unterminated [ in ${path}`); const cj = rest[j] as string;
      if (cj === '"' || cj === "'") {
        const p = parseStringLiteral(rest, j); const key = p.value; j = p.end;
        while (j < rest.length && /\s/.test(rest[j] as string)) j += 1; if (rest[j] !== ']') unknownPathError(`missing ] in ${path}`);
        if (cur === null || cur === undefined || typeof cur !== 'object') unknownPathError(`unknown_path ${path} at ["${key}"]`);
        const obj = cur as Record<string, unknown>; if (!(key in obj)) unknownPathError(`unknown_path ${path} missing ${key}`);
        cur = obj[key]; i = j + 1;
      } else {
        let k = j; if (rest[k] === '-') k += 1; while (k < rest.length && /[0-9]/.test(rest[k] as string)) k += 1;
        const raw = rest.slice(j, k); if (!raw) unknownPathError(`invalid index in ${path}`); const idx = Number(raw);
        while (k < rest.length && /\s/.test(rest[k] as string)) k += 1; if (rest[k] !== ']') unknownPathError(`missing ] in ${path}`);
        if (!Array.isArray(cur)) unknownPathError(`unknown_path ${path} not array at [${idx}]`);
        const arr = cur as unknown[]; if (idx < 0 || idx >= arr.length) unknownPathError(`unknown_path ${path} index ${idx} out of bounds`);
        cur = arr[idx]; i = k + 1;
      }
    } else if (/\s/.test(ch)) i += 1; else unknownPathError(`invalid char "${ch}" in ${path}`);
  }
  return cur;
}
function evalAst(node: Ast, slots: Slots): unknown {
  switch (node.type) {
    case 'path': return getByPath(slots, node.path);
    case 'literal': return node.value;
    case 'unary': return !Boolean(evalAst(node.expr, slots));
    case 'binary': {
      const op = node.op;
      if (op === '&&') { const l = evalAst(node.left, slots); if (!Boolean(l)) return l; return evalAst(node.right, slots); }
      if (op === '||') { const l = evalAst(node.left, slots); if (Boolean(l)) return l; return evalAst(node.right, slots); }
      if (op === '=' || op === '==') return evalAst(node.left, slots) === evalAst(node.right, slots);
      if (op === '!=') return evalAst(node.left, slots) !== evalAst(node.right, slots);
      if (op === '>' || op === '<' || op === '>=' || op === '<=') {
        const l = evalAst(node.left, slots) as number; const r = evalAst(node.right, slots) as number;
        if (op === '>') return l > r; if (op === '<') return l < r; if (op === '>=') return l >= r; return l <= r;
      }
      syntaxError(`unknown op ${op}`);
    }
    case 'call': {
      if (node.name === 'exists') {
        try { getByPath(slots, node.path); return true; } catch (e) { if ((e as { code?: string }).code === 'unknown_path') return false; throw e; }
      }
      if (node.name === 'length') {
        const v = getByPath(slots, node.path);
        if (typeof v === 'string' || Array.isArray(v)) return v.length;
        if (v !== null && typeof v === 'object') return Object.keys(v as Record<string, unknown>).length;
        unknownPathError(`length not countable at ${node.path}`);
      }
      syntaxError(`unknown fn ${node.name}`);
    }
  }
}
export function evalExpr(expr: string, slots: Slots): unknown { return evalAst(parseExpr(expr), slots); }
export function evalWhen(expr: string, slots: Slots): boolean { return Boolean(evalExpr(expr, slots)); }
export function substitutePrompt(instructions: string, slots: Slots): string {
  return instructions.replace(/\{\$[^}]+\}/g, (m) => {
    const inner = m.slice(1, -1);
    try { return JSON.stringify(evalExpr(inner, slots)); } catch { return m; }
  });
}
export function isPathExpr(expr: string): boolean {
  const t = expr.trim(); if (!t) return false;
  try { const toks = tokenize(t); return toks.length === 2 && toks[0]?.type === 'path' && toks[1]?.type === 'eof'; } catch { return false; }
}
export function extractPath(expr: string): string { if (!isPathExpr(expr)) syntaxError(`not a path expr: ${expr}`); return expr.trim(); }
