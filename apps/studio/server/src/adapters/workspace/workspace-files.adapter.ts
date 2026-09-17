import type { Dirent } from 'node:fs';
import {
  cp,
  mkdir,
  readdir,
  readFile as readFileFs,
  rename as renameFs,
  rm,
  stat,
  writeFile as writeFileFs,
} from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { WorkspaceFileEntry } from '@harnesys/studio-shared';
import { SAFETY_NAMES } from '../../config/constants.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';

const MAX_TREE_ENTRIES = 20_000;

export class WorkspaceFilesAdapter implements WorkspaceFilesPort {
  async listDir(absPath: string): Promise<WorkspaceFileEntry[]> {
    let entries: Dirent[] = [];
    try {
      entries = (await readdir(absPath, {
        withFileTypes: true,
        encoding: 'utf8',
      })) as Dirent[];
    } catch {
      return [];
    }

    const results: WorkspaceFileEntry[] = [];

    for (const entry of entries) {
      const isDirectory = typeof entry.isDirectory === 'function' ? entry.isDirectory() : false;
      const kind: 'file' | 'dir' = isDirectory ? 'dir' : 'file';
      const name = String(entry.name);
      const entryPath = join(absPath, name);
      let size: number | undefined;
      let modifiedAt: string | undefined;

      try {
        const info = await stat(entryPath);
        modifiedAt = info.mtime.toISOString();
        if (!isDirectory) {
          size = info.size;
        }
      } catch {
        // skip stat failures
      }

      results.push({
        name,
        kind,
        path: name,
        ...(size !== undefined ? { size } : {}),
        ...(modifiedAt !== undefined ? { modifiedAt } : {}),
      });
    }

    // directories first, then files; alphabetical within each group
    results.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  async listTree(absRoot: string): Promise<WorkspaceFileEntry[]> {
    const results: WorkspaceFileEntry[] = [];
    await collectTree(absRoot, '', results);
    return results;
  }

  async createFile(absPath: string): Promise<void> {
    await mkdir(dirname(absPath), { recursive: true });
    await writeFileFs(absPath, '', { flag: 'wx' });
  }

  async createDir(absPath: string): Promise<void> {
    await mkdir(absPath, { recursive: true });
  }

  async delete(absPath: string): Promise<void> {
    await rm(absPath, { recursive: true, force: true });
  }

  async move(fromAbsPath: string, toAbsPath: string): Promise<void> {
    await mkdir(dirname(toAbsPath), { recursive: true });
    try {
      await renameFs(fromAbsPath, toAbsPath);
      return;
    } catch (err) {
      // rename across filesystems (bind mounts, different volumes) falls back to a copy.
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw err;
      }
    }
    await cp(fromAbsPath, toAbsPath, { recursive: true, errorOnExist: true, force: false });
    await rm(fromAbsPath, { recursive: true, force: true });
  }

  async stat(absPath: string): Promise<{ size: number; modifiedAt: string } | undefined> {
    try {
      const info = await stat(absPath);
      return { size: info.size, modifiedAt: info.mtime.toISOString() };
    } catch {
      return undefined;
    }
  }

  async readFile(absPath: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const bytes = new Uint8Array(await readFileFs(absPath));
    return { bytes, mimeType: mimeFromPath(absPath) };
  }

  async writeFile(absPath: string, content: string): Promise<void> {
    await mkdir(dirname(absPath), { recursive: true });
    await writeFileFs(absPath, content, 'utf8');
  }
}

async function collectTree(
  absRoot: string,
  relDir: string,
  results: WorkspaceFileEntry[],
): Promise<void> {
  if (results.length >= MAX_TREE_ENTRIES) {
    return;
  }
  const dirToRead = relDir ? join(absRoot, relDir) : absRoot;
  let dirents: Dirent[] = [];
  try {
    dirents = (await readdir(dirToRead, {
      withFileTypes: true,
      encoding: 'utf8',
    })) as Dirent[];
  } catch {
    return;
  }

  const batch: WorkspaceFileEntry[] = [];
  for (const entry of dirents) {
    const name = String(entry.name);
    if (SAFETY_NAMES.has(name)) {
      continue;
    }
    const isDirectory = typeof entry.isDirectory === 'function' ? entry.isDirectory() : false;
    const relPath = relDir ? `${relDir}/${name}` : name;
    const absPath = join(absRoot, relPath);
    let size: number | undefined;
    let modifiedAt: string | undefined;
    try {
      const info = await stat(absPath);
      modifiedAt = info.mtime.toISOString();
      if (!isDirectory) {
        size = info.size;
      }
    } catch {
      // skip stat failures
    }
    batch.push({
      name,
      kind: isDirectory ? 'dir' : 'file',
      path: relPath,
      ...(size !== undefined ? { size } : {}),
      ...(modifiedAt !== undefined ? { modifiedAt } : {}),
    });
  }

  batch.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const item of batch) {
    if (results.length >= MAX_TREE_ENTRIES) {
      return;
    }
    results.push(item);
    if (item.kind === 'dir') {
      await collectTree(absRoot, item.path, results);
    }
  }
}

function mimeFromPath(absPath: string): string {
  const ext = extname(absPath).toLowerCase();
  const map: Record<string, string> = {
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ts': 'text/typescript; charset=utf-8',
    '.tsx': 'text/typescript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.jsx': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.cjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.yaml': 'text/yaml; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.toml': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.py': 'text/x-python; charset=utf-8',
    '.rs': 'text/x-rust; charset=utf-8',
    '.go': 'text/x-go; charset=utf-8',
    '.sh': 'text/x-shellscript; charset=utf-8',
  };
  return map[ext] ?? 'application/octet-stream';
}
