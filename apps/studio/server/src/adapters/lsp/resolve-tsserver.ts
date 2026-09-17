import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Host-side `tsserver.js` for typescript-language-server when the workspace
 * has no local `typescript` install. Passed as `initializationOptions.tsserver.fallbackPath`.
 */
export function resolveTsserverJs(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve('typescript/lib/tsserver.js');
  } catch {
    // not resolvable from the Studio package graph
  }

  const managed = join(
    homedir(),
    '.harnesys',
    'tooling',
    'typescript',
    'node_modules',
    'typescript',
    'lib',
    'tsserver.js',
  );
  if (existsSync(managed)) {
    return managed;
  }

  const cacheRoot = join(homedir(), '.bun', 'install', 'cache');
  if (!existsSync(cacheRoot)) {
    return undefined;
  }
  let newestName: string | undefined;
  let newestPath: string | undefined;
  for (const name of readdirSync(cacheRoot)) {
    if (!name.startsWith('typescript@')) {
      continue;
    }
    const candidate = join(cacheRoot, name, 'lib', 'tsserver.js');
    if (!existsSync(candidate)) {
      continue;
    }
    if (newestName === undefined || name > newestName) {
      newestName = name;
      newestPath = candidate;
    }
  }
  return newestPath;
}
