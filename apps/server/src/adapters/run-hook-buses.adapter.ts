import { join } from 'node:path';
import type { WorkspaceFileEvent } from '@harnesys/studio-shared';
import type { HookBinding, HookEmitCtx, HookPayload, Logger, RunLifecycleStore } from 'harnesys';
import { createHookBus, type HookBus, matchesBinding } from 'harnesys';
import type { FilesWatcherInput } from '../domain/files-watcher.port.ts';
export type RunHookBusesDeps = {
  filesWatcher: FilesWatcherInput;
  lifecycle: RunLifecycleStore;
  logger?: Logger;
  renameThread?: (threadId: string, title: string) => void;
};
export type RunHookBusInput = {
  threadId: string;
  workspaceId: string;
  workspacePath: string;
  bindings: HookBinding[];
  binDirs: string[];
  permissionMode?: string;
};
type BusEntry = {
  bus: HookBus;
  bindings: HookBinding[];
  workspacePath: string;
  permissionMode: string;
  stopWatcher?: () => void;
};
export class RunHookBuses {
  private readonly entries = new Map<string, BusEntry>();
  constructor(private readonly deps: RunHookBusesDeps) {}
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
    if (!entry.bindings.some((b) => b.event === 'FileChanged' && matchesBinding(b, payload))) {
      return;
    }
    await entry.bus.emit('FileChanged', payload).catch(() => {});
  }
  private ctx(entry: BusEntry, threadId: string): HookEmitCtx {
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
function composeEnvBase(binDirs: string[]): Record<string, string> {
  if (binDirs.length === 0) {
    return {};
  }
  return { PATH: [...binDirs, process.env.PATH ?? ''].join(':') };
}
