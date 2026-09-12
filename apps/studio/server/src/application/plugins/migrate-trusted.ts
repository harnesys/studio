import { sql } from 'drizzle-orm';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import type { PluginGrants } from '../../domain/plugin.port.ts';

const FULL_GRANTS: PluginGrants = { content: true, process: true, network: true };

/**
 * One-time carry of the removed `plugins.trusted` flag into the grants map:
 * trusted rows grant all three classes on every known workspace, untrusted
 * rows keep the empty default. No-op once the rebuild drops the column.
 */
export function migrateTrustedPlugins(db: StudioDb): void {
  const master = db.all<{ sql: string }>(
    sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'plugins'`,
  );
  if (!(master[0]?.sql ?? '').includes('trusted')) {
    return;
  }
  const workspaces = db.all<{ id: string }>(sql`SELECT id FROM workspaces`);
  const trustedRows = db.all<{ name: string }>(sql`SELECT name FROM plugins WHERE trusted = 1`);
  if (trustedRows.length === 0) {
    return;
  }
  const grants = JSON.stringify(
    Object.fromEntries(workspaces.map((workspace) => [workspace.id, FULL_GRANTS])),
  );
  for (const row of trustedRows) {
    db.run(sql`UPDATE plugins SET grants = ${grants} WHERE name = ${row.name}`);
  }
}
