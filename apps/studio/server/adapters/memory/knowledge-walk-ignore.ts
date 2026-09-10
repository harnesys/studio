import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { HOME_DIR_NAME, STUDIO_DIR_LEGACY } from '../../config/constants.ts';

export const SAFETY_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  HOME_DIR_NAME,
  STUDIO_DIR_LEGACY,
]);

export type SkipReason = 'gitignore' | 'harnesysignore' | 'binary_or_ext' | 'too_large' | 'safety';

export type GitIgnoreLayer = {
  relDir: string;
  ig: Ignore;
};

export function entrySkipReason(input: {
  name: string;
  uri: string;
  isDir: boolean;
  gitLayers: GitIgnoreLayer[];
  harnesysIg: Ignore | undefined;
}): SkipReason | undefined {
  if (SAFETY_NAMES.has(input.name)) {
    return 'safety';
  }
  if (ignoredByLayers(input.gitLayers, input.uri, input.isDir)) {
    return 'gitignore';
  }
  if (ignoredByRoot(input.harnesysIg, input.uri, input.isDir)) {
    return 'harnesysignore';
  }
  return undefined;
}

export async function initialGitLayers(
  absWorkspace: string,
  absRoot: string,
): Promise<GitIgnoreLayer[]> {
  const layers: GitIgnoreLayer[] = [];
  const rootIg = await loadIgnoreFile(join(absWorkspace, '.gitignore'));
  if (rootIg) {
    layers.push({ relDir: '', ig: rootIg });
  }
  const rootUri = normalizeUri(toPosix(relative(absWorkspace, absRoot)));
  if (rootUri === '') {
    return layers;
  }
  const parts = rootUri.split('/');
  let acc = '';
  for (const part of parts) {
    acc = acc === '' ? part : `${acc}/${part}`;
    const nested = await loadIgnoreFile(join(absWorkspace, acc, '.gitignore'));
    if (nested) {
      layers.push({ relDir: acc, ig: nested });
    }
  }
  return layers;
}

export async function loadIgnoreFile(absPath: string): Promise<Ignore | undefined> {
  const text = await readFile(absPath, 'utf8').catch(() => undefined);
  if (text === undefined) {
    return undefined;
  }
  return ignore().add(text);
}

export function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export function normalizeUri(uri: string): string {
  return uri === '.' ? '' : uri;
}

/** True when uri is exactly a root or nested under one (posix, no leading ./). */
export function uriUnderEnabledRoots(uri: string, roots: readonly string[]): boolean {
  const normalized = normalizeUri(toPosix(uri).replace(/^\.\//, ''));
  if (normalized === '') {
    return false;
  }
  for (const root of roots) {
    const r = normalizeUri(toPosix(root).replace(/^\.\//, ''));
    if (r === '') {
      return true;
    }
    if (normalized === r || normalized.startsWith(`${r}/`)) {
      return true;
    }
  }
  return false;
}

function ignoredByLayers(layers: GitIgnoreLayer[], uri: string, isDir: boolean): boolean {
  for (const layer of layers) {
    const pathname = pathForLayer(layer.relDir, uri, isDir);
    if (pathname !== undefined && layer.ig.ignores(pathname)) {
      return true;
    }
  }
  return false;
}

function ignoredByRoot(ig: Ignore | undefined, uri: string, isDir: boolean): boolean {
  if (!ig || uri === '') {
    return false;
  }
  return ig.ignores(isDir ? `${uri}/` : uri);
}

function pathForLayer(relDir: string, uri: string, isDir: boolean): string | undefined {
  let rel: string;
  if (relDir === '') {
    rel = uri;
  } else if (uri === relDir || uri.startsWith(`${relDir}/`)) {
    rel = uri === relDir ? '' : uri.slice(relDir.length + 1);
  } else {
    return undefined;
  }
  if (rel === '') {
    return undefined;
  }
  return isDir ? `${rel}/` : rel;
}
