import type { Hono } from 'hono';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import { createStudioHost } from './create-host.ts';
import { createStudioPlatform } from './create-platform.ts';
import { createStudioStore } from './create-store.ts';
import { registerStudioHttp } from './register-http.ts';
import { createStudioMemory } from './wire-memory.ts';
import { wireRuntime } from './wire-runtime.ts';

export type StudioOptions = {
  db?: StudioDb;
  workspace?: WorkspacePort;
  workspaceFiles?: WorkspaceFilesPort;
  attachments?: AttachmentsPort;
  workspaceHarnesys?: WorkspaceHarnesysRegistry;
};

/** Composition root: store → platform → runtime → memory → host → http. */
export function createStudio(options: StudioOptions = {}): Hono {
  const store = createStudioStore(options);
  const platform = createStudioPlatform(options, store);
  const runtime = wireRuntime({
    db: store.db,
    threadRepo: store.threadRepo,
    agentRepo: store.agentRepo,
    deskEvents: platform.deskEvents,
    modelsPort: platform.modelsPort,
  });
  const memory = createStudioMemory(store.db, {
    providers: store.llmProviderRepo,
    models: store.llmModelRepo,
    workspaces: store.workspaceRepo,
    filesWatcher: platform.filesWatcher,
  });
  const host = createStudioHost({ store, platform, runtime, memory, options });
  return registerStudioHttp({ store, platform, runtime, memory, host });
}
