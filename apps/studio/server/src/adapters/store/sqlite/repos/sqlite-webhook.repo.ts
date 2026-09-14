import { and, eq } from 'drizzle-orm';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type {
  Webhook,
  WebhookInsert,
  WebhookPatch,
  WebhookRepository,
} from '../../../../domain/webhook.port.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type WebhookRow, webhooksTable } from '../schema';

export class SqliteWebhookRepo implements WebhookRepository {
  constructor(private readonly db: StudioDb) {}

  listByWorkspace(workspaceId: string): Webhook[] {
    return this.db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.workspaceId, workspaceId))
      .all()
      .map(toWebhook);
  }

  listByTargetAgent(workspaceId: string, agentId: string): Webhook[] {
    return this.db
      .select()
      .from(webhooksTable)
      .where(
        and(eq(webhooksTable.workspaceId, workspaceId), eq(webhooksTable.targetAgentId, agentId)),
      )
      .all()
      .map(toWebhook);
  }

  findById(id: string): Webhook | undefined {
    const row = this.db.select().from(webhooksTable).where(eq(webhooksTable.id, id)).get();
    return row ? toWebhook(row) : undefined;
  }

  findByThreadId(threadId: string): Webhook | undefined {
    const row = this.db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.threadId, threadId))
      .get();
    return row ? toWebhook(row) : undefined;
  }

  insert(rec: WebhookInsert): Webhook {
    try {
      const row = this.db.insert(webhooksTable).values(rec).returning().get();
      return toWebhook(row);
    } catch (err) {
      return mapSqliteError(err, {
        conflict: 'webhook exists',
        notFound: 'workspace or agent not found',
        invalid: 'invalid webhook status',
      });
    }
  }

  update(id: string, patch: WebhookPatch): Webhook {
    try {
      const row = this.db
        .update(webhooksTable)
        .set(patch)
        .where(eq(webhooksTable.id, id))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('webhook not found');
      }
      return toWebhook(row);
    } catch (err) {
      return mapSqliteError(err, { notFound: 'target agent not found' });
    }
  }

  delete(id: string): void {
    this.db.delete(webhooksTable).where(eq(webhooksTable.id, id)).run();
  }

  deleteByWorkspace(workspaceId: string): void {
    this.db.delete(webhooksTable).where(eq(webhooksTable.workspaceId, workspaceId)).run();
  }
}

function toWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    endpoint: row.endpoint,
    threadId: row.threadId,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
