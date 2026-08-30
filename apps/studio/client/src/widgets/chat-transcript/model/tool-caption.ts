import type { SessionEvent } from '@studio/shared';

export type ToolCaption = {
  title: string;
  hint: string;
  kind: 'terminal' | 'file' | 'search' | 'globe' | 'pencil';
};

export function toolCaption(
  call: SessionEvent & { type: 'tool' },
  result?: SessionEvent & { type: 'tool' },
): ToolCaption {
  const name = call.name;
  const inputStr = toolInput(call);
  const outputStr = result ? toolOutput(result) : '';
  const fields = fieldsOf(inputStr || outputStr);
  if (name === 'shell') {
    return { kind: 'terminal', title: 'Terminal', hint: fields.command ?? firstLine(inputStr, outputStr) };
  }
  if (name === 'read_file') {
    return { kind: 'file', title: 'Read File', hint: baseName(fields.path ?? firstLine(inputStr, outputStr)) };
  }
  if (name === 'write_file') {
    return { kind: 'pencil', title: 'Write File', hint: baseName(fields.path ?? firstLine(inputStr, outputStr)) };
  }
  if (name === 'edit_file') {
    return { kind: 'pencil', title: 'Edit File', hint: baseName(fields.path ?? firstLine(inputStr, outputStr)) };
  }
  if (name === 'list_dir') {
    return { kind: 'file', title: 'List Dir', hint: fields.path ?? firstLine(inputStr, outputStr) };
  }
  if (name === 'glob') {
    return { kind: 'search', title: 'Glob', hint: fields.pattern ?? firstLine(inputStr, outputStr) };
  }
  if (name === 'grep') {
    return { kind: 'search', title: 'Grep', hint: fields.pattern ?? firstLine(inputStr, outputStr) };
  }
  if (name === 'http' || name === 'fetch') {
    return { kind: 'globe', title: 'Fetch', hint: fields.url ?? firstLine(inputStr, outputStr) };
  }
  return { kind: 'file', title: name, hint: firstLine(inputStr, outputStr) };
}

function toolInput(call: SessionEvent & { type: 'tool' }): string {
  const input = call.input;
  if (input == null) return '';
  return typeof input === 'string' ? input : JSON.stringify(input);
}

function toolOutput(result: SessionEvent & { type: 'tool' }): string {
  const output = result.output;
  if (output == null) return '';
  return typeof output === 'string' ? output : JSON.stringify(output);
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

function firstLine(input: string, output: string): string {
  const source = input || output;
  const line = source.split('\n')[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.at(-1) ?? path;
}
