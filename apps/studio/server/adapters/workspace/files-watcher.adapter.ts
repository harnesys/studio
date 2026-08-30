import { watch } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  WorkspaceFileEntry,
  WorkspaceFileEvent,
  WorkspaceFileEventKind,
} from '../../../shared/types.ts';
import { FILES_WATCHER_DEBOUNCE_MS, HOME_DIR_NAME } from '../../config/constants.ts';
import type { FilesWatcherInput } from '../../domain/files-watcher.port.ts';
import { trace } from '../../trace.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  HOME_DIR_NAME,
]);

type SnapshotEntry = { kind: 'file' | 'dir'; mtimeMs: number | null };
type DirSnapshot = Map<string, SnapshotEntry>;
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

    // If existing watch for same path, just add listener
    if (state && state.workspacePath === workspacePath && !state.closed) {
      state.listeners.add(onEvent);
      trace('files-watcher', 'listener added', {
        workspaceId,
        listeners: state.listeners.size,
        workspacePath,
      });
      return () => this.removeListener(workspaceId, onEvent);
    }

    // Different path or no state: restart
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

    // Initial snapshot
    void this.snapshot(workspacePath)
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
          const nextSnapshot = await this.snapshot(workspacePath);
          const events = this.diff(newState.snapshot, nextSnapshot);
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
        if (parts.some((p) => SKIP_DIRS.has(p))) {
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

    // git metadata watcher (reuses same debounce, no extra FS scan — just notifies listeners for git status)
    void this.startGitWatcher(newState, workspaceId, workspacePath);

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
      } catch {
        // ignore
      }
    }
    if (state.gitWatcher) {
      try {
        state.gitWatcher.close();
      } catch {
        // ignore
      }
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
    let dirents: import('node:fs').Dirent[] = [];
    try {
      dirents = (await readdir(dirToRead, {
        withFileTypes: true,
        encoding: 'utf8',
      })) as unknown as import('node:fs').Dirent[];
    } catch {
      return;
    }

    for (const d of dirents) {
      const name = String(d.name);
      if (SKIP_DIRS.has(name)) {
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

  private async snapshot(dirPath: string): Promise<DirSnapshot> {
    const map: DirSnapshot = new Map();
    await this.walk(dirPath, '', map);
    return map;
  }

  private async walk(dir: string, rel: string, map: DirSnapshot): Promise<void> {
    let items: import('node:fs').Dirent[] = [];
    try {
      items = (await readdir(dir, {
        withFileTypes: true,
        encoding: 'utf8',
      })) as unknown as import('node:fs').Dirent[];
    } catch {
      return;
    }
    for (const item of items) {
      const name = String(item.name);
      if (SKIP_DIRS.has(name)) {
        continue;
      }
      const relPath = rel ? `${rel}/${name}` : name;
      const absPath = `${dir}/${name}`;
      if (item.isDirectory()) {
        map.set(relPath, { kind: 'dir', mtimeMs: null });
        await this.walk(absPath, relPath, map);
        continue;
      }
      const mtimeMs = await stat(absPath)
        .then((info) => info.mtimeMs)
        .catch(() => null);
      map.set(relPath, { kind: 'file', mtimeMs });
    }
  }

  private diff(prev: DirSnapshot, curr: DirSnapshot): WorkspaceFileEvent[] {
    const events: WorkspaceFileEvent[] = [];

    for (const [relPath, entry] of curr) {
      const before = prev.get(relPath);
      if (!before) {
        events.push(eventFromPath('create', relPath));
        continue;
      }
      if (
        entry.kind === 'file' &&
        before.kind === 'file' &&
        entry.mtimeMs != null &&
        before.mtimeMs != null &&
        entry.mtimeMs !== before.mtimeMs
      ) {
        events.push(eventFromPath('change', relPath));
      }
    }

    for (const [relPath] of prev) {
      if (!curr.has(relPath)) {
        events.push(eventFromPath('delete', relPath));
      }
    }

    return events;
  }

  private async startGitWatcher(
    state: WatchState,
    workspaceId: string,
    workspacePath: string,
  ): Promise<void> {
    const gitPath = join(workspacePath, '.git');
    // .git may be file (worktree) or dir/bare
    let target = gitPath;
    try {
      const info = await stat(gitPath);
      if (info.isFile()) {
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(gitPath, 'utf8').catch(() => '');
        const m = content.match(/gitdir:\s*(.+)/);
        if (m?.[1]) {
          const gitdir = m[1].trim();
          target = gitdir.startsWith('/') ? gitdir : join(workspacePath, gitdir);
        }
      }
    } catch {
      // no .git — not a git repo, skip watcher
      return;
    }

    // watch HEAD, index, refs/heads via polling fallback + fs.watch if possible
    const handleGitChange = () => {
      if (state.closed) {
        return;
      }
      if (state.gitDebounceTimer) {
        clearTimeout(state.gitDebounceTimer);
      }
      state.gitDebounceTimer = setTimeout(() => {
        if (state.closed) {
          return;
        }
        trace('files-watcher', 'git change', { workspaceId });
        // synthetic event so client invalidates both files and git queries
        const ev: WorkspaceFileEvent = { kind: 'change', dir: '.git', name: 'HEAD' };
        for (const listener of [...state.listeners]) {
          try {
            listener(ev);
          } catch (err) {
            trace('files-watcher', 'git listener error', { error: String(err) });
          }
        }
      }, FILES_WATCHER_DEBOUNCE_MS);
    };

    try {
      const gitWatcher = watch(target, { recursive: true }, (_et, filename) => {
        if (!filename) {
          handleGitChange();
          return;
        }
        // only care about HEAD, index, refs
        if (
          filename === 'HEAD' ||
          filename === 'index' ||
          filename.startsWith('refs/heads') ||
          filename.startsWith('refs\\heads')
        ) {
          handleGitChange();
        }
      });
      gitWatcher.on('error', (err) => {
        trace('files-watcher', 'git watcher error', { workspaceId, error: String(err) });
      });
      state.gitWatcher = gitWatcher;
      trace('files-watcher', 'git watcher started', { workspaceId, target });
    } catch (err) {
      trace('files-watcher', 'git watcher failed', { workspaceId, error: String(err) });
    }
  }
}

function eventFromPath(kind: WorkspaceFileEventKind, relPath: string): WorkspaceFileEvent {
  const lastSlash = relPath.lastIndexOf('/');
  return {
    kind,
    dir: lastSlash >= 0 ? relPath.slice(0, lastSlash) : '',
    name: lastSlash >= 0 ? relPath.slice(lastSlash + 1) : relPath,
  };
}
