import { bootstrap } from '../adapters/store/sqlite/bootstrap.ts';
import { createSqliteConnection, type StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import { SqliteAttachmentRepo } from '../adapters/store/sqlite/repos/sqlite-attachment.repo.ts';
import { SqliteLlmModelRepo } from '../adapters/store/sqlite/repos/sqlite-llm-model.repo.ts';
import { SqliteLlmProviderRepo } from '../adapters/store/sqlite/repos/sqlite-llm-provider.repo.ts';
import { SqliteModePresetRepo } from '../adapters/store/sqlite/repos/sqlite-mode-preset.repo.ts';
import { SqlitePluginRegistriesAdapter } from '../adapters/store/sqlite/repos/sqlite-plugin-registries.adapter.ts';
import { SqlitePluginsAdapter } from '../adapters/store/sqlite/repos/sqlite-plugins.adapter.ts';
import { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import { defaultHomePath, workspaceDbPath } from '../adapters/store/studio-layout.ts';
import { ValidationError } from '../domain/studio.error.ts';

export type StudioStoreOptions = {
  /** Absolute path to the sqlite file. Required unless `db` is injected. */
  dbPath?: string;
  /** Injected connection (tests / cutover helpers). Skips bootstrap. */
  db?: StudioDb;
  home?: string;
};

export type StudioStore = {
  home: string;
  dbPath: string;
  db: StudioDb;
  /** true when caller injected db (skip bootstrap and ticker side-effects). */
  externalDb: boolean;
  workspaceRepo: SqliteWorkspaceRepo;
  agentRepo: SqliteAgentRepo;
  llmProviderRepo: SqliteLlmProviderRepo;
  llmModelRepo: SqliteLlmModelRepo;
  modePresetRepo: SqliteModePresetRepo;
  scheduleRepo: SqliteScheduleRepo;
  webhookRepo: SqliteWebhookRepo;
  threadRepo: SqliteThreadRepo;
  attachmentRepo: SqliteAttachmentRepo;
  pluginRepo: SqlitePluginsAdapter;
  pluginRegistryRepo: SqlitePluginRegistriesAdapter;
};

/** Opens one domain sqlite (`workspace.db` or injected). No host catalog. */
export function createStudioStore(options: StudioStoreOptions = {}): StudioStore {
  const home = options.home ?? defaultHomePath();
  const externalDb = options.db !== undefined;
  const dbPath = options.dbPath ?? (externalDb ? ':memory:' : undefined);
  if (!dbPath) {
    throw new ValidationError('createStudioStore requires dbPath (or injected db)');
  }
  const db = options.db ?? createSqliteConnection(dbPath);
  if (!externalDb) {
    bootstrap(db);
  }

  return {
    home,
    dbPath,
    db,
    externalDb,
    workspaceRepo: new SqliteWorkspaceRepo(db),
    agentRepo: new SqliteAgentRepo(db),
    llmProviderRepo: new SqliteLlmProviderRepo(db),
    llmModelRepo: new SqliteLlmModelRepo(db),
    modePresetRepo: new SqliteModePresetRepo(db),
    scheduleRepo: new SqliteScheduleRepo(db),
    webhookRepo: new SqliteWebhookRepo(db),
    threadRepo: new SqliteThreadRepo(db),
    attachmentRepo: new SqliteAttachmentRepo(db),
    pluginRepo: new SqlitePluginsAdapter(db),
    pluginRegistryRepo: new SqlitePluginRegistriesAdapter(db),
  };
}

/** Convenience: store for a workspace folder path. */
export function createWorkspaceStore(workspacePath: string, home?: string): StudioStore {
  return createStudioStore({ dbPath: workspaceDbPath(workspacePath), home });
}
