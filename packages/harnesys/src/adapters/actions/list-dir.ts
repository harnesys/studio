import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { DEFAULT_LIST_DIR_LIMIT, DEFAULT_PATH_BLOCKLIST } from './constants.ts';
import type { FilesOptions } from './files-options.ts';
import { createSearchFilter, type PathFilter } from './path-blocklist.ts';
import { resolveWorkdirPath } from './path-resolve.ts';

export type ListDirEntry = { name: string; type: 'file' | 'dir'; size: number };

export function listDirTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('list_dir', {
    group: 'files',
    description: 'List directory entries under the workdir.',
    operations: ['fs.read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        depth: { type: 'integer', minimum: 1 },
      },
    },
    async execute(input, ctx) {
      const parsed = input as { path?: string; depth?: number };
      const relative = parsed.path ?? '.';
      const depth = parsed.depth ?? 1;
      const absolute = resolveWorkdirPath(ctx.cwd, relative, options.root);
      const info = await stat(absolute).catch(() => {
        throw new Error(`Directory not found: ${relative}`);
      });
      if (!info.isDirectory()) {
        throw new Error(`Not a directory: ${relative}`);
      }
      const hidden = await createSearchFilter(
        resolveWorkdirPath(ctx.cwd, '.', options.root),
        blocklist,
      );
      const entries: ListDirEntry[] = [];
      await collect({
        absolute,
        relative: relative === '.' ? '' : relative,
        depth: 1,
        maxDepth: depth,
        out: entries,
        hidden,
      });
      return { path: relative, entries, truncated: entries.length >= DEFAULT_LIST_DIR_LIMIT };
    },
  });
}

type CollectArgs = {
  absolute: string;
  relative: string;
  depth: number;
  maxDepth: number;
  out: ListDirEntry[];
  hidden: PathFilter;
};

async function collect(args: CollectArgs): Promise<void> {
  const { absolute, relative, depth, maxDepth, out, hidden } = args;
  if (out.length >= DEFAULT_LIST_DIR_LIMIT) {
    return;
  }
  const names = await readdir(absolute);
  names.sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    if (out.length >= DEFAULT_LIST_DIR_LIMIT) {
      return;
    }
    const childAbs = path.join(absolute, name);
    if (hidden(childAbs)) {
      continue;
    }
    const childRel = relative.length === 0 ? name : `${relative}/${name}`;
    const info = await stat(childAbs);
    if (info.isDirectory()) {
      out.push({ name: childRel, type: 'dir', size: 0 });
      if (depth < maxDepth) {
        await collect({
          absolute: childAbs,
          relative: childRel,
          depth: depth + 1,
          maxDepth,
          out,
          hidden,
        });
      }
    } else {
      out.push({ name: childRel, type: 'file', size: info.size });
    }
  }
}
