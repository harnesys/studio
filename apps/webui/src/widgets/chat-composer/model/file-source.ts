import type { WorkspaceFileEntry } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useThreadEvents } from '@/features/desk';
import { listWorkspaceFilesTree, workspaceFilesTreeQueryKey } from '@/shared/api/files';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { isValidEntityRef } from './entity-kinds';

export type FileOptionSource = 'upload' | 'attachment' | 'workspace';
export type FileOption = { ref: string; source: FileOptionSource };

export type ComposerFileOptions = { options: FileOption[]; loading: boolean };

// Pending uploads first, then thread attachments, then workspace files.
export function useComposerFileOptions(
  threadId: string | null,
  pendingNames: string[],
): ComposerFileOptions {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const events = useThreadEvents(threadId);
  const tree = useQuery({
    queryKey: workspaceFilesTreeQueryKey(workspaceId ?? ''),
    queryFn: () => listWorkspaceFilesTree(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
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
    for (const path of filePathsFromTree(tree.data ?? [])) {
      push(path, 'workspace');
    }
    return next;
  }, [pendingNames, events, tree.data]);

  return { options, loading: tree.isPending };
}

function filePathsFromTree(entries: WorkspaceFileEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'file') {
      continue;
    }
    if (entry.path.split('/').some((segment) => segment.startsWith('.'))) {
      continue;
    }
    out.push(entry.path);
  }
  return out;
}
