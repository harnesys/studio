// biome-ignore-all lint/style/noExcessiveLinesPerFile: indexer owns queue + abort lifecycle, split would fragment cancel semantics

import { KNOWLEDGE_INDEX_SLOW_FILE_MS } from '../../config/constants.ts';
import type { KnowledgeIndexEventsPort } from '../../domain/knowledge-index-events.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { trace } from '../../libs/trace.ts';
import type { EmbeddingsPort, StudioEmbeddingsDeps } from './embeddings.ts';
import { embeddingsForSettings, knowledgeIndexModeKey } from './knowledge-embeddings.ts';
import { indexKnowledgeFile, upsertWalkEntry } from './knowledge-index-file.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type {
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
} from './knowledge-index-types.ts';
import { filterEnqueueUris, indexOneUri } from './knowledge-indexer-uri.ts';
import { collectKnowledgePaths, type KnowledgePath } from './knowledge-walk.ts';
import { uriUnderEnabledRoots } from './knowledge-walk-ignore.ts';

export type KnowledgeIndexerOptions = {
  resolveWorkspacePath: (workspaceId: string) => string | undefined;
  listEnabledRoots: (workspaceId: string) => string[];
  embeddings?: EmbeddingsPort;
  embeddingsDeps?: StudioEmbeddingsDeps;
  events?: KnowledgeIndexEventsPort;
};

type WorkspaceJob = {
  cancel: boolean;
  chain: Promise<void>;
  pendingUris: string[];
  busy: boolean;
  currentUri: string | null;
  controller?: AbortController;
};

export class KnowledgeIndexer {
  private readonly jobs = new Map<string, WorkspaceJob>();
  private embeddings: EmbeddingsPort | undefined;

  constructor(
    private readonly repo: SqliteKnowledgeIndexRepo,
    private readonly options: KnowledgeIndexerOptions,
  ) {
    this.embeddings = options.embeddings;
  }

  setEmbeddings(embeddings: EmbeddingsPort | undefined): void {
    this.embeddings = embeddings;
  }

  private resolveEmbeddings(
    workspaceId: string,
    settings: KnowledgeSettingsRecord,
  ): EmbeddingsPort | undefined {
    if (this.options.embeddingsDeps) {
      return embeddingsForSettings(this.options.embeddingsDeps, settings, workspaceId);
    }
    return this.embeddings;
  }

  getState(workspaceId: string): KnowledgeIndexStateRecord {
    const base = this.repo.getState(workspaceId);
    const job = this.jobs.get(workspaceId);
    if (job?.currentUri && base.status === 'running') {
      return { ...base, currentUri: job.currentUri } as KnowledgeIndexStateRecord;
    }
    return base;
  }

  private emitState(workspaceId: string): void {
    if (!this.options.events) {
      return;
    }
    this.options.events.emit(workspaceId, this.getState(workspaceId));
  }

  private upsertState(
    workspaceId: string,
    patch: KnowledgeIndexStatePatch,
  ): KnowledgeIndexStateRecord {
    const next = this.repo.upsertState(workspaceId, patch);
    this.options.events?.emit(workspaceId, next);
    return next;
  }

  private bumpProcessed(workspaceId: string): void {
    this.repo.bumpProcessed(workspaceId);
    this.emitState(workspaceId);
  }

  cancel(workspaceId: string): void {
    const job = this.ensureJob(workspaceId);
    job.cancel = true;
    job.currentUri = null;
    job.pendingUris.length = 0;
    job.controller?.abort();
    trace('knowledge-indexer', 'cancel requested', { workspaceId });
    // Optimistic transition so POST /index/cancel returns idle immediately
    const state = this.repo.getState(workspaceId);
    if (state.status === 'running') {
      const next = this.repo.upsertState(workspaceId, {
        status: 'idle',
        phase: null,
        lastError: 'cancelled',
        finishedAt: new Date().toISOString(),
      });
      this.options.events?.emit(workspaceId, next);
    }
  }

  /** Kick a full reindex; resolves when the job is accepted. */
  startFullReindex(workspaceId: string): Promise<void> {
    trace('knowledge-indexer', 'startFullReindex requested', { workspaceId });
    void this.enqueue(workspaceId, () => this.runFullReindex(workspaceId)).catch((err) => {
      trace('knowledge-indexer', 'reindex enqueue error (swallowed)', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return Promise.resolve();
  }

  /** Full reindex; resolves when finished. */
  reindexAndWait(workspaceId: string): Promise<void> {
    return this.enqueue(workspaceId, () => this.runFullReindex(workspaceId));
  }

  enqueuePaths(workspaceId: string, uris: string[]): void {
    if (uris.length === 0) {
      return;
    }
    const workspacePath = this.options.resolveWorkspacePath(workspaceId);
    if (!workspacePath) {
      trace('knowledge-indexer', 'enqueuePaths: no workspace path', { workspaceId });
      return;
    }
    const settings = this.repo.getSettingsOrDefault(workspaceId);
    const roots = settings.entireWorkspace ? null : this.options.listEnabledRoots(workspaceId);
    if (roots && roots.length === 0) {
      trace('knowledge-indexer', 'enqueuePaths: no enabled roots', { workspaceId });
      return;
    }
    const filtered = filterEnqueueUris(workspacePath, uris, roots);
    if (filtered.length === 0) {
      trace('knowledge-indexer', 'enqueuePaths: filtered empty', {
        workspaceId,
        uris,
      });
      return;
    }
    const job = this.ensureJob(workspaceId);
    let added = 0;
    for (const uri of filtered) {
      if (!job.pendingUris.includes(uri)) {
        job.pendingUris.push(uri);
        added += 1;
      }
    }
    trace('knowledge-indexer', 'enqueuePaths', {
      workspaceId,
      uris: filtered,
      added,
      pendingTotal: job.pendingUris.length,
      busy: job.busy,
    });
    void this.enqueue(workspaceId, () => this.drainIncremental(workspaceId));
  }

  private ensureJob(workspaceId: string): WorkspaceJob {
    let job = this.jobs.get(workspaceId);
    if (!job) {
      job = {
        cancel: false,
        chain: Promise.resolve(),
        pendingUris: [],
        busy: false,
        currentUri: null,
      };
      this.jobs.set(workspaceId, job);
    }
    return job;
  }

  private enqueue(workspaceId: string, work: () => Promise<void>): Promise<void> {
    const job = this.ensureJob(workspaceId);
    const run = job.chain.then(async () => {
      job.busy = true;
      job.cancel = false;
      job.currentUri = null;
      job.controller = new AbortController();
      try {
        await work();
        if (job.pendingUris.length > 0 && !job.cancel) {
          trace('knowledge-indexer', 'drain incremental after main job', {
            workspaceId,
            pending: job.pendingUris.length,
          });
          await this.drainIncremental(workspaceId, job.controller.signal);
        }
      } finally {
        job.busy = false;
        job.controller = undefined;
        job.currentUri = null;
      }
    });
    job.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runFullReindex(workspaceId: string): Promise<void> {
    const workspacePath = this.options.resolveWorkspacePath(workspaceId);
    if (!workspacePath) {
      throw new NotFoundError('workspace not found');
    }
    const settings = this.repo.getSettingsOrDefault(workspaceId);
    const wantVector = settings.backend === 'vector';
    const embeddings = this.resolveEmbeddings(workspaceId, settings);
    if (wantVector && !embeddings?.available()) {
      const message =
        'knowledge vector backend needs an embeddings model; use backend "fts" or configure embed model';
      this.upsertState(workspaceId, {
        status: 'error',
        phase: null,
        lastError: message,
        finishedAt: new Date().toISOString(),
      });
      throw new ValidationError(message);
    }

    const startedAt = new Date().toISOString();
    this.upsertState(workspaceId, {
      status: 'running',
      phase: 'scan',
      processed: 0,
      total: 0,
      lastError: null,
      startedAt,
      finishedAt: null,
    });

    const job = this.ensureJob(workspaceId);
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
      const roots = settings.entireWorkspace ? ['.'] : this.options.listEnabledRoots(workspaceId);
      if (!settings.entireWorkspace && roots.length === 0) {
        this.upsertState(workspaceId, {
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
      const indexable: Array<Extract<KnowledgePath, { kind: 'index' }>> = [];
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
          upsertWalkEntry(this.repo, workspaceId, entry, now);
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
      this.upsertState(workspaceId, { phase: 'index', total: indexable.length, processed: 0 });

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
        this.emitState(workspaceId);
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
            repo: this.repo,
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
        this.bumpProcessed(workspaceId);
      }

      if (!job.cancel && !signal?.aborted) {
        this.repo.deleteMissingFiles(workspaceId, seen);
        this.repo.deleteOrphanChunks(workspaceId, seen);
      }

      // If cancel already wrote idle/cancelled optimistically, keep it
      const cur = this.repo.getState(workspaceId);
      if (cur.status === 'running' || job.cancel || signal?.aborted) {
        this.upsertState(workspaceId, {
          status: 'idle',
          phase: null,
          lastError: job.cancel || signal?.aborted ? 'cancelled' : null,
          finishedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (isAbortError(err)) {
        trace('knowledge-indexer', 'runFullReindex aborted', { workspaceId });
        this.upsertState(workspaceId, {
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
      this.upsertState(workspaceId, {
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

  private async drainIncremental(workspaceId: string, signal?: AbortSignal): Promise<void> {
    const job = this.ensureJob(workspaceId);
    const workspacePath = this.options.resolveWorkspacePath(workspaceId);
    if (!workspacePath) {
      job.pendingUris.length = 0;
      return;
    }
    const settings = this.repo.getSettingsOrDefault(workspaceId);
    const wantVector = settings.backend === 'vector';
    const embeddings = this.resolveEmbeddings(workspaceId, settings);
    if (wantVector && !embeddings?.available()) {
      trace('knowledge-indexer', 'skip incremental: embeddings unavailable', { workspaceId });
      job.pendingUris.length = 0;
      return;
    }

    const roots = settings.entireWorkspace ? null : this.options.listEnabledRoots(workspaceId);
    const indexModeKey = knowledgeIndexModeKey(settings);

    // Make incremental visible in UI: promote to running state
    const cur = this.repo.getState(workspaceId);
    if (cur.status !== 'running') {
      // Use actual repo counts as base, not stale cur.total (which may be batch 1/1)
      const byStatus = this.repo.countFilesByStatus(workspaceId);
      const actualCurrentTotal = byStatus.indexed + byStatus.pending;
      // Estimate new total after batch: +new files, -deletes (quick heuristic: assume updates keep total)
      // We'll correct to exact count at the end, but set initial total to avoid 1/1 confusion
      let newTotal = actualCurrentTotal;
      const pendingSnapshot = [...job.pendingUris];
      for (const uri of pendingSnapshot) {
        const inDb = !!this.repo.getFile(workspaceId, uri);
        if (!inDb) {
          // Heuristic: new file if not in DB (create)
          newTotal += 1;
        }
        // Deletes will be accounted at the end via actual count; keep heuristic simple
      }
      const startProcessed = Math.max(0, newTotal - pendingSnapshot.length);
      this.upsertState(workspaceId, {
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
      // already running (full reindex), just update total
      this.upsertState(workspaceId, {
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
      this.emitState(workspaceId);
      trace('knowledge-indexer', 'incremental file start', { workspaceId, uri });
      const t0 = Date.now();
      try {
        await indexOneUri({
          repo: this.repo,
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
      this.bumpProcessed(workspaceId);
      processedInBatch += 1;
    }

    // Finish watch batch if no more pending and we were the ones who set running
    const after = this.repo.getState(workspaceId);
    if (after.status === 'running' && after.phase === 'watch' && job.pendingUris.length === 0) {
      if (!job.cancel && !signal?.aborted) {
        const byStatus = this.repo.countFilesByStatus(workspaceId);
        const actualTotal = byStatus.indexed + byStatus.pending;
        // Ensure final state shows overall totals, not 1/1 batch
        this.upsertState(workspaceId, {
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
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
