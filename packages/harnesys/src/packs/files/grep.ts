import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  BINARY_PROBE_BYTES,
  DEFAULT_GREP_MAX_CHARS,
  DEFAULT_GREP_MAX_RESULTS,
  DEFAULT_GREP_TIMEOUT_MS,
  DEFAULT_PATH_BLOCKLIST,
} from '../../adapters/actions/constants.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import {
  createSearchFilter,
  isWorkspaceMetaPath,
  type PathFilter,
} from '../../adapters/actions/path-blocklist.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';
import { clipGrepLine, resolveRipgrep, runRipgrep } from '../../adapters/actions/ripgrep.ts';
import { WORKSPACE_META_DIR } from '../../constants.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
export type GrepHit = {
  file: string;
  line: number;
  text: string;
};
type GrepInput = {
  pattern: string;
  path?: string;
  glob?: string;
  maxResults?: number;
};
type GrepOutput = {
  pattern: string;
  matches: GrepHit[];
  truncated: boolean;
};
type GrepScope = {
  workdir: string;
  root: string;
};
export function grepTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('grep', {
    group: 'files',
    description:
      'Search file contents with a regular expression. Respects .gitignore and the path blocklist; hidden files are included. Returns up to maxResults matches as {file, line, text}; lines longer than 2000 chars are clipped. truncated: true means more matches exist — narrow the search with path or glob.',
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
    execute: (input, ctx) => grep(input as GrepInput, ctx, options, blocklist),
  });
}
async function grep(
  parsed: GrepInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<GrepOutput> {
  compilePattern(parsed.pattern);
  const workdir = resolveWorkdirPath(ctx.cwd, '.', options.root);
  const root = resolveWorkdirPath(ctx.cwd, parsed.path ?? '.', options.root);
  if (!existsSync(root)) {
    throw new Error(`Path not found: ${parsed.path ?? '.'}`);
  }
  const rg = await resolveRipgrep(ctx.env);
  if (rg !== null) {
    try {
      return await runRipgrepEngine(parsed, ctx, { workdir, root }, blocklist);
    } catch (error) {
      if (!isSpawnMissingError(error)) {
        throw error;
      }
    }
  }
  return scanFallback(parsed, ctx, { workdir, root }, blocklist);
}
function isSpawnMissingError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT' &&
    error.message.includes('posix_spawn')
  );
}
async function runRipgrepEngine(
  parsed: GrepInput,
  ctx: ToolContext,
  scope: GrepScope,
  blocklist: readonly string[],
): Promise<GrepOutput> {
  const args = [
    '--json',
    '--no-config',
    '--no-messages',
    '--hidden',
    ...(parsed.glob === undefined || parsed.glob.length === 0 ? [] : [`--glob=${parsed.glob}`]),
    `--glob=!${WORKSPACE_META_DIR}/**`,
    ...blocklist.flatMap((entry) => {
      const trimmed = entry.trim();
      return trimmed.length === 0 ? [] : [`--glob=!${trimmed}`];
    }),
    '--',
    parsed.pattern,
    scope.root,
  ];
  const run = await runRipgrep(args, {
    cwd: scope.workdir,
    env: ctx.env,
    limit: parsed.maxResults ?? DEFAULT_GREP_MAX_RESULTS,
    timeoutMs: DEFAULT_GREP_TIMEOUT_MS,
    signal: ctx.signal,
  });
  if (run.timedOut && run.rows.length === 0) {
    throw new Error(
      `grep timed out after ${DEFAULT_GREP_TIMEOUT_MS}ms. Narrow the search with a more specific path or glob.`,
    );
  }
  return {
    pattern: parsed.pattern,
    matches: run.rows.map((row) => toHit(row, scope.workdir)),
    truncated: run.truncated,
  };
}
function toHit(
  row: {
    file: string;
    line: number;
    text: string;
  },
  workdir: string,
): GrepHit {
  const absolute = path.resolve(workdir, row.file);
  return {
    file: path.relative(workdir, absolute).split(path.sep).join('/'),
    line: row.line,
    text: row.text,
  };
}
function compilePattern(source: string): RegExp {
  try {
    return new RegExp(source);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'invalid regex');
  }
}
async function scanFallback(
  parsed: GrepInput,
  ctx: ToolContext,
  scope: GrepScope,
  blocklist: readonly string[],
): Promise<GrepOutput> {
  const regex = compilePattern(parsed.pattern);
  const hidden = await createSearchFilter(scope.workdir, blocklist);
  const limit = parsed.maxResults ?? DEFAULT_GREP_MAX_RESULTS;
  const hits: GrepHit[] = [];
  const budget = { chars: 0 };
  let truncated = false;
  for await (const match of new Bun.Glob(parsed.glob ?? '**/*').scan({
    cwd: scope.root,
    onlyFiles: true,
    dot: true,
  })) {
    const stopped = await scanFile({
      absolute: path.resolve(scope.root, match),
      workdir: scope.workdir,
      regex,
      hits,
      limit,
      budget,
      signal: ctx.signal,
      hidden,
    });
    if (stopped) {
      truncated = true;
      break;
    }
  }
  return { pattern: parsed.pattern, matches: hits, truncated };
}
type ScanFileArgs = {
  absolute: string;
  workdir: string;
  regex: RegExp;
  hits: GrepHit[];
  limit: number;
  budget: {
    chars: number;
  };
  signal: AbortSignal | undefined;
  hidden: PathFilter;
};
async function scanFile(args: ScanFileArgs): Promise<boolean> {
  const { absolute, workdir, signal, hidden } = args;
  if (signal?.aborted) {
    throw new Error('grep aborted');
  }
  if (isWorkspaceMetaPath(workdir, absolute) || hidden(absolute)) {
    return false;
  }
  if (await isBinaryFile(absolute)) {
    return false;
  }
  const text = await Bun.file(absolute)
    .text()
    .catch(() => undefined);
  if (text === undefined) {
    return false;
  }
  return collectHits({
    text,
    file: path.relative(workdir, absolute).split(path.sep).join('/'),
    regex: args.regex,
    hits: args.hits,
    limit: args.limit,
    budget: args.budget,
  });
}
function collectHits(args: {
  text: string;
  file: string;
  regex: RegExp;
  hits: GrepHit[];
  limit: number;
  budget: {
    chars: number;
  };
}): boolean {
  const { text, file, regex, hits, limit, budget } = args;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (hits.length >= limit || budget.chars >= DEFAULT_GREP_MAX_CHARS) {
      return true;
    }
    const line = lines[i] ?? '';
    if (line.includes('\0')) {
      continue;
    }
    if (regex.test(line)) {
      const clipped = clipGrepLine(line);
      hits.push({ file, line: i + 1, text: clipped });
      budget.chars += clipped.length + file.length + 16;
    }
    regex.lastIndex = 0;
  }
  return false;
}
async function isBinaryFile(absolute: string): Promise<boolean> {
  const probe = new Uint8Array(
    await Bun.file(absolute).slice(0, BINARY_PROBE_BYTES).arrayBuffer().catch(makeEmptyBuffer),
  );
  for (let i = 0; i < probe.byteLength; i += 1) {
    if (probe[i] === 0) {
      return true;
    }
  }
  return false;
}
function makeEmptyBuffer(): ArrayBuffer {
  return new ArrayBuffer(0);
}
