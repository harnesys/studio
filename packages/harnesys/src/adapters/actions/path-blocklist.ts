import path from 'node:path';
import { loadGitignore } from './gitignore.ts';

export type PathFilter = (absolutePath: string) => boolean;

export function isPathBlocked(absolutePath: string, blocklist: readonly string[]): boolean {
  return firstBlockingPattern(absolutePath, blocklist) !== undefined;
}

export async function createSearchFilter(
  workdir: string,
  blocklist: readonly string[],
): Promise<PathFilter> {
  const ignore = await loadGitignore(workdir);
  return (absolutePath) => isPathBlocked(absolutePath, blocklist) || ignore.ignores(absolutePath);
}

export function firstBlockingPattern(
  absolutePath: string,
  blocklist: readonly string[],
): string | undefined {
  const normalized = path.resolve(absolutePath);
  for (const pattern of blocklist) {
    if (matchesPattern(normalized, pattern)) {
      return pattern;
    }
  }
  return undefined;
}

function matchesPattern(absolutePath: string, pattern: string): boolean {
  const trimmed = pattern.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const hasMagic = trimmed.includes('*') || trimmed.includes('?') || trimmed.includes('[');
  const hasSlash = trimmed.includes('/');
  if (!hasMagic && !hasSlash) {
    return absolutePath.split('/').includes(trimmed);
  }
  const relative = absolutePath.startsWith('/') ? absolutePath.slice(1) : absolutePath;
  return new Bun.Glob(trimmed).match(relative);
}
