import { SQLiteError } from 'bun:sqlite';
import { ConflictError, NotFoundError, ValidationError } from '../../../domain/studio.error.ts';

export type SqliteErrorHints = {
  conflict?: string;
  notFound?: string;
  invalid?: string;
};

export function mapSqliteError(err: unknown, hints: SqliteErrorHints = {}): never {
  if (err instanceof SQLiteError) {
    switch (err.code) {
      case 'SQLITE_CONSTRAINT_UNIQUE':
        throw new ConflictError(hints.conflict ?? 'conflict');
      case 'SQLITE_CONSTRAINT_FOREIGNKEY':
        throw new NotFoundError(hints.notFound ?? 'referenced row not found');
      case 'SQLITE_CONSTRAINT_CHECK':
        throw new ValidationError(hints.invalid ?? 'invalid value');
      case 'SQLITE_BUSY':
      case 'SQLITE_BUSY_SNAPSHOT':
        // SQLite serialises writers; a concurrent transaction can land on
        // BUSY. Per global constraints we do not retry in the repo — surface
        // as ConflictError so the HTTP layer returns 409 and the client retries.
        throw new ConflictError(hints.conflict ?? 'database busy, retry');
    }
  }
  throw err;
}
