import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LspDiagnostic, LspDiagnosticSeverity, LspHover, LspLocation } from 'harnesys/lsp';

const SEVERITY: Record<number, LspDiagnosticSeverity> = {
  1: 'error',
  2: 'warning',
  3: 'information',
  4: 'hint',
};
export function toDiagnostic(
  raw: unknown,
  uri: string,
  workspaceRoot: string,
): LspDiagnostic | undefined {
  if (
    !isRecord(raw) ||
    !isRecord(raw.range) ||
    !isRecord(raw.range.start) ||
    !isRecord(raw.range.end)
  ) {
    return undefined;
  }
  const start = raw.range.start;
  const end = raw.range.end;
  if (typeof start.line !== 'number' || typeof start.character !== 'number') {
    return undefined;
  }
  if (typeof end.line !== 'number' || typeof end.character !== 'number') {
    return undefined;
  }
  if (typeof raw.message !== 'string') {
    return undefined;
  }
  const severity =
    typeof raw.severity === 'number' ? (SEVERITY[raw.severity] ?? 'information') : 'information';
  const diagnostic: LspDiagnostic = {
    path: toRel(fileUrlToPath(uri), workspaceRoot),
    line: start.line,
    character: start.character,
    endLine: end.line,
    endCharacter: end.character,
    severity,
    message: raw.message,
  };
  if (typeof raw.source === 'string') {
    diagnostic.source = raw.source;
  }
  if (typeof raw.code === 'string' || typeof raw.code === 'number') {
    diagnostic.code = String(raw.code);
  }
  return diagnostic;
}
export function normalizeLocations(raw: unknown, workspaceRoot: string): LspLocation[] {
  if (raw == null) {
    return [];
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const out: LspLocation[] = [];
  for (const item of list) {
    const loc = toLocation(item, workspaceRoot);
    if (loc) {
      out.push(loc);
    }
  }
  return out;
}
function toLocation(raw: unknown, workspaceRoot: string): LspLocation | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const uri = locationUri(raw);
  const range = locationRange(raw);
  if (!uri || !isRecord(range) || !isRecord(range.start) || !isRecord(range.end)) {
    return undefined;
  }
  if (typeof range.start.line !== 'number' || typeof range.start.character !== 'number') {
    return undefined;
  }
  if (typeof range.end.line !== 'number' || typeof range.end.character !== 'number') {
    return undefined;
  }
  return {
    path: toRel(fileUrlToPath(uri), workspaceRoot),
    line: range.start.line,
    character: range.start.character,
    endLine: range.end.line,
    endCharacter: range.end.character,
  };
}
function locationUri(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.targetUri === 'string') {
    return raw.targetUri;
  }
  if (typeof raw.uri === 'string') {
    return raw.uri;
  }
  return undefined;
}
function locationRange(raw: Record<string, unknown>): unknown {
  if (isRecord(raw.targetSelectionRange)) {
    return raw.targetSelectionRange;
  }
  if (isRecord(raw.targetRange)) {
    return raw.targetRange;
  }
  return raw.range;
}
export function normalizeHover(raw: unknown): LspHover | null {
  if (!isRecord(raw)) {
    return null;
  }
  const contents = formatHoverContents(raw.contents);
  if (!contents) {
    return null;
  }
  const hover: LspHover = { contents };
  if (isRecord(raw.range) && isRecord(raw.range.start) && isRecord(raw.range.end)) {
    const start = raw.range.start;
    const end = raw.range.end;
    if (
      typeof start.line === 'number' &&
      typeof start.character === 'number' &&
      typeof end.line === 'number' &&
      typeof end.character === 'number'
    ) {
      hover.range = {
        line: start.line,
        character: start.character,
        endLine: end.line,
        endCharacter: end.character,
      };
    }
  }
  return hover;
}
function formatHoverContents(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    return raw;
  }
  if (isRecord(raw) && typeof raw.value === 'string') {
    return raw.value;
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => formatHoverContents(item))
      .filter((item): item is string => Boolean(item))
      .join('\n\n');
  }
  return undefined;
}
function fileUrlToPath(uri: string): string {
  if (uri.startsWith('file:')) {
    return fileURLToPath(uri);
  }
  return uri;
}
function toRel(absPath: string, workspaceRoot: string): string {
  const rel = relative(workspaceRoot, absPath);
  return rel.startsWith('..') ? absPath : rel.split(sep).join('/');
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
