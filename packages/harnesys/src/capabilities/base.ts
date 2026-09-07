import { fetch, files, shell } from '../adapters/actions/index.ts';
import { defineCapability } from '../domain/capability.ts';

export const filesCapability = defineCapability<Record<string, never>>({
  name: 'files',
  version: '1.0.0',
  description: 'Workspace files: read_file / write_file / edit_file / list_dir / glob / grep',
  requires: [],
  configFrom: (def) => def.capabilities?.files,
  tools: () => files(),
  prompt: () => `## Retrieval
- A known path or exact string: read_file, grep, glob, list_dir.`,
});

export const shellCapability = defineCapability<Record<string, never>>({
  name: 'shell',
  version: '1.0.0',
  description: 'Thread workdir shell command: shell',
  requires: [],
  configFrom: (def) => def.capabilities?.shell,
  tools: () => [shell()],
  prompt: () => `## Workspace
- What changed since last session: git status, git diff, git log via shell.`,
});

export const fetchCapability = defineCapability<Record<string, never>>({
  name: 'fetch',
  version: '1.0.0',
  description: 'HTTP requests: fetch',
  requires: [],
  configFrom: (def) => def.capabilities?.fetch,
  tools: () => [fetch()],
  prompt: () => `## Network
- fetch: HTTP requests.`,
});
