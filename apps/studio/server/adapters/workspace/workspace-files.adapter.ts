import {
  mkdir,
  readdir,
  readFile as readFileFs,
  rm,
  stat,
  writeFile as writeFileFs,
} from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { WorkspaceFileEntry } from '../../../shared/types.ts';
import type { WorkspaceFilesPort } from '../../domain/workspace-files.port.ts';

export class WorkspaceFilesAdapter implements WorkspaceFilesPort {
  async listDir(absPath: string): Promise<WorkspaceFileEntry[]> {
    let entries: import('node:fs').Dirent[] = [];
    try {
      entries = (await readdir(absPath, {
        withFileTypes: true,
        encoding: 'utf8',
      })) as unknown as import('node:fs').Dirent[];
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
