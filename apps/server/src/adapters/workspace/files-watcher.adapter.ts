import { type Dirent, watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceFileEntry, WorkspaceFileEvent } from '@harnesys/studio-shared';
import { FILES_WATCHER_DEBOUNCE_MS, SAFETY_NAMES } from '../../config/constants.ts';
import type { FilesWatcherInput } from '../../domain/files-watcher.port.ts';
import { trace } from '../../libs/trace.ts';
import { startGitWatcher } from './files-watcher-git.ts';
import { type DirSnapshot, diff, snapshot } from './files-watcher-snapshot.ts';

type Listener = (event: WorkspaceFileEvent) => void;
type WatchState = {
  workspacePath: string;
  listeners: Set<Listener>;
  snapshot: DirSnapshot;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  watcher: ReturnType<typeof watch> | null;
  gitWatcher: ReturnType<typeof watch> | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
};
export class FilesWatcherAdapter implements FilesWatcherInput {
  private readonly watchers = new Map<string, WatchState>();
  watch(
    workspaceId: string,
    workspacePath: string,
    onEvent: (event: WorkspaceFileEvent) => void,
  ): () => void {
    const state = this.watchers.get(workspaceId);
    if (state && state.workspacePath === workspacePath && !state.closed) {
      state.listeners.add(onEvent);
      trace('files-watcher', 'listener added', {
        workspaceId,
        listeners: state.listeners.size,
        workspacePath,
      });
      return () => this.removeListener(workspaceId, onEvent);
    }
    if (state) {
      this.closeState(workspaceId);
    }
    const newState: WatchState = {
      workspacePath,
      listeners: new Set([onEvent]),
      snapshot: new Map(),
      debounceTimer: null,
      watcher: null,
      gitWatcher: null,
      gitDebounceTimer: null,
      closed: false,
    };
    this.watchers.set(workspaceId, newState);
    void snapshot(workspacePath, SAFETY_NAMES)
      .then((snap) => {
        if (!newState.closed) {
          newState.snapshot = snap;
          trace('files-watcher', 'initial snapshot', {
            workspaceId,
            entries: snap.size,
          });
        }
      })
      .catch((err) => {
        trace('files-watcher', 'initial snapshot failed', {
          workspaceId,
          error: String(err),
        });
      });
    const handleChange = () => {
      if (newState.closed) {
        return;
      }
      if (newState.debounceTimer) {
        clearTimeout(newState.debounceTimer);
      }
      newState.debounceTimer = setTimeout(async () => {
        if (newState.closed) {
          return;
        }
        try {
          const nextSnapshot = await snapshot(workspacePath, SAFETY_NAMES);
          const events = diff(newState.snapshot, nextSnapshot);
          newState.snapshot = nextSnapshot;
          if (events.length > 0) {
            trace('files-watcher', 'diff events', {
              workspaceId,
              count: events.length,
              events: events.slice(0, 5),
            });
          }
          for (const ev of events) {
            for (const listener of [...newState.listeners]) {
              try {
                listener(ev);
              } catch (err) {
                trace('files-watcher', 'listener error', { error: String(err) });
              }
            }
          }
        } catch (err) {
          trace('files-watcher', 'diff error', { error: String(err) });
        }
      }, FILES_WATCHER_DEBOUNCE_MS);
    };
    try {
      const watcher = watch(workspacePath, { recursive: true }, (_eventType, filename) => {
        if (!filename) {
          return;
        }
        const parts = filename.split(/[/\\]/);
        if (parts.some((p) => SAFETY_NAMES.has(p))) {
          return;
        }
        handleChange();
      });
      watcher.on('error', (err) => {
        trace('files-watcher', 'fs.watch error', { workspaceId, error: String(err) });
      });
      newState.watcher = watcher;
      trace('files-watcher', 'watch started (shared)', {
        workspaceId,
        workspacePath,
      });
    } catch (err) {
      trace('files-watcher', 'watch failed to start', { workspaceId, error: String(err) });
    }
    void startGitWatcher(newState, workspaceId, workspacePath);
    return () => this.removeListener(workspaceId, onEvent);
  }
  private removeListener(workspaceId: string, onEvent: Listener): void {
    const state = this.watchers.get(workspaceId);
    if (!state) {
      return;
    }
    state.listeners.delete(onEvent);
    trace('files-watcher', 'listener removed', {
      workspaceId,
      remaining: state.listeners.size,
    });
    if (state.listeners.size === 0) {
      this.closeState(workspaceId);
    }
  }
  private closeState(workspaceId: string): void {
    const state = this.watchers.get(workspaceId);
    if (!state) {
      return;
    }
    state.closed = true;
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    if (state.gitDebounceTimer) {
      clearTimeout(state.gitDebounceTimer);
      state.gitDebounceTimer = null;
    }
    if (state.watcher) {
      try {
        state.watcher.close();
      } catch {}
    }
    if (state.gitWatcher) {
      try {
        state.gitWatcher.close();
      } catch {}
    }
    this.watchers.delete(workspaceId);
    trace('files-watcher', 'watch closed', { workspaceId });
  }
  async listTree(workspacePath: string): Promise<WorkspaceFileEntry[]> {
    const results: WorkspaceFileEntry[] = [];
    await this.collectEntries(workspacePath, '', results);
    return results;
  }
  private async collectEntries(
    absBase: string,
    relDir: string,
    results: WorkspaceFileEntry[],
  ): Promise<void> {
    const dirToRead = relDir ? join(absBase, relDir) : absBase;
    let dirents: Dirent[] = [];
    try {
      dirents = (await readdir(dirToRead, {
        withFileTypes: true,
        encoding: 'utf8',
      })) as Dirent[];
    } catch {
      return;
    }
    for (const d of dirents) {
      const name = String(d.name);
      if (SAFETY_NAMES.has(name)) {
        continue;
      }
      const relPath = relDir ? `${relDir}/${name}` : name;
      const isDir = d.isDirectory();
      results.push({
        name,
        kind: isDir ? 'dir' : 'file',
        path: relPath,
      });
      if (isDir) {
        await this.collectEntries(absBase, relPath, results);
      }
    }
  }
}
