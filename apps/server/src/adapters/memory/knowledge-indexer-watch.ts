import { trace } from '../../libs/trace.ts';
import { knowledgeIndexModeKey } from './knowledge-embeddings.ts';
import { isAbortError, type KnowledgeIndexerHost } from './knowledge-indexer-shared.ts';
import { indexOneUri } from './knowledge-indexer-uri.ts';
import { uriUnderEnabledRoots } from './knowledge-walk-ignore.ts';

export async function drainIncremental(
  host: KnowledgeIndexerHost,
  workspaceId: string,
  signal?: AbortSignal,
): Promise<void> {
  const job = host.ensureJob(workspaceId);
  const workspacePath = host.options.resolveWorkspacePath(workspaceId);
  if (!workspacePath) {
    job.pendingUris.length = 0;
    return;
  }
  const settings = host.repo.getSettingsOrDefault(workspaceId);
  const wantVector = settings.backend === 'vector';
  const embeddings = host.resolveEmbeddings(workspaceId, settings);
  if (wantVector && !embeddings?.available()) {
    trace('knowledge-indexer', 'skip incremental: embeddings unavailable', { workspaceId });
    job.pendingUris.length = 0;
    return;
  }
  const roots = settings.entireWorkspace ? null : host.options.listEnabledRoots(workspaceId);
  const indexModeKey = knowledgeIndexModeKey(settings);
  const cur = host.repo.getState(workspaceId);
  if (cur.status !== 'running') {
    const byStatus = host.repo.countFilesByStatus(workspaceId);
    const actualCurrentTotal = byStatus.indexed + byStatus.pending;
    let newTotal = actualCurrentTotal;
    const pendingSnapshot = [...job.pendingUris];
    for (const uri of pendingSnapshot) {
      const inDb = !!host.repo.getFile(workspaceId, uri);
      if (!inDb) {
        newTotal += 1;
      }
    }
    const startProcessed = Math.max(0, newTotal - pendingSnapshot.length);
    host.upsertState(workspaceId, {
      status: 'running',
      phase: 'watch',
      total: newTotal,
      processed: startProcessed,
      lastError: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    trace('knowledge-indexer', 'drainIncremental start (visible)', {
      workspaceId,
      pending: pendingSnapshot.length,
      actualCurrentTotal,
      newTotal,
      startProcessed,
      backend: settings.backend,
    });
  } else {
    host.upsertState(workspaceId, {
      total: cur.total + job.pendingUris.length,
    });
  }
  let processedInBatch = 0;
  while (job.pendingUris.length > 0 && !job.cancel && !signal?.aborted) {
    const uri = job.pendingUris.shift();
    if (!uri) {
      continue;
    }
    if (roots && !uriUnderEnabledRoots(uri, roots)) {
      trace('knowledge-indexer', 'skip uri outside roots', { workspaceId, uri });
      continue;
    }
    job.currentUri = uri;
    host.emitState(workspaceId);
    trace('knowledge-indexer', 'incremental file start', { workspaceId, uri });
    const t0 = Date.now();
    try {
      await indexOneUri({
        repo: host.repo,
        workspaceId,
        workspacePath,
        uri,
        wantVector,
        embeddings,
        indexModeKey,
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) {
        trace('knowledge-indexer', 'incremental aborted', { workspaceId, uri });
        break;
      }
      throw err;
    }
    trace('knowledge-indexer', 'incremental file done', {
      workspaceId,
      uri,
      elapsedMs: Date.now() - t0,
    });
    job.currentUri = null;
    host.bumpProcessed(workspaceId);
    processedInBatch += 1;
  }
  const after = host.repo.getState(workspaceId);
  if (after.status === 'running' && after.phase === 'watch' && job.pendingUris.length === 0) {
    if (!job.cancel && !signal?.aborted) {
      const byStatus = host.repo.countFilesByStatus(workspaceId);
      const actualTotal = byStatus.indexed + byStatus.pending;
      host.upsertState(workspaceId, {
        status: 'idle',
        phase: null,
        total: actualTotal,
        processed: actualTotal,
        lastError: null,
        finishedAt: new Date().toISOString(),
      });
      trace('knowledge-indexer', 'drainIncremental idle', {
        workspaceId,
        processedInBatch,
        actualTotal,
      });
    }
  }
  job.currentUri = null;
}
