import path from 'node:path';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { DEFAULT_GREP_MAX_RESULTS, DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { createSearchFilter, type PathFilter } from '../../adapters/actions/path-blocklist.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';

export type GrepHit = { file: string; line: number; text: string };

export function grepTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('grep', {
    group: 'files',
    description: 'Search file contents with a regular expression.',
    operations: ['fs.read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
        glob: { type: 'string' },
        maxResults: { type: 'integer', minimum: 1 },
      },
      required: ['pattern'],
    },
    execute: (input, ctx) =>
      scanGrep(
        input as { pattern: string; path?: string; glob?: string; maxResults?: number },
        ctx,
        options,
        blocklist,
      ),
  });
}

async function scanGrep(
  parsed: { pattern: string; path?: string; glob?: string; maxResults?: number },
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
) {
  const regex = compilePattern(parsed.pattern);
  const workdir = resolveWorkdirPath(ctx.cwd, '.', options.root);
  const root = resolveWorkdirPath(ctx.cwd, parsed.path ?? '.', options.root);
  const hidden = await createSearchFilter(workdir, blocklist);
  const limit = parsed.maxResults ?? DEFAULT_GREP_MAX_RESULTS;
  const hits: GrepHit[] = [];
  for await (const match of new Bun.Glob(parsed.glob ?? '**/*').scan({
    cwd: root,
    onlyFiles: true,
  })) {
    if (hits.length >= limit) {
      break;
    }
    await scanFile({
      absolute: path.resolve(root, match),
      workdir,
      regex,
      hits,
      limit,
      signal: ctx.signal,
      hidden,
    });
  }
  return { pattern: parsed.pattern, matches: hits, truncated: hits.length >= limit };
}

function compilePattern(source: string): RegExp {
  try {
    return new RegExp(source);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'invalid regex');
  }
}

type ScanFileArgs = {
  absolute: string;
  workdir: string;
  regex: RegExp;
  hits: GrepHit[];
  limit: number;
  signal: AbortSignal | undefined;
  hidden: PathFilter;
};

async function scanFile(args: ScanFileArgs): Promise<void> {
  const { absolute, workdir, regex, hits, limit, signal, hidden } = args;
  if (signal?.aborted) {
    throw new Error('grep aborted');
  }
  if (hidden(absolute)) {
    return;
  }
  const text = await Bun.file(absolute)
    .text()
    .catch(() => undefined);
  if (text === undefined) {
    return;
  }
  collectHits({
    text,
    file: path.relative(workdir, absolute).split(path.sep).join('/'),
    regex,
    hits,
    limit,
  });
}

function collectHits(args: {
  text: string;
  file: string;
  regex: RegExp;
  hits: GrepHit[];
  limit: number;
}): void {
  const { text, file, regex, hits, limit } = args;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (hits.length >= limit) {
      return;
    }
    const line = lines[i] ?? '';
    if (regex.test(line)) {
      hits.push({ file, line: i + 1, text: line });
    }
    regex.lastIndex = 0;
  }
}
