import { sql } from 'drizzle-orm';
import type { StudioDb } from './connection.ts';

const MARKER = 'node_catalog_providers_v1';
const CREATE_META = sql.raw(
  'CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
);
type ProviderRow = {
  id: string;
  name: string;
  driver: string;
  api_url: string | null;
  api_key: string | null;
  headers: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};
type ModelRow = {
  id: string;
  provider_id: string;
  name: string;
  kind: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};
type AgentModelRow = {
  id: string;
  workspace_id: string;
  model_id: string | null;
};
export function migrateNodeCatalogProviders(db: StudioDb): void {
  db.run(CREATE_META);
  const seen = db.all<{
    key: string;
  }>(sql`SELECT key FROM schema_meta WHERE key = ${MARKER}`);
  if (seen.length > 0) {
    return;
  }
  const hasWorkspaceId = columnExists(db, 'llm_providers', 'workspace_id');
  if (!hasWorkspaceId) {
    try {
      db.run(sql.raw('ALTER TABLE llm_providers ADD COLUMN workspace_id text;'));
    } catch {}
  }
  const workspaceIds = db
    .all<{
      id: string;
    }>(sql`SELECT id FROM workspaces`)
    .map((row) => row.id);
  const unscoped =
    db.all<ProviderRow>(sql`SELECT id, name, driver, api_url, api_key, headers, enabled, created_at, updated_at
        FROM llm_providers
        WHERE workspace_id IS NULL OR workspace_id = ''`);
  if (unscoped.length > 0 && workspaceIds.length > 0) {
    const models = db.all<ModelRow>(
      sql`SELECT id, provider_id, name, kind, metadata, created_at, updated_at FROM llm_models`,
    );
    const modelsByProvider = new Map<string, ModelRow[]>();
    for (const model of models) {
      const list = modelsByProvider.get(model.provider_id) ?? [];
      list.push(model);
      modelsByProvider.set(model.provider_id, list);
    }
    const modelMap = new Map<string, Map<string, string>>();
    for (const workspaceId of workspaceIds) {
      for (const provider of unscoped) {
        const newProviderId = crypto.randomUUID();
        db.run(sql`INSERT INTO llm_providers (
            id, workspace_id, name, driver, api_url, api_key, headers, enabled, created_at, updated_at
          ) VALUES (
            ${newProviderId}, ${workspaceId}, ${provider.name}, ${provider.driver},
            ${provider.api_url}, ${provider.api_key}, ${provider.headers ?? '{}'},
            ${provider.enabled}, ${provider.created_at}, ${provider.updated_at}
          )`);
        for (const model of modelsByProvider.get(provider.id) ?? []) {
          const newModelId = crypto.randomUUID();
          db.run(sql`INSERT INTO llm_models (
              id, provider_id, name, kind, metadata, created_at, updated_at
            ) VALUES (
              ${newModelId}, ${newProviderId}, ${model.name}, ${model.kind},
              ${model.metadata ?? '{}'}, ${model.created_at}, ${model.updated_at}
            )`);
          const byWorkspace = modelMap.get(model.id) ?? new Map<string, string>();
          byWorkspace.set(workspaceId, newModelId);
          modelMap.set(model.id, byWorkspace);
        }
      }
    }
    const agents = db.all<AgentModelRow>(
      sql`SELECT id, workspace_id, model_id FROM agents WHERE model_id IS NOT NULL`,
    );
    for (const agent of agents) {
      if (!agent.model_id) {
        continue;
      }
      const nextId = modelMap.get(agent.model_id)?.get(agent.workspace_id);
      if (nextId) {
        db.run(sql`UPDATE agents SET model_id = ${nextId} WHERE id = ${agent.id}`);
      }
    }
    for (const provider of unscoped) {
      db.run(sql`DELETE FROM llm_models WHERE provider_id = ${provider.id}`);
      db.run(sql`DELETE FROM llm_providers WHERE id = ${provider.id}`);
    }
  } else if (unscoped.length > 0) {
    for (const provider of unscoped) {
      db.run(sql`DELETE FROM llm_models WHERE provider_id = ${provider.id}`);
      db.run(sql`DELETE FROM llm_providers WHERE id = ${provider.id}`);
    }
  }
  rebuildProvidersTable(db);
  db.run(sql.raw('DROP INDEX IF EXISTS llm_providers_name_unique;'));
  db.run(
    sql.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS llm_providers_workspace_id_name_unique ON llm_providers(workspace_id, name);',
    ),
  );
  db.run(sql`INSERT INTO schema_meta(key, value) VALUES (${MARKER}, '1')`);
}
function columnExists(db: StudioDb, table: string, column: string): boolean {
  const cols = db.all<{
    name: string;
  }>(sql.raw(`PRAGMA table_info(${table})`));
  return cols.some((col) => col.name === column);
}
function rebuildProvidersTable(db: StudioDb): void {
  const master = db.all<{
    sql: string;
  }>(sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'llm_providers'`);
  const createSql = master[0]?.sql ?? '';
  if (createSql === '' || createSql.includes('workspace_id TEXT NOT NULL')) {
    return;
  }
  db.run(sql.raw('PRAGMA foreign_keys = OFF;'));
  db.run(
    sql.raw(`CREATE TABLE llm_providers_node_catalog (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      driver TEXT NOT NULL,
      api_url TEXT,
      api_key TEXT,
      headers TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`),
  );
  db.run(
    sql.raw(`INSERT INTO llm_providers_node_catalog (
      id, workspace_id, name, driver, api_url, api_key, headers, enabled, created_at, updated_at
    ) SELECT
      id, workspace_id, name, driver, api_url, api_key,
      COALESCE(headers, '{}'), enabled, created_at, updated_at
    FROM llm_providers
    WHERE workspace_id IS NOT NULL AND workspace_id != '';`),
  );
  db.run(sql.raw('DROP TABLE llm_providers;'));
  db.run(sql.raw('ALTER TABLE llm_providers_node_catalog RENAME TO llm_providers;'));
  db.run(sql.raw('PRAGMA foreign_keys = ON;'));
}
