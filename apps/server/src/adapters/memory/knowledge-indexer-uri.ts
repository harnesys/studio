import { access } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { trace } from '../../libs/trace.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { indexKnowledgeFile, upsertWalkEntry } from './knowledge-index-file.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import { collectKnowledgePaths, resolveUnderWorkspace, toPosix } from './knowledge-walk.ts';
import { normalizeUri, uriUnderEnabledRoots } from './knowledge-walk-ignore.ts';

export function normalizeEnqueueUri(workspacePath: string, raw: string): string | undefined {
  const trimmed = raw.trim().normalize('NFC');
  if (!trimmed) {
    return undefined;
  }
  try {
    const abs = resolveUnderWorkspace(workspacePath, trimmed);
    const rel = normalizeUri(toPosix(relative(resolve(workspacePath), abs))).normalize('NFC');
    return rel === '' ? undefined : rel;
  } catch {
    return undefined;
  }
}

export function filterEnqueueUris(
  workspacePath: string,
  uris: string[],
  roots: string[] | null,
): string[] {
  const out: string[] = [];
  for (const raw of uris) {
    const uri = normalizeEnqueueUri(workspacePath, raw);
    if (!uri) {
      continue;
    }
    if (roots && !uriUnderEnabledRoots(uri, roots)) {
      continue;
    }
    if (!out.includes(uri)) {
      out.push(uri);
    }
  }
  return out;
}

export async function indexOneUri(input: {
  repo: SqliteKnowledgeIndexRepo;
  workspaceId: string;
  workspacePath: string;
  uri: string;
  wantVector: boolean;
  embeddings: EmbeddingsPort | undefined;
  indexModeKey: string;
  signal?: AbortSignal;
}): Promise<void> {
  const absWorkspace = resolve(input.workspacePath);
  const abs = resolve(absWorkspace, input.uri);
  if (abs !== absWorkspace && !abs.startsWith(absWorkspace + sep)) {
    trace('knowledge-indexer', 'skip path outside workspace', { uri: input.uri });
    return;
  }

  const exists = await access(abs).then(
    () => true,
    () => false,
  );
  if (!exists) {
    input.repo.deleteUriPrefix(input.workspaceId, input.uri);
    return;
  }

  const entries = await collectKnowledgePaths(input.workspacePath, input.uri);
  const updatedAt = new Date().toISOString();
  if (entries.length === 0) {
    input.repo.deleteUriPrefix(input.workspaceId, input.uri);
    return;
  }
  for (const entry of entries) {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    upsertWalkEntry(input.repo, input.workspaceId, entry, updatedAt);
    if (entry.kind === 'index') {
      await indexKnowledgeFile({
        repo: input.repo,
        workspaceId: input.workspaceId,
        entry,
        wantVector: input.wantVector,
        embeddings: input.embeddings,
        updatedAt,
        indexModeKey: input.indexModeKey,
        signal: input.signal,
      });
    }
  }
}
