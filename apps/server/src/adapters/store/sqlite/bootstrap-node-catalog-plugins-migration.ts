import { sql } from 'drizzle-orm';
import type { StudioDb } from './connection.ts';
import { pluginRowId } from './repos/sqlite-plugins.adapter.ts';

const MARKER = 'node_catalog_plugins_v1';
const CREATE_META = sql.raw(
  'CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
);
type LegacyPluginRow = {
  id: string;
  name: string;
  source: string;
  revision: string;
  path: string;
  data_path: string;
  format: string | null;
  ir_summary: string | null;
  grants: string;
  options: string;
  enabled_workspace_ids: string;
  registry_id: string | null;
  catalog_plugin_name: string | null;
  installed_at: string;
  updated_at: string;
};
type ApprovalRow = {
  plugin_name: string;
  server_id: string;
  approved_at: string;
};
export function migrateNodeCatalogPlugins(db: StudioDb): void {
  db.run(CREATE_META);
  const seen = db.all<{
    key: string;
  }>(sql`SELECT key FROM schema_meta WHERE key = ${MARKER}`);
  if (seen.length > 0) {
    return;
  }
  const cols = db.all<{
    name: string;
  }>(sql.raw('PRAGMA table_info(plugins)'));
  const hasWorkspaceId = cols.some((col) => col.name === 'workspace_id');
  const hasEnabled = cols.some((col) => col.name === 'enabled_workspace_ids');
  if (!hasEnabled && hasWorkspaceId) {
    db.run(sql`INSERT INTO schema_meta(key, value) VALUES (${MARKER}, '1')`);
    return;
  }
  const legacy = hasEnabled
    ? db.all<LegacyPluginRow>(sql`SELECT id, name, source, revision, path, data_path, format, ir_summary,
                   grants, options, enabled_workspace_ids, registry_id, catalog_plugin_name,
                   installed_at, updated_at
            FROM plugins`)
    : [];
  const approvals = db.all<ApprovalRow>(
    sql`SELECT plugin_name, server_id, approved_at FROM plugin_approvals`,
  );
  db.run(sql.raw('PRAGMA foreign_keys = OFF;'));
  db.run(
    sql.raw(`CREATE TABLE plugins_node_catalog (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      revision TEXT NOT NULL,
      path TEXT NOT NULL,
      data_path TEXT NOT NULL,
      format TEXT,
      ir_summary TEXT,
      grants TEXT NOT NULL DEFAULT '{}',
      options TEXT NOT NULL DEFAULT '{}',
      registry_id TEXT,
      catalog_plugin_name TEXT,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`),
  );
  db.run(
    sql.raw(`CREATE TABLE plugin_approvals_node_catalog (
      workspace_id TEXT NOT NULL,
      plugin_name TEXT NOT NULL,
      server_id TEXT NOT NULL,
      approved_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, plugin_name, server_id)
    );`),
  );
  for (const plugin of legacy) {
    const enabledIds = parseStringArray(plugin.enabled_workspace_ids);
    const grantsMap = parseGrantsMap(plugin.grants);
    for (const workspaceId of enabledIds) {
      const id = pluginRowId(workspaceId, plugin.name);
      const grants = JSON.stringify(grantsMap[workspaceId] ?? {});
      db.run(sql`INSERT OR IGNORE INTO plugins_node_catalog (
          id, workspace_id, name, source, revision, path, data_path, format, ir_summary,
          grants, options, registry_id, catalog_plugin_name, installed_at, updated_at
        ) VALUES (
          ${id}, ${workspaceId}, ${plugin.name}, ${plugin.source}, ${plugin.revision},
          ${plugin.path}, ${plugin.data_path}, ${plugin.format}, ${plugin.ir_summary},
          ${grants}, ${plugin.options}, ${plugin.registry_id}, ${plugin.catalog_plugin_name},
          ${plugin.installed_at}, ${plugin.updated_at}
        )`);
      for (const approval of approvals.filter((row) => row.plugin_name === plugin.name)) {
        db.run(sql`INSERT OR IGNORE INTO plugin_approvals_node_catalog (
            workspace_id, plugin_name, server_id, approved_at
          ) VALUES (
            ${workspaceId}, ${approval.plugin_name}, ${approval.server_id}, ${approval.approved_at}
          )`);
      }
    }
  }
  db.run(sql.raw('DROP TABLE plugins;'));
  db.run(sql.raw('ALTER TABLE plugins_node_catalog RENAME TO plugins;'));
  db.run(sql.raw('DROP TABLE plugin_approvals;'));
  db.run(sql.raw('ALTER TABLE plugin_approvals_node_catalog RENAME TO plugin_approvals;'));
  db.run(
    sql.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS plugins_workspace_id_name_unique ON plugins(workspace_id, name);',
    ),
  );
  db.run(sql.raw('PRAGMA foreign_keys = ON;'));
  db.run(sql`INSERT INTO schema_meta(key, value) VALUES (${MARKER}, '1')`);
}
function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}
function parseGrantsMap(raw: string): Record<string, Record<string, boolean>> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, Record<string, boolean>> = {};
    for (const [workspaceId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const grants: Record<string, boolean> = {};
      for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
        if (typeof enabled === 'boolean') {
          grants[key] = enabled;
        }
      }
      out[workspaceId] = grants;
    }
    return out;
  } catch {
    return {};
  }
}
