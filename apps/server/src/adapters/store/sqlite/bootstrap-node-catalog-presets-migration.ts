import { sql } from 'drizzle-orm';
import type { StudioDb } from './connection.ts';
import { seedWorkspaceModePresets } from './seed-workspace-mode-presets.ts';

const MARKER = 'node_catalog_presets_v1';
const CREATE_META = sql.raw(
  'CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
);
type PresetRow = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  skills_json: string;
  packs_json: string;
  permissions_json: string;
  builtin: number;
  installed_by_default: number;
  created_at: string;
  updated_at: string;
};
export function migrateNodeCatalogPresets(db: StudioDb): void {
  db.run(CREATE_META);
  const seen = db.all<{
    key: string;
  }>(sql`SELECT key FROM schema_meta WHERE key = ${MARKER}`);
  if (seen.length > 0) {
    return;
  }
  ensureWorkspaceIdColumn(db);
  const workspaceIds = db
    .all<{
      id: string;
    }>(sql`SELECT id FROM workspaces`)
    .map((row) => row.id);
  const unscoped =
    db.all<PresetRow>(sql`SELECT id, name, description, instructions, skills_json, packs_json,
               permissions_json, builtin, installed_by_default, created_at, updated_at
        FROM mode_presets
        WHERE workspace_id IS NULL OR workspace_id = ''`);
  if (unscoped.length > 0 && workspaceIds.length > 0) {
    for (const workspaceId of workspaceIds) {
      for (const preset of unscoped) {
        db.run(sql`INSERT OR IGNORE INTO mode_presets (
            workspace_id, id, name, description, instructions, skills_json, packs_json,
            permissions_json, builtin, installed_by_default, created_at, updated_at
          ) VALUES (
            ${workspaceId}, ${preset.id}, ${preset.name}, ${preset.description},
            ${preset.instructions}, ${preset.skills_json}, ${preset.packs_json},
            ${preset.permissions_json}, ${preset.builtin}, ${preset.installed_by_default},
            ${preset.created_at}, ${preset.updated_at}
          )`);
      }
    }
    db.run(sql`DELETE FROM mode_presets WHERE workspace_id IS NULL OR workspace_id = ''`);
  } else if (unscoped.length > 0) {
    db.run(sql`DELETE FROM mode_presets WHERE workspace_id IS NULL OR workspace_id = ''`);
  }
  rebuildPresetsTable(db);
  for (const workspaceId of workspaceIds) {
    seedWorkspaceModePresets(db, workspaceId);
  }
  db.run(sql`INSERT INTO schema_meta(key, value) VALUES (${MARKER}, '1')`);
}
function ensureWorkspaceIdColumn(db: StudioDb): void {
  const cols = db.all<{
    name: string;
  }>(sql.raw('PRAGMA table_info(mode_presets)'));
  if (cols.some((col) => col.name === 'workspace_id')) {
    return;
  }
  try {
    db.run(sql.raw('ALTER TABLE mode_presets ADD COLUMN workspace_id text;'));
  } catch {}
}
function rebuildPresetsTable(db: StudioDb): void {
  const master = db.all<{
    sql: string;
  }>(sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mode_presets'`);
  const createSql = master[0]?.sql ?? '';
  if (
    createSql.includes('PRIMARY KEY(workspace_id, id)') ||
    createSql.includes('PRIMARY KEY (workspace_id, id)')
  ) {
    return;
  }
  db.run(sql.raw('PRAGMA foreign_keys = OFF;'));
  db.run(
    sql.raw(`CREATE TABLE mode_presets_node_catalog (
      workspace_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      skills_json TEXT NOT NULL DEFAULT '[]',
      packs_json TEXT NOT NULL DEFAULT '[]',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      builtin INTEGER NOT NULL DEFAULT 0,
      installed_by_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id)
    );`),
  );
  db.run(
    sql.raw(`INSERT INTO mode_presets_node_catalog (
      workspace_id, id, name, description, instructions, skills_json, packs_json,
      permissions_json, builtin, installed_by_default, created_at, updated_at
    ) SELECT
      workspace_id, id, name, description, instructions, skills_json, packs_json,
      permissions_json, builtin, installed_by_default, created_at, updated_at
    FROM mode_presets
    WHERE workspace_id IS NOT NULL AND workspace_id != '';`),
  );
  db.run(sql.raw('DROP TABLE mode_presets;'));
  db.run(sql.raw('ALTER TABLE mode_presets_node_catalog RENAME TO mode_presets;'));
  db.run(
    sql.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS mode_presets_workspace_id_name_unique ON mode_presets(workspace_id, name);',
    ),
  );
  db.run(sql.raw('PRAGMA foreign_keys = ON;'));
}
