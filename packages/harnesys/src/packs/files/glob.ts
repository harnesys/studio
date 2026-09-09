import path from 'node:path';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { createSearchFilter } from '../../adapters/actions/path-blocklist.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';

export function globTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('glob', {
    group: 'files',
    description: 'Find files by glob pattern under the workdir.',
    operations: ['fs.read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: { pattern: { type: 'string' } },
      required: ['pattern'],
    },
    async execute(input, ctx) {
      const parsed = input as { pattern: string };
      const workdir = resolveWorkdirPath(ctx.cwd, '.', options.root);
      const hidden = await createSearchFilter(workdir, blocklist);
      const matches: string[] = [];
      for await (const match of new Bun.Glob(parsed.pattern).scan({
        cwd: workdir,
        onlyFiles: true,
      })) {
        const absolute = path.resolve(workdir, match);
        if (hidden(absolute)) {
          continue;
        }
        matches.push(match.split(path.sep).join('/'));
      }
      matches.sort((a, b) => a.localeCompare(b));
      return { pattern: parsed.pattern, matches };
    },
  });
}
