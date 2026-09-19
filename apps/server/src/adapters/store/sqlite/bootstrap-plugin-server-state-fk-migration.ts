import { sql } from 'drizzle-orm';
import type { StudioDb } from './connection.ts';
export function migratePluginServerStateFk(db: StudioDb): void {
  const master = db.all<{
    sql: string;
  }>(sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'plugin_server_state'`);
  const createSql = master[0]?.sql ?? '';
  if (createSql === '') {
    return;
  }
  if (createSql.includes('REFERENCES plugins(workspace_id, name)')) {
    return;
  }
  db.run(sql.raw('PRAGMA foreign_keys = OFF;'));
  db.run(
    sql.raw(`CREATE TABLE plugin_server_state_fk_migration (
      plugin_name TEXT NOT NULL,
      server_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      disabled_at TEXT NOT NULL,
      PRIMARY KEY (plugin_name, server_id, workspace_id),
      FOREIGN KEY (workspace_id, plugin_name) REFERENCES plugins(workspace_id, name) ON DELETE CASCADE
    );`),
  );
  db.run(
    sql.raw(`INSERT INTO plugin_server_state_fk_migration
      (plugin_name, server_id, workspace_id, disabled_at)
      SELECT plugin_name, server_id, workspace_id, disabled_at FROM plugin_server_state;`),
  );
  db.run(sql.raw('DROP TABLE plugin_server_state;'));
  db.run(sql.raw('ALTER TABLE plugin_server_state_fk_migration RENAME TO plugin_server_state;'));
  db.run(sql.raw('PRAGMA foreign_keys = ON;'));
}
