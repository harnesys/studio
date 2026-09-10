import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceFileEvent } from '@harnesys/studio-shared';
import { FILES_WATCHER_DEBOUNCE_MS } from '../../config/constants.ts';
import { trace } from '../../trace.ts';

type GitWatcherState = {
  gitWatcher: ReturnType<typeof watch> | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  listeners: Set<(event: WorkspaceFileEvent) => void>;
};

export async function startGitWatcher(
  state: GitWatcherState,
  workspaceId: string,
  workspacePath: string,
): Promise<void> {
  const gitPath = join(workspacePath, '.git');
  let target = gitPath;
  try {
    const info = await stat(gitPath);
    if (info.isFile()) {
      const content = await readFile(gitPath, 'utf8').catch(() => '');
      const m = content.match(/gitdir:\s*(.+)/);
      if (m?.[1]) {
        const gitdir = m[1].trim();
        target = gitdir.startsWith('/') ? gitdir : join(workspacePath, gitdir);
      }
    }
  } catch {
    return;
  }

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
