import type { TranscriptActivity } from '@studio/shared';
import { isBuiltinStep, stepInputText, stepText } from '@studio/shared';

export type ToolCaption = {
  title: string;
  hint: string;
  kind: 'terminal' | 'file' | 'search' | 'globe' | 'pencil';
};

export function toolCaption(item: Extract<TranscriptActivity, { type: 'tool' }>): ToolCaption {
  const name = toolCallName(item) ?? 'tool';
  const fields = fieldsOf(stepInputText(item.call) || (item.result ? stepText(item.result) : ''));
  if (name === 'shell') {
    return { kind: 'terminal', title: 'Terminal', hint: fields.command ?? firstLine(item) };
  }
  if (name === 'read_file') {
    return { kind: 'file', title: 'Read File', hint: baseName(fields.path ?? firstLine(item)) };
  }
  if (name === 'write_file') {
    return {
      kind: 'pencil',
      title: 'Write File',
      hint: baseName(fields.path ?? firstLine(item)),
    };
  }
  if (name === 'edit_file') {
    return {
      kind: 'pencil',
      title: 'Edit File',
      hint: baseName(fields.path ?? firstLine(item)),
    };
  }
  if (name === 'list_dir') {
    return { kind: 'file', title: 'List Dir', hint: fields.path ?? firstLine(item) };
  }
  if (name === 'glob') {
    return { kind: 'search', title: 'Glob', hint: fields.pattern ?? firstLine(item) };
  }
  if (name === 'grep') {
    return { kind: 'search', title: 'Grep', hint: fields.pattern ?? firstLine(item) };
  }
  if (name === 'http' || name === 'fetch') {
    return { kind: 'globe', title: 'Fetch', hint: fields.url ?? firstLine(item) };
  }
  return { kind: 'file', title: name, hint: firstLine(item) };
}

function fieldsOf(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        out[key] = value;
      }
    }
    if (Object.keys(out).length > 0) {
      return out;
    }
  } catch {}
  const out: Record<string, string> = {};
  for (const key of ['path', 'pattern', 'command', 'url']) {
    const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`);
    const m = raw.match(re);
    if (m?.[1]) {
      out[key] = m[1];
    }
  }
  return out;
}

function firstLine(item: Extract<TranscriptActivity, { type: 'tool' }>): string {
  const source = stepInputText(item.call) || (item.result ? stepText(item.result) : '');
  const line = source.split('\n')[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.at(-1) ?? path;
}

export function toolCallName(
  item: Extract<TranscriptActivity, { type: 'tool' }>,
): string | undefined {
  if (isBuiltinStep(item.call) && item.call.type === 'tool_call') {
    return item.call.payload.name;
  }
  return undefined;
}
