import type { SessionEvent } from '@harnesys/studio-shared';

export type ToolCaption = {
  title: string;
  hint: string;
  kind: 'terminal' | 'file' | 'search' | 'globe' | 'pencil' | 'question';
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
    return {
      kind: 'terminal',
      title: 'Terminal',
      hint: fields.command ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'read_file') {
    return {
      kind: 'file',
      title: 'Read File',
      hint: baseName(fields.path ?? firstLine(inputStr, outputStr)),
    };
  }
  if (name === 'write_file') {
    return {
      kind: 'pencil',
      title: 'Write File',
      hint: baseName(fields.path ?? firstLine(inputStr, outputStr)),
    };
  }
  if (name === 'edit_file') {
    return {
      kind: 'pencil',
      title: 'Edit File',
      hint: baseName(fields.path ?? firstLine(inputStr, outputStr)),
    };
  }
  if (name === 'list_dir') {
    return { kind: 'file', title: 'List Dir', hint: fields.path ?? firstLine(inputStr, outputStr) };
  }
  if (name === 'glob') {
    return {
      kind: 'search',
      title: 'Glob',
      hint: fields.pattern ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'grep') {
    return {
      kind: 'search',
      title: 'Grep',
      hint: fields.pattern ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'http' || name === 'fetch') {
    return { kind: 'globe', title: 'Fetch', hint: fields.url ?? firstLine(inputStr, outputStr) };
  }
  if (name === 'ask_user') {
    return {
      kind: 'question',
      title: 'Question',
      hint: fields.prompt ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'load_skill') {
    return { kind: 'file', title: 'Skill', hint: fields.name ?? firstLine(inputStr, outputStr) };
  }
  if (name === 'graph_map') {
    const count = mapItemCount(inputStr, outputStr);
    return {
      kind: 'search',
      title: 'Graph Map',
      hint:
        count !== undefined
          ? `${count} item${count === 1 ? '' : 's'}`
          : firstLine(inputStr, outputStr),
    };
  }
  if (name === 'wait') {
    return {
      kind: 'question',
      title: 'Wait',
      hint: fields.delayMs ? `${fields.delayMs}ms` : firstLine(inputStr, outputStr),
    };
  }
  if (name === 'schedule_list') {
    return { kind: 'search', title: 'Schedules', hint: firstLine(inputStr, outputStr) };
  }
  if (name === 'thread_list') {
    return { kind: 'search', title: 'Threads', hint: firstLine(inputStr, outputStr) };
  }
  if (name === 'schedule_peek') {
    return {
      kind: 'search',
      title: 'Schedule Log',
      hint: fields.id ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'schedule_set') {
    return {
      kind: 'pencil',
      title: 'Schedule',
      hint: fields.name ?? fields.id ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'schedule_pause') {
    return {
      kind: 'pencil',
      title: 'Schedule Pause',
      hint: fields.id ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'schedule_delete') {
    return {
      kind: 'pencil',
      title: 'Schedule Delete',
      hint: fields.id ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'plan_save') {
    return {
      kind: 'pencil',
      title: 'Plan',
      hint: fields.overview ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'plan_item_update') {
    return {
      kind: 'pencil',
      title: 'Plan Item',
      hint: fields.itemId ?? fields.status ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'plan_get') {
    return { kind: 'search', title: 'Plan', hint: firstLine(inputStr, outputStr) };
  }
  if (name === 'webhook_list') {
    return { kind: 'globe', title: 'Webhooks', hint: firstLine(inputStr, outputStr) };
  }
  if (name === 'webhook_set') {
    return {
      kind: 'pencil',
      title: 'Webhook',
      hint: fields.name ?? fields.id ?? firstLine(inputStr, outputStr),
    };
  }
  if (name === 'webhook_delete') {
    return {
      kind: 'pencil',
      title: 'Webhook Delete',
      hint: fields.id ?? firstLine(inputStr, outputStr),
    };
  }
  return { kind: 'file', title: humanizeToolName(name), hint: firstLine(inputStr, outputStr) };
}

function toolInput(call: SessionEvent & { type: 'tool' }): string {
  const input = call.input;
  if (input != null) {
    return typeof input === 'string' ? input : JSON.stringify(input);
  }
  const delta = (call as { delta?: string }).delta;
  if (typeof delta === 'string' && delta) {
    return delta;
  }
  return '';
}

function toolOutput(result: SessionEvent & { type: 'tool' }): string {
  const output = result.output;
  if (output == null) {
    return '';
  }
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
      if (typeof value === 'string' || typeof value === 'number') {
        out[key] = String(value);
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

function mapItemCount(inputStr: string, outputStr: string): number | undefined {
  for (const raw of [outputStr, inputStr]) {
    if (!raw) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }
      const rec = parsed as Record<string, unknown>;
      if (typeof rec.count === 'number' && Number.isFinite(rec.count)) {
        return rec.count;
      }
      if (Array.isArray(rec.items)) {
        return rec.items.length;
      }
    } catch {}
  }
  return undefined;
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

function humanizeToolName(name: string): string {
  const words = name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : name;
}
