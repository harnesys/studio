import { join } from 'node:path';
import type { WorkspaceFileEvent } from '@harnesys/studio-shared';
import type { HookBinding, HookEmitCtx, HookPayload, Logger, RunLifecycleStore } from 'harnesys';
import { createHookBus, type HookBus, matchesBinding } from 'harnesys';
import type { FilesWatcherInput } from '../domain/files-watcher.port.ts';

export type RunHookBusesDeps = {
  filesWatcher: FilesWatcherInput;
  /** Active run lookup for FileChanged payload identity (`run_id`). */
  lifecycle: RunLifecycleStore;
  /** Host sink for hook diagnostics (hook_failed/hook_timeout). */
  logger?: Logger;
  /** `{"sessionTitle": ...}` from a hook: rename the thread (spec §2.1). */
  renameThread?: (threadId: string, title: string) => void;
};

export type RunHookBusInput = {
  threadId: string;
  workspaceId: string;
  workspacePath: string;
  /** Full grant-filtered binding set (plugin + agent) for this run. */
  bindings: HookBinding[];
  binDirs: string[];
  /** Active run mode id; refreshed on every ensure (claim), not bus creation. */
  permissionMode?: string;
};

type BusEntry = {
  bus: HookBus;
  bindings: HookBinding[];
  workspacePath: string;
  permissionMode: string;
  stopWatcher?: () => void;
};

/**
 * Host-side handle on the run's hook bus for host-driven events: FileChanged
 * (workspace watcher) and Notification (monitors). The bus is created here
 * and carried to the engine via `RunTarget.hooksEmit`, so engine emits and
 * host emits share one instance — deferred effects drain in the session loop.
 * One bus per thread; segments reuse it; `close` on the run-finish desk event.
 */
export class RunHookBuses {
  private readonly entries = new Map<string, BusEntry>();

  constructor(private readonly deps: RunHookBusesDeps) {}

  /** Reuses the open bus for the thread; a new run segment keeps its effects. */
  ensure(input: RunHookBusInput): HookEmitCtx {
    const existing = this.entries.get(input.threadId);
    if (existing) {
      if (input.permissionMode !== undefined) {
        existing.permissionMode = input.permissionMode;
      }
      return this.ctx(existing, input.threadId);
    }
    const bus = createHookBus({
      bindings: input.bindings,
      ctx: {
        cwd: input.workspacePath,
        projectDir: input.workspacePath,
        envBase: composeEnvBase(input.binDirs),
        logger: this.deps.logger,
        renameSession: (title) => this.deps.renameThread?.(input.threadId, title),
      },
    });
    const entry: BusEntry = {
      bus,
      bindings: input.bindings,
      workspacePath: input.workspacePath,
      permissionMode: input.permissionMode ?? '',
    };
    if (input.bindings.some((binding) => binding.event === 'FileChanged')) {
      entry.stopWatcher = this.deps.filesWatcher.watch(
        input.workspaceId,
        input.workspacePath,
        (event) => {
          void this.fileChanged(input.threadId, event);
        },
      );
    }
    this.entries.set(input.threadId, entry);
    return this.ctx(entry, input.threadId);
  }

  /** Monitor stdout line → Notification on the thread's run bus. */
  emitNotification(threadId: string, text: string, type: string): void {
    this.entries.get(threadId)?.bus.emitNotification(text, type);
  }

  async close(threadId: string): Promise<void> {
    const entry = this.entries.get(threadId);
    if (entry === undefined) {
      return;
    }
    this.entries.delete(threadId);
    entry.stopWatcher?.();
    await entry.bus.close().catch(() => {});
  }

  private async fileChanged(threadId: string, event: WorkspaceFileEvent): Promise<void> {
    const entry = this.entries.get(threadId);
    if (entry === undefined) {
      return;
    }
    const active = await this.deps.lifecycle.activeByThread(threadId).catch(() => null);
    const payload: HookPayload = {
      event: 'FileChanged',
      session_id: threadId,
      run_id: active?.runId ?? '',
      agent_id: '',
      thread_id: threadId,
      cwd: entry.workspacePath,
      permission_mode: entry.permissionMode,
      file_path: join(entry.workspacePath, event.dir, event.name),
    };
    // Сеансовые матчеры решает matchers.ts (exact/CSV/regex по file_path) —
    // префильтр по basename терял regex-матчеры (план C1).
    if (!entry.bindings.some((b) => b.event === 'FileChanged' && matchesBinding(b, payload))) {
      return;
    }
    await entry.bus.emit('FileChanged', payload).catch(() => {});
  }

  private ctx(entry: BusEntry, threadId: string): HookEmitCtx {
    // Identity fields resolve per emit inside the graph (resolveHookCtx);
    // host emits fill them from the thread context directly.
    return {
      bus: entry.bus,
      sessionId: threadId,
      runId: '',
      agentId: '',
      threadId,
      cwd: entry.workspacePath,
      permissionMode: entry.permissionMode,
    };
  }
}

/** Run env base for hook processes: binDirs prepended to the process PATH. */
function composeEnvBase(binDirs: string[]): Record<string, string> {
  if (binDirs.length === 0) {
    return {};
  }
  return { PATH: [...binDirs, process.env.PATH ?? ''].join(':') };
}
