import { fetch, files, shell } from '../adapters/actions';

import { definePack } from '../domain/pack.ts';

export const filesCapability = definePack<Record<string, unknown>, Record<string, unknown>>({
  name: 'files',
  version: '1.0.0',
  description: 'Workspace files: read_file / write_file / edit_file / list_dir / glob / grep',
  icon: 'files',
  meta: {
    tools: [
      {
        name: 'read_file',
        description:
          'Read a text file with numbered lines. Omitting offset/limit returns the whole file when it fits, otherwise the first 400 lines. offset is the 1-based start line; limit is the max lines (capped at 2000). If truncated is true, more lines remain.',
      },
      { name: 'write_file', description: 'Write or create a text file under the workdir.' },
      { name: 'edit_file', description: 'Exact string replace in a file. Returns a unified diff.' },
      { name: 'list_dir', description: 'List directory entries under the workdir.' },
      { name: 'glob', description: 'Find files by glob pattern under the workdir.' },
      { name: 'grep', description: 'Search file contents with a regular expression.' },
    ],
    skills: [],
    hasSettings: false,
  },
  create: () => ({ tools: files() }),
});

export const shellCapability = definePack<Record<string, unknown>, Record<string, unknown>>({
  name: 'shell',
  version: '1.0.0',
  description: 'Thread workdir shell command: shell',
  icon: 'shell',
  meta: {
    tools: [
      { name: 'shell', description: 'Run a shell command with cwd fixed to the thread workdir.' },
    ],
    skills: [],
    hasSettings: false,
  },
  create: () => ({ tools: [shell()] }),
});

export const fetchCapability = definePack<Record<string, unknown>, Record<string, unknown>>({
  name: 'fetch',
  version: '1.0.0',
  description: 'HTTP requests: fetch',
  icon: 'fetch',
  meta: {
    tools: [
      {
        name: 'fetch',
        description: 'HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD). Only http/https URLs.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: () => ({ tools: [fetch()] }),
});
