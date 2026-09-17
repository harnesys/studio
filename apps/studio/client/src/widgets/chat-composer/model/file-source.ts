import type { WorkspaceFileEntry } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useThreadEvents } from '@/features/desk';
import { listWorkspaceFiles } from '@/shared/api/files';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { isValidEntityRef } from './entity-kinds';

export type FileOptionSource = 'upload' | 'attachment' | 'workspace';
export type FileOption = { ref: string; source: FileOptionSource };

export type ComposerFileOptions = { options: FileOption[]; loading: boolean };

const MAX_FILES = 800;
const MAX_DEPTH = 8;
// Full ignore-file support comes later; these two always drown the list.
const SKIPPED_DIRS = new Set(['node_modules', '.git']);

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

// Pending uploads first, then thread attachments, then workspace files.
export function useComposerFileOptions(
  threadId: string | null,
  pendingNames: string[],
): ComposerFileOptions {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const events = useThreadEvents(threadId);
  const tree = useQuery({
    queryKey: ['workspaces', workspaceId, 'files-tree'],
    queryFn: () => listWorkspaceTree(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
  });

  const options = useMemo<FileOption[]>(() => {
    const seen = new Set<string>();
    const next: FileOption[] = [];
    const push = (ref: string, source: FileOptionSource) => {
      const key = `${source}:${ref}`;
      if (!ref || !isValidEntityRef('file', ref) || seen.has(key)) {
        return;
      }
      seen.add(key);
      next.push({ ref, source });
    };
    for (const name of pendingNames) {
      push(name, 'upload');
    }
    for (const event of events) {
      if (event.type !== 'user') {
        continue;
      }
      for (const attachment of event.attachments ?? []) {
        push(attachment.name, 'attachment');
      }
    }
    for (const path of tree.data ?? []) {
      push(path, 'workspace');
    }
    return next;
  }, [pendingNames, events, tree.data]);

  return { options, loading: tree.isPending };
}

async function listWorkspaceTree(workspaceId: string): Promise<string[]> {
  const paths: string[] = [];
  const dirs: { dir: string; depth: number }[] = [{ dir: '', depth: 0 }];
  while (dirs.length > 0 && paths.length < MAX_FILES) {
    const current = dirs.shift();
    if (!current || current.depth > MAX_DEPTH) {
      continue;
    }
    let entries: WorkspaceFileEntry[];
    try {
      entries = await listWorkspaceFiles(workspaceId, current.dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (paths.length >= MAX_FILES) {
        break;
      }
      const path = joinPath(current.dir, entry.name);
      if (entry.kind === 'dir') {
        if (!SKIPPED_DIRS.has(entry.name)) {
          dirs.push({ dir: path, depth: current.depth + 1 });
        }
      } else {
        paths.push(path);
      }
    }
  }
  return paths;
}
