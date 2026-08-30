import { createTwoFilesPatch } from 'diff';
import { tool } from '../../ports/tools.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { DEFAULT_PATH_BLOCKLIST } from './constants.ts';
import type { FilesOptions } from './files-options.ts';
import { firstBlockingPattern } from './path-blocklist.ts';
import { resolveWorkdirPath } from './path-resolve.ts';

export function editFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('edit_file', {
    group: 'files',
    description: 'Exact string replace in a file. Returns a unified diff.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    async execute(input, ctx) {
      const parsed = input as { path: string; old_string: string; new_string: string; replace_all?: boolean };
      const absolute = resolveWorkdirPath(ctx.cwd, parsed.path, options.root);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      const file = Bun.file(absolute);
      if (!(await file.exists())) throw new Error(`File not found: ${parsed.path}`);
      const previous = await file.text();
      const count = countOccurrences(previous, parsed.old_string);
      if (count === 0) throw new Error(`old_string not found in ${parsed.path}`);
      if (count > 1 && !parsed.replace_all) throw new Error(`old_string matched ${count} times; set replace_all or narrow context`);
      const next = parsed.replace_all
        ? previous.split(parsed.old_string).join(parsed.new_string)
        : previous.replace(parsed.old_string, parsed.new_string);
      await Bun.write(absolute, next);
      return {
        path: parsed.path,
        replacements: parsed.replace_all ? count : 1,
        diff: createTwoFilesPatch(parsed.path, parsed.path, previous, next, '', ''),
      };
    },
  });
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    count += 1;
    from = index + needle.length;
  }
  return count;
}
