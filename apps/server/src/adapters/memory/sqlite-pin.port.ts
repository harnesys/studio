import { and, asc, eq } from 'drizzle-orm';
import type { MemoryScopeId, PinPort, PinRecord, PinSource, PinUpsertInput } from 'harnesys';
import type { StudioDb } from '../store/sqlite/connection.ts';
import { mapSqliteError } from '../store/sqlite/errors.ts';
import { type AgentPinRow, agentPinsTable } from '../store/sqlite/schema';
import { fitLinesToBudget } from './fit-budget.ts';
export class SqlitePinPort implements PinPort {
  constructor(private readonly db: StudioDb) {}
  list(scope: MemoryScopeId): Promise<PinRecord[]> {
    const rows = this.db
      .select()
      .from(agentPinsTable)
      .where(
        and(
          eq(agentPinsTable.workspaceId, scope.workspaceId),
          eq(agentPinsTable.agentName, scope.agentName),
        ),
      )
      .orderBy(asc(agentPinsTable.key))
      .all();
    return Promise.resolve(rows.map(toPinRecord));
  }
  upsert(scope: MemoryScopeId, input: PinUpsertInput): Promise<PinRecord> {
    const updatedAt = new Date().toISOString();
    try {
      const row = this.db
        .insert(agentPinsTable)
        .values({
          workspaceId: scope.workspaceId,
          agentName: scope.agentName,
          key: input.key,
          text: input.text,
          source: input.source,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [agentPinsTable.workspaceId, agentPinsTable.agentName, agentPinsTable.key],
          set: {
            text: input.text,
            source: input.source,
            updatedAt,
          },
        })
        .returning()
        .get();
      return Promise.resolve(toPinRecord(row));
    } catch (err) {
      return Promise.reject(
        mapSqliteError(err, {
          conflict: 'pin conflict',
          notFound: 'workspace not found',
          invalid: 'invalid pin',
        }),
      );
    }
  }
  remove(scope: MemoryScopeId, key: string): Promise<void> {
    this.db
      .delete(agentPinsTable)
      .where(
        and(
          eq(agentPinsTable.workspaceId, scope.workspaceId),
          eq(agentPinsTable.agentName, scope.agentName),
          eq(agentPinsTable.key, key),
        ),
      )
      .run();
    return Promise.resolve();
  }
  deleteByAgentName(input: { workspaceId: string; agentName: string }): void {
    this.db
      .delete(agentPinsTable)
      .where(
        and(
          eq(agentPinsTable.workspaceId, input.workspaceId),
          eq(agentPinsTable.agentName, input.agentName),
        ),
      )
      .run();
  }
  async projectForWindow(scope: MemoryScopeId, budgetTokens: number): Promise<string> {
    const pins = await this.list(scope);
    const lines = pins.map((pin) => `${pin.key}: ${pin.text}`);
    return fitLinesToBudget(lines, budgetTokens);
  }
}
function toPinRecord(row: AgentPinRow): PinRecord {
  return {
    key: row.key,
    text: row.text,
    updatedAt: row.updatedAt,
    source: row.source as PinSource,
  };
}
