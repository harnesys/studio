import { trace } from '../../libs/trace.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { embeddingsForSettings } from './knowledge-embeddings.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type {
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
} from './knowledge-index-types.ts';
import { runFullReindex } from './knowledge-indexer-full.ts';
import {
  isAbortError,
  type KnowledgeIndexerHost,
  type KnowledgeIndexerOptions,
  type WorkspaceJob,
} from './knowledge-indexer-shared.ts';
import { drainIncremental } from './knowledge-indexer-watch.ts';
import { filterEnqueueUris } from './knowledge-indexer-uri.ts';

export type { KnowledgeIndexerOptions } from './knowledge-indexer-shared.ts';

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
  startFullReindex(workspaceId: string): Promise<void> {
    trace('knowledge-indexer', 'startFullReindex requested', { workspaceId });
    void this.enqueue(workspaceId, () => runFullReindex(this.host, workspaceId)).catch((err) => {
      trace('knowledge-indexer', 'reindex enqueue error (swallowed)', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return Promise.resolve();
  }
  reindexAndWait(workspaceId: string): Promise<void> {
    return this.enqueue(workspaceId, () => runFullReindex(this.host, workspaceId));
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
    void this.enqueue(workspaceId, () => drainIncremental(this.host, workspaceId));
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
          await drainIncremental(this.host, workspaceId, job.controller.signal);
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
  private get host(): KnowledgeIndexerHost {
    return {
      repo: this.repo,
      options: this.options,
      resolveEmbeddings: (workspaceId, settings) => this.resolveEmbeddings(workspaceId, settings),
      ensureJob: (workspaceId) => this.ensureJob(workspaceId),
      upsertState: (workspaceId, patch) => this.upsertState(workspaceId, patch),
      emitState: (workspaceId) => this.emitState(workspaceId),
      bumpProcessed: (workspaceId) => this.bumpProcessed(workspaceId),
    };
  }
}
