import { FsAttachmentsAdapter } from '../adapters/attachments/fs-attachments.adapter.ts';
import { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import { WorkspaceAdapter } from '../adapters/workspace/workspace.adapter.ts';
import { WorkspaceFilesAdapter } from '../adapters/workspace/workspace-files.adapter.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';

export type StudioPlatformOptions = {
  workspace?: WorkspacePort;
  workspaceFiles?: WorkspaceFilesPort;
  attachments?: AttachmentsPort;
};

export type StudioPlatform = {
  workspace: WorkspacePort;
  workspaceFiles: WorkspaceFilesPort;
  filesWatcher: FilesWatcherAdapter;
  git: GitCliAdapter;
  deskEvents: DeskEventsAdapter;
  attachments: AttachmentsPort;
};

/** Host-wide FS/git/desk adapters. ModelsPort lives on each NodeRuntime. */
export function createStudioPlatform(options: StudioPlatformOptions = {}): StudioPlatform {
  return {
    workspace: options.workspace ?? new WorkspaceAdapter(),
    workspaceFiles: options.workspaceFiles ?? new WorkspaceFilesAdapter(),
    filesWatcher: new FilesWatcherAdapter(),
    git: new GitCliAdapter(),
    deskEvents: new DeskEventsAdapter(),
    attachments: options.attachments ?? new FsAttachmentsAdapter(),
  };
}
