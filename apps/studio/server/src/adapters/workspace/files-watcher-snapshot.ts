import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import type { WorkspaceFileEvent, WorkspaceFileEventKind } from '@harnesys/studio-shared';

type SnapshotEntry = { kind: 'file' | 'dir'; mtimeMs: number | null };
export type DirSnapshot = Map<string, SnapshotEntry>;

export async function snapshot(dirPath: string, skipDirs: Set<string>): Promise<DirSnapshot> {
  const map: DirSnapshot = new Map();
  await walk(dirPath, '', map, skipDirs);
  return map;
}

async function walk(
  dir: string,
  rel: string,
  map: DirSnapshot,
  skipDirs: Set<string>,
): Promise<void> {
  let items: Dirent[] = [];
  try {
    items = (await readdir(dir, {
      withFileTypes: true,
      encoding: 'utf8',
    })) as Dirent[];
  } catch {
    return;
  }
  for (const item of items) {
    const name = String(item.name);
    if (skipDirs.has(name)) {
      continue;
    }
    const relPath = rel ? `${rel}/${name}` : name;
    const absPath = `${dir}/${name}`;
    if (item.isDirectory()) {
      map.set(relPath, { kind: 'dir', mtimeMs: null });
      await walk(absPath, relPath, map, skipDirs);
      continue;
    }
    const mtimeMs = await stat(absPath)
      .then((info) => info.mtimeMs)
      .catch(() => null);
    map.set(relPath, { kind: 'file', mtimeMs });
  }
}

export function diff(prev: DirSnapshot, curr: DirSnapshot): WorkspaceFileEvent[] {
  const events: WorkspaceFileEvent[] = [];

  for (const [relPath, entry] of curr) {
    const before = prev.get(relPath);
    if (!before) {
      events.push(eventFromPath('create', relPath));
      continue;
    }
    if (
      entry.kind === 'file' &&
      before.kind === 'file' &&
      entry.mtimeMs != null &&
      before.mtimeMs != null &&
      entry.mtimeMs !== before.mtimeMs
    ) {
      events.push(eventFromPath('change', relPath));
    }
  }

  for (const [relPath] of prev) {
    if (!curr.has(relPath)) {
      events.push(eventFromPath('delete', relPath));
    }
  }

  return events;
}

function eventFromPath(kind: WorkspaceFileEventKind, relPath: string): WorkspaceFileEvent {
  const lastSlash = relPath.lastIndexOf('/');
  return {
    kind,
    dir: lastSlash >= 0 ? relPath.slice(0, lastSlash) : '',
    name: lastSlash >= 0 ? relPath.slice(lastSlash + 1) : relPath,
  };
}
