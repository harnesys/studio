import {
  BINARY_PROBE_BYTES,
  DEFAULT_MAX_READ_CHARS,
  DEFAULT_PATH_BLOCKLIST,
  DEFAULT_READ_LIMIT,
  MAX_READ_LINES,
} from '../../adapters/actions/constants.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

export type ReadFileOutput = {
  content: string;
  totalLines: number;
  truncated: boolean;
};

export function readFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('read_file', {
    group: 'files',
    description:
      'Read a text file with numbered lines. Omitting offset/limit returns the whole file when it fits, otherwise the first 400 lines. offset is the 1-based start line; limit is the max lines (capped at 2000). If truncated is true, more lines remain.',
    operations: ['fs.read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1 },
      },
      required: ['path'],
    },
    async execute(input, ctx) {
      const parsed = input as { path: string; offset?: number; limit?: number };
      const absolute = resolveWorkdirPath(ctx.cwd, parsed.path, options.root);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      const file = Bun.file(absolute);
      if (!(await file.exists())) {
        throw new Error(`File not found: ${parsed.path}`);
      }
      if (await isBinaryFile(file)) {
        throw new Error(`Binary file: ${parsed.path}`);
      }
      const offset = parsed.offset ?? 1;
      const limit = Math.min(parsed.limit ?? DEFAULT_READ_LIMIT, MAX_READ_LINES);
      return collectWindow(iterateLines(file), offset, limit);
    },
  });
}

export async function collectWindow(
  lines: AsyncIterable<string> | Iterable<string>,
  offset: number,
  limit: number,
  maxChars = DEFAULT_MAX_READ_CHARS,
): Promise<ReadFileOutput> {
  const kept: string[] = [];
  let chars = 0;
  let totalLines = 0;
  let full = false;
  for await (const line of lines) {
    totalLines += 1;
    if (full || totalLines < offset) {
      continue;
    }
    if (kept.length >= limit) {
      full = true;
      continue;
    }
    const numbered = `${totalLines}: ${line}`;
    const extra = kept.length === 0 ? numbered.length : numbered.length + 1;
    if (chars + extra > maxChars) {
      if (kept.length === 0) {
        kept.push(numbered.slice(0, maxChars));
      }
      full = true;
      continue;
    }
    kept.push(numbered);
    chars += extra;
  }
  return { content: kept.join('\n'), totalLines, truncated: full };
}

async function* iterateLines(file: Bun.BunFile): AsyncGenerator<string> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let pending = '';
  let saw = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      saw = true;
      pending += decoder.decode(chunk.value, { stream: true });
      const parts = pending.split('\n');
      pending = parts.pop() ?? '';
      for (const part of parts) {
        yield part;
      }
    }
    pending += decoder.decode();
    if (!saw) {
      yield '';
      return;
    }
    yield pending;
  } finally {
    reader.releaseLock();
  }
}

async function isBinaryFile(file: Bun.BunFile): Promise<boolean> {
  const probe = new Uint8Array(await file.slice(0, BINARY_PROBE_BYTES).arrayBuffer());
  for (let i = 0; i < probe.byteLength; i += 1) {
    if (probe[i] === 0) {
      return true;
    }
  }
  return false;
}
