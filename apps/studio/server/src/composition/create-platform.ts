import type { ModelsPort } from 'harnesys';
import { FsAttachmentsAdapter } from '../adapters/attachments/fs-attachments.adapter.ts';
import { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { createHarnesysModelsPort } from '../adapters/harnesys-models-port.ts';
import { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import { WorkspaceAdapter } from '../adapters/workspace/workspace.adapter.ts';
import { WorkspaceFilesAdapter } from '../adapters/workspace/workspace-files.adapter.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import type { StudioStore } from './create-store.ts';

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
  modelsPort: ModelsPort;
};

export function createStudioPlatform(
  options: StudioPlatformOptions,
  store: StudioStore,
): StudioPlatform {
  return {
    workspace: options.workspace ?? new WorkspaceAdapter(),
    workspaceFiles: options.workspaceFiles ?? new WorkspaceFilesAdapter(),
    filesWatcher: new FilesWatcherAdapter(),
    git: new GitCliAdapter(),
    deskEvents: new DeskEventsAdapter(),
    attachments: options.attachments ?? new FsAttachmentsAdapter(),
    modelsPort: createHarnesysModelsPort(store.llmProviderRepo, store.llmModelRepo),
  };
}
