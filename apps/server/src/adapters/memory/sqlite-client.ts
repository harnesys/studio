import type { Database } from 'bun:sqlite';
import type { StudioDb } from '../store/sqlite/connection.ts';
export function sqliteClient(db: StudioDb): Database {
  return (
    db as StudioDb & {
      $client: Database;
    }
  ).$client;
}
