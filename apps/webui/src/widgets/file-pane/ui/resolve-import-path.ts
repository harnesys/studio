import { listWorkspaceFiles } from '@/shared/api/files';

const CODE_EXTS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.md',
] as const;
const resolveCache = new Map<string, string | null>();
export function dirnamePath(filePath: string): string {
  const i = filePath.lastIndexOf('/');
  if (i <= 0) {
    return '';
  }
  return filePath.slice(0, i);
}
export function basenamePath(filePath: string): string {
  const i = filePath.lastIndexOf('/');
  return i === -1 ? filePath : filePath.slice(i + 1);
}
export function resolveRelativePath(fromFile: string, spec: string): string {
  const base = dirnamePath(fromFile);
  const joined = base ? `${base}/${spec}` : spec;
  const parts = joined.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}
function hasFileExtension(path: string): boolean {
  const name = basenamePath(path);
  const dot = name.lastIndexOf('.');
  return dot > 0;
}
function preferredExt(fromFile: string): string | null {
  const name = basenamePath(fromFile);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return null;
  }
  return name.slice(dot);
}
export function expandImportCandidates(resolved: string, fromFile: string): string[] {
  if (hasFileExtension(resolved)) {
    return [resolved];
  }
  const preferred = preferredExt(fromFile);
  const exts = preferred
    ? [preferred, ...CODE_EXTS.filter((ext) => ext !== preferred)]
    : [...CODE_EXTS];
  const candidates: string[] = [];
  for (const ext of exts) {
    candidates.push(`${resolved}${ext}`);
  }
  for (const ext of exts) {
    candidates.push(`${resolved}/index${ext}`);
  }
  return candidates;
}
async function firstExistingFile(
  workspaceId: string,
  candidates: string[],
): Promise<string | null> {
  const dirs = new Map<string, string[]>();
  for (const candidate of candidates) {
    const dir = dirnamePath(candidate);
    const list = dirs.get(dir);
    if (list) {
      list.push(candidate);
    } else {
      dirs.set(dir, [candidate]);
    }
  }
  const existingByDir = new Map<string, Set<string>>();
  for (const dir of dirs.keys()) {
    try {
      const entries = await listWorkspaceFiles(workspaceId, dir);
      existingByDir.set(
        dir,
        new Set(entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name)),
      );
    } catch {
      existingByDir.set(dir, new Set());
    }
  }
  for (const candidate of candidates) {
    const names = existingByDir.get(dirnamePath(candidate));
    if (names?.has(basenamePath(candidate))) {
      return candidate;
    }
  }
  return null;
}
export async function resolveImportToWorkspacePath(
  workspaceId: string,
  fromFile: string,
  spec: string,
): Promise<string | null> {
  if (!(spec.startsWith('./') || spec.startsWith('../'))) {
    return null;
  }
  const cacheKey = `${workspaceId}\0${fromFile}\0${spec}`;
  if (resolveCache.has(cacheKey)) {
    return resolveCache.get(cacheKey) ?? null;
  }
  const resolved = resolveRelativePath(fromFile, spec);
  const candidates = expandImportCandidates(resolved, fromFile);
  const found = await firstExistingFile(workspaceId, candidates);
  if (found) {
    resolveCache.set(cacheKey, found);
  }
  return found;
}
export type ImportLinkMatch = {
  spec: string;
  startColumn: number;
  endColumn: number;
};
export function findRelativeImportSpecs(line: string): ImportLinkMatch[] {
  const matches: ImportLinkMatch[] = [];
  const re = /(['"])(\.\.?\/[^'"]*)\1/g;
  for (const match of line.matchAll(re)) {
    const spec = match[2];
    if (!spec || match.index === undefined) {
      continue;
    }
    matches.push({
      spec,
      startColumn: match.index + 1,
      endColumn: match.index + match[0].length + 1,
    });
  }
  return matches;
}
