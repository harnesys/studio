import { KNOWLEDGE_INDEX_SLOW_FILE_MS } from '../../config/constants.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { trace } from '../../libs/trace.ts';
import { knowledgeIndexModeKey } from './knowledge-embeddings.ts';
import { indexKnowledgeFile, upsertWalkEntry } from './knowledge-index-file.ts';
import { collectKnowledgePaths, type KnowledgePath } from './knowledge-walk.ts';
import { isAbortError, type KnowledgeIndexerHost } from './knowledge-indexer-shared.ts';

export async function runFullReindex(host: KnowledgeIndexerHost, workspaceId: string): Promise<void> {
  const workspacePath = host.options.resolveWorkspacePath(workspaceId);
  if (!workspacePath) {
    throw new NotFoundError('workspace not found');
  }
  const settings = host.repo.getSettingsOrDefault(workspaceId);
  const wantVector = settings.backend === 'vector';
  const embeddings = host.resolveEmbeddings(workspaceId, settings);
  if (wantVector && !embeddings?.available()) {
    const message =
      'knowledge vector backend needs an embeddings model; use backend "fts" or configure embed model';
    host.upsertState(workspaceId, {
      status: 'error',
      phase: null,
      lastError: message,
      finishedAt: new Date().toISOString(),
    });
    throw new ValidationError(message);
  }
  const startedAt = new Date().toISOString();
  host.upsertState(workspaceId, {
    status: 'running',
    phase: 'scan',
    processed: 0,
    total: 0,
    lastError: null,
    startedAt,
    finishedAt: null,
  });
  const job = host.ensureJob(workspaceId);
  const signal = job.controller?.signal;
  trace('knowledge-indexer', 'runFullReindex start', {
    workspaceId,
    backend: settings.backend,
    embedProvider: settings.embedProvider,
    embedModel: settings.embedModel,
    entireWorkspace: settings.entireWorkspace,
    wantVector,
    embeddingsAvailable: embeddings?.available() ?? false,
  });
  try {
    const roots = settings.entireWorkspace ? ['.'] : host.options.listEnabledRoots(workspaceId);
    if (!settings.entireWorkspace && roots.length === 0) {
      host.upsertState(workspaceId, {
        status: 'idle',
        phase: null,
        processed: 0,
        total: 0,
        lastError: null,
        finishedAt: new Date().toISOString(),
      });
      return;
    }
    const seen = new Set<string>();
    const indexable: Array<
      Extract<
        KnowledgePath,
        {
          kind: 'index';
        }
      >
    > = [];
    const indexModeKey = knowledgeIndexModeKey(settings);
    for (const root of roots) {
      if (job.cancel) {
        trace('knowledge-indexer', 'scan cancelled', { workspaceId, root });
        break;
      }
      const t0 = Date.now();
      const entries = await collectKnowledgePaths(workspacePath, root);
      const now = new Date().toISOString();
      let scannedIndex = 0;
      let scannedSkip = 0;
      for (const entry of entries) {
        seen.add(entry.uri);
        upsertWalkEntry(host.repo, workspaceId, entry, now);
        if (entry.kind === 'index') {
          indexable.push(entry);
          scannedIndex += 1;
        } else {
          scannedSkip += 1;
        }
      }
      trace('knowledge-indexer', 'scan root done', {
        workspaceId,
        root,
        entries: entries.length,
        indexable: scannedIndex,
        skipped: scannedSkip,
        elapsedMs: Date.now() - t0,
      });
    }
    trace('knowledge-indexer', 'scan phase done', {
      workspaceId,
      totalFiles: indexable.length,
      skippedParents: seen.size - indexable.length,
    });
    host.upsertState(workspaceId, { phase: 'index', total: indexable.length, processed: 0 });
    trace('knowledge-indexer', 'index phase start', {
      workspaceId,
      total: indexable.length,
    });
    for (let idx = 0; idx < indexable.length; idx += 1) {
      const entry = indexable[idx];
      if (!entry) {
        continue;
      }
      if (job.cancel || signal?.aborted) {
        trace('knowledge-indexer', 'index loop aborted', {
          workspaceId,
          processed: idx,
        });
        break;
      }
      job.currentUri = entry.uri;
      host.emitState(workspaceId);
      const fileStart = Date.now();
      trace('knowledge-indexer', 'index file start', {
        workspaceId,
        uri: entry.uri,
        sizeBytes: entry.sizeBytes,
        index: `${idx + 1}/${indexable.length}`,
      });
      let result: string;
      try {
        result = await indexKnowledgeFile({
          repo: host.repo,
          workspaceId,
          entry,
          wantVector,
          embeddings,
          updatedAt: new Date().toISOString(),
          indexModeKey,
          signal,
        });
      } catch (err) {
        if (isAbortError(err)) {
          trace('knowledge-indexer', 'index file aborted', {
            workspaceId,
            uri: entry.uri,
            elapsedMs: Date.now() - fileStart,
          });
          break;
        }
        throw err;
      }
      const elapsed = Date.now() - fileStart;
      trace('knowledge-indexer', 'index file done', {
        workspaceId,
        uri: entry.uri,
        result,
        elapsedMs: elapsed,
        slow:
          elapsed > KNOWLEDGE_INDEX_SLOW_FILE_MS
            ? 'SLOW (>5s) - check Ollama keep_alive / model load'
            : false,
      });
      job.currentUri = null;
      host.bumpProcessed(workspaceId);
    }
    if (!job.cancel && !signal?.aborted) {
      host.repo.deleteMissingFiles(workspaceId, seen);
      host.repo.deleteOrphanChunks(workspaceId, seen);
    }
    const cur = host.repo.getState(workspaceId);
    if (cur.status === 'running' || job.cancel || signal?.aborted) {
      host.upsertState(workspaceId, {
        status: 'idle',
        phase: null,
        lastError: job.cancel || signal?.aborted ? 'cancelled' : null,
        finishedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    if (isAbortError(err)) {
      trace('knowledge-indexer', 'runFullReindex aborted', { workspaceId });
      host.upsertState(workspaceId, {
        status: 'idle',
        phase: null,
        lastError: 'cancelled',
        finishedAt: new Date().toISOString(),
      });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    trace('knowledge-indexer', 'runFullReindex error', {
      workspaceId,
      error: message.slice(0, 500),
    });
    host.upsertState(workspaceId, {
      status: 'error',
      phase: null,
      lastError: message.slice(0, 500),
      finishedAt: new Date().toISOString(),
    });
    throw err;
  } finally {
    job.currentUri = null;
  }
}
