import { type CodeLine, detectLanguage, textToLines } from '@/shared/lib/tool-code';
import type {
  EntriesDetail,
  FileDetail,
  GrepDetail,
  GrepMatchItem,
  ListEntryItem,
} from './tool-detail-types';
import { has, type JsonObject, str } from './tool-json';
export function isFileOutput(obj: JsonObject | undefined): boolean {
  return obj !== undefined && typeof obj.content === 'string' && has(obj, 'totalLines');
}
export function parseFileDetail(
  obj: JsonObject | undefined,
  raw: string,
  input: JsonObject | undefined,
  hint: string,
): FileDetail | undefined {
  const content = obj ? str(obj, 'content') : raw;
  if (content === undefined) {
    return undefined;
  }
  const pathStr =
    (input ? str(input, 'path') : undefined) ?? (obj ? str(obj, 'path') : undefined) ?? hint;
  const numbered = parseNumberedLines(content);
  const totalLines = obj && typeof obj.totalLines === 'number' ? obj.totalLines : undefined;
  const truncated = obj && typeof obj.truncated === 'boolean' ? obj.truncated : undefined;
  if (numbered) {
    const rawClean = numbered.map((l) => l.text).join('\n');
    return {
      type: 'file',
      path: pathStr,
      language: detectLanguage(pathStr),
      totalLines,
      truncated,
      lines: numbered,
      rawContent: rawClean,
    };
  }
  const lines = textToLines(content);
  return {
    type: 'file',
    path: pathStr,
    language: detectLanguage(pathStr),
    totalLines: totalLines ?? lines.length,
    truncated,
    lines,
    rawContent: content,
  };
}
function parseNumberedLines(text: string): CodeLine[] | undefined {
  const rows = text.split('\n');
  const lines: CodeLine[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? '';
    if (row.length === 0 && i === rows.length - 1) {
      continue;
    }
    const match = /^(\d+): ?(.*)$/.exec(row);
    if (!match) {
      return undefined;
    }
    lines.push({ number: Number.parseInt(match[1] ?? '0', 10), text: match[2] ?? '' });
  }
  return lines.length > 0 ? lines : undefined;
}
export function isListDirOutput(obj: JsonObject | undefined): boolean {
  return obj !== undefined && Array.isArray(obj.entries);
}
export function parseListDirDetail(
  obj: JsonObject | undefined,
  input: JsonObject | undefined,
): EntriesDetail {
  const pathStr = (input ? str(input, 'path') : undefined) ?? (obj ? str(obj, 'path') : undefined);
  const rawEntries = obj && Array.isArray(obj.entries) ? obj.entries : [];
  const items: ListEntryItem[] = [];
  for (const entry of rawEntries) {
    if (entry && typeof entry === 'object') {
      const e = entry as JsonObject;
      items.push({
        name: str(e, 'name') ?? '',
        type: str(e, 'type') === 'dir' ? 'dir' : 'file',
        size: typeof e.size === 'number' ? e.size : undefined,
      });
    }
  }
  const truncated = obj && typeof obj.truncated === 'boolean' ? obj.truncated : undefined;
  return { type: 'entries', path: pathStr, truncated, items };
}
export function isGlobOutput(obj: JsonObject | undefined): boolean {
  return obj !== undefined && Array.isArray(obj.matches) && typeof obj.pattern === 'string';
}
export function parseGlobDetail(
  obj: JsonObject | undefined,
  input: JsonObject | undefined,
): EntriesDetail {
  const pattern =
    (input ? str(input, 'pattern') : undefined) ?? (obj ? str(obj, 'pattern') : undefined);
  const matches = obj && Array.isArray(obj.matches) ? obj.matches : [];
  const items: ListEntryItem[] = matches
    .filter((m): m is string => typeof m === 'string')
    .map((name) => ({ name, type: 'file' as const }));
  return { type: 'entries', pattern, items };
}
export function isGrepOutput(obj: JsonObject | undefined): boolean {
  return (
    obj !== undefined &&
    Array.isArray(obj.matches) &&
    obj.matches.length > 0 &&
    typeof (obj.matches[0] as JsonObject)?.file === 'string'
  );
}
export function parseGrepDetail(
  obj: JsonObject | undefined,
  input: JsonObject | undefined,
): GrepDetail {
  const pattern =
    (input ? str(input, 'pattern') : undefined) ?? (obj ? str(obj, 'pattern') : undefined) ?? '';
  const rawMatches = obj && Array.isArray(obj.matches) ? obj.matches : [];
  const matches: GrepMatchItem[] = [];
  for (const item of rawMatches) {
    if (item && typeof item === 'object') {
      const m = item as JsonObject;
      matches.push({
        file: str(m, 'file') ?? '',
        line: typeof m.line === 'number' ? m.line : 1,
        text: str(m, 'text') ?? '',
      });
    }
  }
  const truncated = obj && typeof obj.truncated === 'boolean' ? obj.truncated : undefined;
  return { type: 'grep', pattern, matches, truncated };
}
