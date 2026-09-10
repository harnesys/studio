import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { SQLITE_PRAGMAS } from '../../../config/constants.ts';
import * as schema from './schema/index.ts';

export type StudioDb = BunSQLiteDatabase<typeof schema>;

export { SQLITE_PRAGMAS };

export function createSqliteConnection(dbPath: string): StudioDb {
  if (dbPath !== ':memory:' && !dbPath.startsWith(':memory:')) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  for (const pragma of SQLITE_PRAGMAS) {
    sqlite.exec(pragma);
  }
  return drizzle(sqlite, { schema });
}
