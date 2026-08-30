import type { WorkspaceFileEvent } from '../../../shared/types.ts';
import type { FilesWatcherInput } from '../../domain/files-watcher.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { trace } from '../../trace.ts';
import { FilesWatcherAdapter } from '../workspace/files-watcher.adapter.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type { KnowledgeIndexer } from './knowledge-indexer.ts';
import { uriUnderEnabledRoots } from './knowledge-walk-ignore.ts';

export type KnowledgeWatchBridgeOptions = {
  workspaces: WorkspaceRepository;
  indexRepo: SqliteKnowledgeIndexRepo;
  indexer: KnowledgeIndexer;
  listEnabledRoots: (workspaceId: string) => string[];
  filesWatcher?: FilesWatcherInput;
};

export class KnowledgeWatchBridge {
  private readonly filesWatcher: FilesWatcherInput;
  private readonly stops = new Map<string, () => void>();

  constructor(private readonly options: KnowledgeWatchBridgeOptions) {
    this.filesWatcher = options.filesWatcher ?? new FilesWatcherAdapter();
  }

  start(): void {
    for (const workspace of this.options.workspaces.list()) {
      const settings = this.options.indexRepo.getSettingsOrDefault(workspace.id);
      this.syncWatch(workspace.id, settings.watchEnabled);
    }
    // Periodic ensure for workspaces created after start (CreateWorkspaceUseCase doesn't call syncWatch)
    setInterval(() => this.ensureAllWatched(), 30_000).unref?.();
  }

  /** Ensure every workspace with watchEnabled has a watcher; fixes "new workspace not watched" */
  private ensureAllWatched(): void {
    for (const workspace of this.options.workspaces.list()) {
      const settings = this.options.indexRepo.getSettingsOrDefault(workspace.id);
      if (settings.watchEnabled && !this.stops.has(workspace.id)) {
        trace('knowledge-watch', 'ensure watch for new workspace', {
          workspaceId: workspace.id,
        });
        this.syncWatch(workspace.id, true);
      }
    }
  }

  syncWatch(workspaceId: string, watchEnabled: boolean): void {
    if (!watchEnabled) {
      this.stopWatch(workspaceId);
      return;
    }
    const workspace = this.options.workspaces.findById(workspaceId);
    if (!workspace) {
      this.stopWatch(workspaceId);
      return;
    }
    if (this.stops.has(workspaceId)) {
      return;
    }
    trace('knowledge-watch', 'watch started', {
      workspaceId,
      path: workspace.path,
    });
    const stop = this.filesWatcher.watch(workspaceId, workspace.path, (event) => {
      this.onFsEvent(workspaceId, event);
    });
    this.stops.set(workspaceId, stop);
  }

  stop(): void {
    for (const workspaceId of [...this.stops.keys()]) {
      this.stopWatch(workspaceId);
    }
  }

  private stopWatch(workspaceId: string): void {
    const stop = this.stops.get(workspaceId);
    if (!stop) {
      return;
    }
    stop();
    this.stops.delete(workspaceId);
  }

  private onFsEvent(workspaceId: string, event: WorkspaceFileEvent): void {
    const rel = event.dir ? `${event.dir}/${event.name}` : event.name;
    if (!rel) {
      return;
    }
    trace('knowledge-watch', 'fs event', {
      workspaceId,
      kind: event.kind,
      rel,
    });
    const settings = this.options.indexRepo.getSettingsOrDefault(workspaceId);
    if (!settings.watchEnabled) {
      trace('knowledge-watch', 'skip: watch disabled', { workspaceId, rel });
      return;
    }
    if (!settings.entireWorkspace) {
      const roots = this.options.listEnabledRoots(workspaceId);
      if (roots.length === 0 || !uriUnderEnabledRoots(rel, roots)) {
        trace('knowledge-watch', 'skip: outside roots', { workspaceId, rel });
        return;
      }
    }
    this.options.indexer.enqueuePaths(workspaceId, [rel]);
  }
}
