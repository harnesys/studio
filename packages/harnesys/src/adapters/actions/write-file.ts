import { mkdir } from 'fs/promises';
import path from 'path';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { DEFAULT_PATH_BLOCKLIST } from './constants.ts';
import type { FilesOptions } from './files-options.ts';
import { firstBlockingPattern } from './path-blocklist.ts';
import { resolveWorkdirPath } from './path-resolve.ts';

export function writeFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('write_file', {
    group: 'files',
    description: 'Write or create a text file under the workdir.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        overwrite: { type: 'boolean' },
      },
      required: ['path', 'content'],
    },
    async execute(input, ctx) {
      const parsed = input as { path: string; content: string; overwrite?: boolean };
      const absolute = resolveWorkdirPath(ctx.cwd, parsed.path, options.root);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      const file = Bun.file(absolute);
      const exists = await file.exists();
      if (exists && parsed.overwrite === false) {
        throw new Error(`File exists and overwrite is false: ${parsed.path}`);
      }
      await mkdir(path.dirname(absolute), { recursive: true });
      await Bun.write(absolute, parsed.content);
      return { path: parsed.path, bytes: parsed.content.length, created: !exists };
    },
  });
}
