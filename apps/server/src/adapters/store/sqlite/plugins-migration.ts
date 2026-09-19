import { sql } from 'drizzle-orm';
import { migrateTrustedPlugins } from '../../../application/plugins/migrate-trusted.ts';
import type { StudioDb } from './connection.ts';

/**
 * Plugins storage for grants: adds the format/ir_summary/grants/options
 * columns, carries the legacy `trusted` flag into the grants map and drops
 * the column via a table rebuild (SQLite has no DROP COLUMN pre-rebuild).
 */
export function migratePluginGrantsSchema(db: StudioDb): void {
  try {
    db.run(sql.raw('ALTER TABLE plugins ADD COLUMN registry_id text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE plugins ADD COLUMN catalog_plugin_name text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE plugins ADD COLUMN format text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE plugins ADD COLUMN ir_summary text;'));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE plugins ADD COLUMN grants text NOT NULL DEFAULT '{}';`));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE plugins ADD COLUMN options text NOT NULL DEFAULT '{}';`));
  } catch {}

  // trusted flag → grants map, then the column is dropped by the rebuild below.
  try {
    migrateTrustedPlugins(db);
  } catch {}

  // Drop plugins.trusted (SQLite requires table rebuild).
  try {
    const master = db.all<{ sql: string }>(
      sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'plugins'`,
    );
    const createSql = master[0]?.sql ?? '';
    if (createSql !== '' && createSql.includes('trusted')) {
      db.run(sql.raw('PRAGMA foreign_keys = OFF;'));
      db.run(
        sql.raw(`CREATE TABLE plugins_trusted_migration (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        revision TEXT NOT NULL,
        path TEXT NOT NULL,
        data_path TEXT NOT NULL,
        format TEXT,
        ir_summary TEXT,
        grants TEXT NOT NULL DEFAULT '{}',
        options TEXT NOT NULL DEFAULT '{}',
        enabled_workspace_ids TEXT NOT NULL DEFAULT '[]',
        registry_id TEXT,
        catalog_plugin_name TEXT,
        installed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`),
      );
      db.run(
        sql.raw(`INSERT INTO plugins_trusted_migration (
          id, name, source, revision, path, data_path, format, ir_summary,
          grants, options, enabled_workspace_ids, registry_id, catalog_plugin_name,
          installed_at, updated_at
        ) SELECT
          id, name, source, revision, path, data_path, format, ir_summary,
          grants, options, enabled_workspace_ids, registry_id, catalog_plugin_name,
          installed_at, updated_at
        FROM plugins;`),
      );
      db.run(sql.raw('DROP TABLE plugins;'));
      db.run(sql.raw('ALTER TABLE plugins_trusted_migration RENAME TO plugins;'));
      db.run(sql.raw('PRAGMA foreign_keys = ON;'));
    }
  } catch {}
}
