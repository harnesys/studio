import type { DiffDetail, DiffHunk } from '@/shared/lib/tool-code';
import { type JsonObject, str } from './tool-json';
export function isDiffOutput(obj: JsonObject | undefined, raw: string): boolean {
  if (obj && typeof obj.diff === 'string') {
    return true;
  }
  return raw.startsWith('Index:') || raw.startsWith('--- ') || raw.includes('@@ -');
}
export function parseDiffDetail(
  obj: JsonObject | undefined,
  raw: string,
  input: JsonObject | undefined,
): DiffDetail | undefined {
  const diffText = (obj ? str(obj, 'diff') : undefined) ?? (raw.includes('@@ -') ? raw : undefined);
  if (!diffText) {
    return undefined;
  }
  const pathStr =
    (obj ? str(obj, 'path') : undefined) ?? (input ? str(input, 'path') : undefined) ?? '';
  const replacements = obj && typeof obj.replacements === 'number' ? obj.replacements : undefined;
  const { hunks, addedCount, deletedCount } = parseUnifiedDiff(diffText);
  return {
    type: 'diff',
    path: pathStr,
    replacements,
    addedCount,
    deletedCount,
    hunks,
    rawDiff: diffText,
  };
}
function parseUnifiedDiff(diffText: string): {
  hunks: DiffHunk[];
  addedCount: number;
  deletedCount: number;
} {
  const lines = diffText.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let addedCount = 0;
  let deletedCount = 0;
  for (const rawLine of lines) {
    if (rawLine.startsWith('@@ ')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(rawLine);
      if (match) {
        oldLine = Number.parseInt(match[1] ?? '1', 10);
        newLine = Number.parseInt(match[2] ?? '1', 10);
      }
      currentHunk = { header: rawLine, lines: [] };
      hunks.push(currentHunk);
      continue;
    }
    if (!currentHunk) {
      continue;
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      addedCount += 1;
      currentHunk.lines.push({
        type: 'add',
        newLineNumber: newLine,
        text: rawLine.slice(1),
      });
      newLine += 1;
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      deletedCount += 1;
      currentHunk.lines.push({
        type: 'del',
        oldLineNumber: oldLine,
        text: rawLine.slice(1),
      });
      oldLine += 1;
    } else if (rawLine.startsWith(' ') || rawLine === '') {
      currentHunk.lines.push({
        type: 'ctx',
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        text: rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine,
      });
      oldLine += 1;
      newLine += 1;
    }
  }
  return { hunks, addedCount, deletedCount };
}
