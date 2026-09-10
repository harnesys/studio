import { fetch, files, shell } from '../adapters/actions';
import type { FilesOptions } from '../adapters/actions/files-options.ts';
import { definePack } from '../domain/pack.ts';
import type { ShellOptions } from './shell/shell.ts';

export type FilesPackSpec = {
  root?: string;
  blocklist?: string[];
};

export type ShellPackSpec = {
  timeout?: number;
  allowlist?: string[];
  blocklist?: string[];
};

function filesOptionsFromSpec(spec: Record<string, unknown>): FilesOptions {
  const root =
    typeof spec.root === 'string' && spec.root.trim() !== '' ? spec.root.trim() : undefined;
  const blocklist = stringList(spec.blocklist);
  return {
    ...(root !== undefined ? { root } : {}),
    ...(blocklist !== undefined ? { blocklist } : {}),
  };
}

function shellOptionsFromSpec(spec: Record<string, unknown>): ShellOptions {
  const timeout =
    typeof spec.timeout === 'number' && Number.isFinite(spec.timeout) ? spec.timeout : undefined;
  const allowlist = stringList(spec.allowlist);
  const blocklist = stringList(spec.blocklist);
  return {
    ...(timeout !== undefined ? { timeout } : {}),
    ...(allowlist !== undefined ? { allowlist } : {}),
    ...(blocklist !== undefined ? { blocklist } : {}),
  };
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );
  return list.length > 0 ? list : undefined;
}

export const filesCapability = definePack<Record<string, unknown>, FilesPackSpec>({
  name: 'files',
  version: '1.0.0',
  description: 'Workspace files: read_file / write_file / edit_file / list_dir / glob / grep',
  icon: 'files',
  specSchema: {
    type: 'object',
    properties: {
      root: { type: 'string' },
      blocklist: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
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
    hasSettings: true,
  },
  create: (ctx) => ({ tools: files(filesOptionsFromSpec(ctx.spec)) }),
});

export const shellCapability = definePack<Record<string, unknown>, ShellPackSpec>({
  name: 'shell',
  version: '1.0.0',
  description: 'Thread workdir shell command: shell',
  icon: 'shell',
  specSchema: {
    type: 'object',
    properties: {
      timeout: { type: 'number', minimum: 1, maximum: 600_000 },
      allowlist: { type: 'array', items: { type: 'string' } },
      blocklist: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  meta: {
    tools: [
      { name: 'shell', description: 'Run a shell command with cwd fixed to the thread workdir.' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({ tools: [shell(shellOptionsFromSpec(ctx.spec))] }),
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
