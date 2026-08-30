/** Human-readable tool_call input for HITL confirm. */

import { type DiffDetail, detectLanguage, diffFromEdit } from '@/shared/lib/tool-code';

export type ToolInputPreview =
  | { kind: 'code'; language?: string; text: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'diff'; detail: DiffDetail }
  | { kind: 'text'; text: string };

export type ToolInputSummary = {
  title: string;
  lines: Array<{ label: string; value: string }>;
  preview?: ToolInputPreview;
};

export function summarizeToolInput(name: string, raw: string | undefined): ToolInputSummary {
  const title = toolTitle(name);
  const fields = parseFields(raw);
  if (!fields) {
    return {
      title,
      lines: [],
      preview: raw?.trim() ? { kind: 'text', text: raw.trim() } : undefined,
    };
  }

  switch (name) {
    case 'write_file': {
      const path = typeof fields.path === 'string' ? fields.path : '';
      const content = typeof fields.content === 'string' ? fields.content : '';
      return {
        title,
        lines: linePairs(fields, ['path']),
        preview: contentPreview(path, content),
      };
    }
    case 'edit_file': {
      const path = typeof fields.path === 'string' ? fields.path : '';
      const oldText = typeof fields.old_string === 'string' ? fields.old_string : '';
      const newText = typeof fields.new_string === 'string' ? fields.new_string : '';
      if (oldText || newText) {
        return {
          title,
          lines: linePairs(fields, ['path']),
          preview: { kind: 'diff', detail: diffFromEdit(path, oldText, newText) },
        };
      }
      const content = typeof fields.content === 'string' ? fields.content : '';
      return {
        title,
        lines: linePairs(fields, ['path']),
        preview: content ? contentPreview(path, content) : undefined,
      };
    }
    case 'read_file':
      return { title, lines: linePairs(fields, ['path', 'offset', 'limit']) };
    case 'list_dir':
      return { title, lines: linePairs(fields, ['path', 'depth']) };
    case 'glob':
      return { title, lines: linePairs(fields, ['pattern', 'path']) };
    case 'grep':
      return { title, lines: linePairs(fields, ['pattern', 'path', 'glob']) };
    case 'shell': {
      const command = typeof fields.command === 'string' ? fields.command : '';
      return {
        title,
        lines: linePairs(fields, ['cwd']),
        preview: command ? { kind: 'code', language: 'bash', text: command } : undefined,
      };
    }
    case 'http':
    case 'fetch': {
      const body = typeof fields.body === 'string' ? fields.body : undefined;
      return {
        title,
        lines: [
          ...linePairs(fields, ['method']),
          ...(typeof fields.url === 'string' ? [{ label: 'url', value: fields.url }] : []),
        ],
        preview: body
          ? {
              kind: 'code',
              language: looksJson(body) ? 'json' : undefined,
              text: prettyJson(body) ?? body,
            }
          : undefined,
      };
    }
    default:
      return {
        title,
        lines: Object.entries(fields)
          .filter(([, value]) => value !== undefined && value !== '')
          .slice(0, 8)
          .map(([label, value]) => ({
            label,
            value: truncate(stringifyValue(value), 120),
          })),
      };
  }
}

function contentPreview(path: string, content: string): ToolInputPreview | undefined {
  if (!content) {
    return undefined;
  }
  if (detectLanguage(path) === 'markdown') {
    return { kind: 'markdown', text: content };
  }
  return {
    kind: 'code',
    language: detectLanguage(path),
    text: content,
  };
}

function toolTitle(name: string): string {
  switch (name) {
    case 'write_file':
      return 'Write File';
    case 'edit_file':
      return 'Edit File';
    case 'read_file':
      return 'Read File';
    case 'list_dir':
      return 'List Dir';
    case 'glob':
      return 'Glob';
    case 'grep':
      return 'Grep';
    case 'shell':
      return 'Terminal';
    case 'http':
    case 'fetch':
      return 'Fetch';
    default:
      return name;
  }
}

function parseFields(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function linePairs(
  fields: Record<string, unknown>,
  keys: string[],
): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [];
  for (const key of keys) {
    const value = fields[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    lines.push({ label: key, value: truncate(stringifyValue(value), 160) });
  }
  return lines;
}

function looksJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function prettyJson(text: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return undefined;
  }
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
