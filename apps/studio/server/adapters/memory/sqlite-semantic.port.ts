import { and, desc, eq, isNull, lt, or, type SQL } from 'drizzle-orm';
import type {
  MemoryRecord,
  MemoryRecordSource,
  MemoryScopeId,
  SemanticListQuery,
  SemanticMemoryPort,
  SemanticProjectInput,
  SemanticScope,
  SemanticSessionTtl,
  SemanticUpsertInput,
} from 'harnesys';
import { ValidationError } from '../../domain/studio.error.ts';
import type { StudioDb } from '../store/sqlite/connection.ts';
import { mapSqliteError } from '../store/sqlite/errors.ts';
import { type SemanticMemoryRow, semanticMemoriesTable } from '../store/sqlite/schema/index.ts';
import { fitLinesToBudget } from './fit-budget.ts';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type SessionTtl = SemanticSessionTtl;

export type SqliteSemanticPortOptions = {
  /** Fallback when callers omit per-call sessionTtl. */
  sessionTtl?: SessionTtl;
};

export type DeleteSessionByThreadInput = {
  workspaceId: string;
  threadId: string;
};

export class SqliteSemanticPort implements SemanticMemoryPort {
  private readonly defaultSessionTtl: SessionTtl;

  constructor(
    private readonly db: StudioDb,
    options: SqliteSemanticPortOptions = {},
  ) {
    this.defaultSessionTtl = options.sessionTtl ?? 'thread';
  }

  /** Wipe session rows for a closed/deleted thread. */
  deleteSessionByThread(input: DeleteSessionByThreadInput): void {
    this.db
      .delete(semanticMemoriesTable)
      .where(
        and(
          eq(semanticMemoriesTable.workspaceId, input.workspaceId),
          eq(semanticMemoriesTable.threadId, input.threadId),
          eq(semanticMemoriesTable.scope, 'session'),
        ),
      )
      .run();
  }

  upsert(scopeId: MemoryScopeId, input: SemanticUpsertInput): Promise<MemoryRecord> {
    this.cleanupExpired(scopeId, input.sessionTtl);
    const now = new Date().toISOString();
    const threadId = resolveStoredThreadId(scopeId, input);
    try {
      if (input.key) {
        return Promise.resolve(this.upsertKeyed(scopeId, input, now, threadId));
      }
      const row = this.db
        .insert(semanticMemoriesTable)
        .values({
          id: crypto.randomUUID(),
          workspaceId: scopeId.workspaceId,
          agentName: scopeId.agentName,
          scope: input.scope,
          key: null,
          text: input.text,
          source: input.source,
          threadId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return Promise.resolve(toMemoryRecord(row));
    } catch (err) {
      return Promise.reject(
        mapSqliteError(err, {
          conflict: 'semantic memory conflict',
          notFound: 'workspace not found',
          invalid: 'invalid semantic memory',
        }),
      );
    }
  }

  list(scopeId: MemoryScopeId, query: SemanticListQuery): Promise<MemoryRecord[]> {
    this.cleanupExpired(scopeId, query.sessionTtl);
    const filters: SQL[] = [
      eq(semanticMemoriesTable.workspaceId, scopeId.workspaceId),
      eq(semanticMemoriesTable.agentName, scopeId.agentName),
    ];
    const scopeFilter = scopeListFilter(scopeId, query.scope);
    if (scopeFilter) {
      filters.push(scopeFilter);
    }
    let rows = this.db
      .select()
      .from(semanticMemoriesTable)
      .where(and(...filters))
      .orderBy(desc(semanticMemoriesTable.updatedAt))
      .all();
    if (query.limit !== undefined) {
      rows = rows.slice(0, query.limit);
    }
    return Promise.resolve(rows.map(toMemoryRecord));
  }

  remove(scopeId: MemoryScopeId, id: string): Promise<void> {
    this.db
      .delete(semanticMemoriesTable)
      .where(
        and(
          eq(semanticMemoriesTable.id, id),
          eq(semanticMemoriesTable.workspaceId, scopeId.workspaceId),
          eq(semanticMemoriesTable.agentName, scopeId.agentName),
        ),
      )
      .run();
    return Promise.resolve();
  }

  async projectForWindow(scopeId: MemoryScopeId, input: SemanticProjectInput): Promise<string> {
    if (input.scopes.length === 0 || input.limit <= 0 || input.budgetTokens <= 0) {
      return '';
    }
    const wanted = new Set(input.scopes);
    const records = (
      await this.list(scopeId, {
        ...(input.sessionTtl ? { sessionTtl: input.sessionTtl } : {}),
      })
    ).filter((row) => wanted.has(row.scope));
    const lines = records
      .slice(0, input.limit)
      .map((row) => (row.key ? `${row.key}: ${row.text}` : row.text));
    return fitLinesToBudget(lines, input.budgetTokens);
  }

  private upsertKeyed(
    scopeId: MemoryScopeId,
    input: SemanticUpsertInput,
    now: string,
    threadId: string | null,
  ): MemoryRecord {
    const key = input.key;
    if (!key) {
      throw new Error('upsertKeyed requires key');
    }
    const existing = this.db
      .select()
      .from(semanticMemoriesTable)
      .where(keyedLookup(scopeId, input.scope, key, threadId))
      .get();
    if (existing) {
      const row = this.db
        .update(semanticMemoriesTable)
        .set({
          text: input.text,
          source: input.source,
          threadId,
          updatedAt: now,
        })
        .where(eq(semanticMemoriesTable.id, existing.id))
        .returning()
        .get();
      return toMemoryRecord(row);
    }
    const row = this.db
      .insert(semanticMemoriesTable)
      .values({
        id: crypto.randomUUID(),
        workspaceId: scopeId.workspaceId,
        agentName: scopeId.agentName,
        scope: input.scope,
        key,
        text: input.text,
        source: input.source,
        threadId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return toMemoryRecord(row);
  }

  private cleanupExpired(scopeId: MemoryScopeId, sessionTtl?: SessionTtl): void {
    this.dropOrphanSessionRows(scopeId);
    if ((sessionTtl ?? this.defaultSessionTtl) !== '24h') {
      return;
    }
    const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
    this.db
      .delete(semanticMemoriesTable)
      .where(
        and(
          eq(semanticMemoriesTable.workspaceId, scopeId.workspaceId),
          eq(semanticMemoriesTable.agentName, scopeId.agentName),
          eq(semanticMemoriesTable.scope, 'session'),
          lt(semanticMemoriesTable.updatedAt, cutoff),
        ),
      )
      .run();
  }

  /** Legacy null-thread session rows must not bleed across threads. */
  private dropOrphanSessionRows(scopeId: MemoryScopeId): void {
    this.db
      .delete(semanticMemoriesTable)
      .where(
        and(
          eq(semanticMemoriesTable.workspaceId, scopeId.workspaceId),
          eq(semanticMemoriesTable.agentName, scopeId.agentName),
          eq(semanticMemoriesTable.scope, 'session'),
          isNull(semanticMemoriesTable.threadId),
        ),
      )
      .run();
  }
}

function resolveStoredThreadId(scopeId: MemoryScopeId, input: SemanticUpsertInput): string | null {
  if (input.scope === 'long') {
    return null;
  }
  const threadId = input.threadId ?? scopeId.threadId;
  if (!threadId) {
    throw new ValidationError('session memory requires threadId');
  }
  return threadId;
}

function keyedLookup(
  scopeId: MemoryScopeId,
  scope: SemanticScope,
  key: string,
  threadId: string | null,
): SQL {
  if (scope === 'session' && threadId) {
    return and(
      eq(semanticMemoriesTable.workspaceId, scopeId.workspaceId),
      eq(semanticMemoriesTable.agentName, scopeId.agentName),
      eq(semanticMemoriesTable.scope, scope),
      eq(semanticMemoriesTable.key, key),
      eq(semanticMemoriesTable.threadId, threadId),
    ) as SQL;
  }
  return and(
    eq(semanticMemoriesTable.workspaceId, scopeId.workspaceId),
    eq(semanticMemoriesTable.agentName, scopeId.agentName),
    eq(semanticMemoriesTable.scope, scope),
    eq(semanticMemoriesTable.key, key),
  ) as SQL;
}

function scopeListFilter(
  scopeId: MemoryScopeId,
  scope: SemanticScope | undefined,
): SQL | undefined {
  if (scope === 'long') {
    return eq(semanticMemoriesTable.scope, 'long');
  }
  if (scope === 'session') {
    return scopeId.threadId
      ? and(
          eq(semanticMemoriesTable.scope, 'session'),
          eq(semanticMemoriesTable.threadId, scopeId.threadId),
        )
      : eq(semanticMemoriesTable.scope, 'session');
  }
  if (scopeId.threadId) {
    return or(
      eq(semanticMemoriesTable.scope, 'long'),
      and(
        eq(semanticMemoriesTable.scope, 'session'),
        eq(semanticMemoriesTable.threadId, scopeId.threadId),
      ),
    );
  }
  return undefined;
}

function toMemoryRecord(row: SemanticMemoryRow): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope as SemanticScope,
    text: row.text,
    ...(row.key ? { key: row.key } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: row.source as MemoryRecordSource,
    ...(row.threadId ? { threadId: row.threadId } : {}),
  };
}
