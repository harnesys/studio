import type { Database } from 'bun:sqlite';
import type { StudioDb } from '../store/sqlite/connection.ts';

/** Drizzle bun-sqlite client handle (not on public StudioDb type). */
export function sqliteClient(db: StudioDb): Database {
  return (db as StudioDb & { $client: Database }).$client;
}
