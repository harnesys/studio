import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import type { Ignore } from 'ignore';
import { ValidationError } from '../../domain/studio.error.ts';
import {
  entrySkipReason,
  type GitIgnoreLayer,
  initialGitLayers,
  loadIgnoreFile,
  normalizeUri,
  type SkipReason,
  toPosix,
} from './knowledge-walk-ignore.ts';

export type { SkipReason } from './knowledge-walk-ignore.ts';
export { toPosix } from './knowledge-walk-ignore.ts';

const MAX_SIZE_BYTES = 2_000_000;

const TEXT_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.csv',
  '.rs',
  '.go',
  '.py',
  '.sh',
  '.sql',
]);

export type KnowledgePath =
  | { kind: 'index'; absPath: string; uri: string; sizeBytes: number; mtimeMs: number }
  | {
      kind: 'skip';
      absPath: string;
      uri: string;
      reason: SkipReason;
      sizeBytes?: number;
      mtimeMs?: number;
    };

export function resolveUnderWorkspace(workspacePath: string, rootPath: string): string {
  const absWorkspace = resolve(workspacePath);
  const abs = resolve(absWorkspace, rootPath);
  if (abs !== absWorkspace && !abs.startsWith(absWorkspace + sep)) {
    throw new ValidationError('knowledge root escapes workspace');
  }
  return abs;
}

/** Indexable absolute paths only (compat for sqlite-knowledge). */
export async function collectTextFiles(workspacePath: string, rootPath: string): Promise<string[]> {
  const entries = await collectKnowledgePaths(workspacePath, rootPath);
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'index') {
      out.push(entry.absPath);
    }
  }
  return out;
}

export async function collectKnowledgePaths(
  workspacePath: string,
  rootPath: string,
): Promise<KnowledgePath[]> {
  const absWorkspace = resolve(workspacePath);
  const absRoot = resolveUnderWorkspace(workspacePath, rootPath);
  const harnesysIg = await loadIgnoreFile(join(absWorkspace, '.harnesysignore'));
  const gitLayers = await initialGitLayers(absWorkspace, absRoot);

  const info = await stat(absRoot).catch(() => undefined);
  if (!info) {
    return [];
  }

  const rootUri = normalizeUri(toPosix(relative(absWorkspace, absRoot))).normalize('NFC');

  if (info.isFile()) {
    const fileUri = rootUri || basename(absRoot);
    const entry = await classifyFile({
      absPath: absRoot,
      uri: fileUri,
      gitLayers,
      harnesysIg,
    });
    return entry ? [entry] : [];
  }

  if (rootUri !== '') {
    const reason = entrySkipReason({
      name: basename(absRoot),
      uri: rootUri,
      isDir: true,
      gitLayers,
      harnesysIg,
    });
    if (reason) {
      return [{ kind: 'skip', absPath: absRoot, uri: rootUri, reason }];
    }
  }

  const out: KnowledgePath[] = [];
  await walkDir({
    absDir: absRoot,
    dirUri: rootUri,
    gitLayers,
    harnesysIg,
    out,
  });
  return out;
}

async function walkDir(input: {
  absDir: string;
  dirUri: string;
  gitLayers: GitIgnoreLayer[];
  harnesysIg: Ignore | undefined;
  out: KnowledgePath[];
}): Promise<void> {
  const entries = await readdir(input.absDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isFile()) {
      continue;
    }
    const absPath = join(input.absDir, entry.name);
    const rawUri = input.dirUri === '' ? entry.name : `${input.dirUri}/${entry.name}`;
    const uri = rawUri.normalize('NFC');
    const isDir = entry.isDirectory();
    const reason = entrySkipReason({
      name: entry.name,
      uri,
      isDir,
      gitLayers: input.gitLayers,
      harnesysIg: input.harnesysIg,
    });
    if (reason) {
      input.out.push({ kind: 'skip', absPath, uri, reason });
      continue;
    }
    if (isDir) {
      let childLayers = input.gitLayers;
      const nested = await loadIgnoreFile(join(absPath, '.gitignore'));
      if (nested) {
        childLayers = [...input.gitLayers, { relDir: uri, ig: nested }];
      }
      await walkDir({
        absDir: absPath,
        dirUri: uri,
        gitLayers: childLayers,
        harnesysIg: input.harnesysIg,
        out: input.out,
      });
      continue;
    }
    const classified = await classifyFile({
      absPath,
      uri,
      gitLayers: input.gitLayers,
      harnesysIg: input.harnesysIg,
    });
    if (classified) {
      input.out.push(classified);
    }
  }
}

async function classifyFile(input: {
  absPath: string;
  uri: string;
  gitLayers: GitIgnoreLayer[];
  harnesysIg: Ignore | undefined;
}): Promise<KnowledgePath | undefined> {
  const early = entrySkipReason({
    name: basename(input.absPath),
    uri: input.uri,
    isDir: false,
    gitLayers: input.gitLayers,
    harnesysIg: input.harnesysIg,
  });
  if (early) {
    return { kind: 'skip', absPath: input.absPath, uri: input.uri, reason: early };
  }
  const info = await stat(input.absPath).catch(() => undefined);
  if (!info) {
    return undefined;
  }
  const sizeBytes = info.size;
  const mtimeMs = info.mtimeMs;
  if (!TEXT_EXTS.has(extname(input.absPath).toLowerCase())) {
    return {
      kind: 'skip',
      absPath: input.absPath,
      uri: input.uri,
      reason: 'binary_or_ext',
      sizeBytes,
      mtimeMs,
    };
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    return {
      kind: 'skip',
      absPath: input.absPath,
      uri: input.uri,
      reason: 'too_large',
      sizeBytes,
      mtimeMs,
    };
  }
  return { kind: 'index', absPath: input.absPath, uri: input.uri, sizeBytes, mtimeMs };
}
