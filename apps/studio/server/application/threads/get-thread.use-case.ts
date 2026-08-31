import { eq } from 'drizzle-orm';
import type { SessionEvent } from 'harnesys';
import type { ThreadRecord } from '../../../shared/types.ts';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import { eventsTable } from '../../adapters/store/sqlite/schema/events.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { readFields } from './thread.helpers.ts';

function rowToSessionEvent(row: {
  type: string;
  metadata: string | null;
}): SessionEvent | SessionEvent[] | null {
  let meta: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      meta = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  if (row.type === 'user.message') {
    const text = meta?.text as string | undefined;
    if (typeof text === 'string' && text) {
      return { type: 'user', text };
    }
    return null;
  }
  if (row.type === 'model.delta') {
    const text = meta?.text as string | undefined;
    if (typeof text === 'string' && text) {
      return { type: 'text-delta', text, id: meta?.id as string | undefined };
    }
    return null;
  }
  if (row.type === 'model.reasoning') {
    const text = (meta?.text ?? meta?.delta) as string | undefined;
    if (typeof text === 'string' && text) {
      return { type: 'reasoning-delta', text, id: meta?.id as string | undefined };
    }
    return null;
  }
  if (row.type === 'model.reasoning-start') {
    return { type: 'reasoning-start', id: String(meta?.id ?? '') };
  }
  if (row.type === 'model.reasoning-end') {
    return { type: 'reasoning-end', id: String(meta?.id ?? '') };
  }
  if (row.type === 'model.tool-input-start') {
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(meta?.id ?? meta?.toolCallId ?? ''),
      name: String(meta?.toolName ?? meta?.name ?? ''),
      delta: '',
    };
  }
  if (row.type === 'model.tool-input-delta') {
    const delta = meta?.delta as string | undefined;
    if (!delta) {
      return null;
    }
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(meta?.id ?? meta?.toolCallId ?? ''),
      name: String(meta?.toolName ?? meta?.name ?? ''),
      delta,
    };
  }
  if (row.type === 'model.tool-input-end') {
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(meta?.id ?? meta?.toolCallId ?? ''),
      name: String(meta?.toolName ?? meta?.name ?? ''),
      delta: '',
    };
  }
  if (row.type === 'model.tool-call') {
    return {
      type: 'tool',
      phase: 'requested',
      toolCallId: String(meta?.id ?? meta?.toolCallId ?? ''),
      name: String(meta?.name ?? meta?.toolName ?? ''),
      input: meta?.args ?? meta?.input,
    };
  }
  if (row.type === 'model.source') {
    return { type: 'source', source: meta?.source ?? meta } as SessionEvent;
  }
  if (row.type === 'model.file') {
    return { type: 'file', file: meta?.file ?? meta } as SessionEvent;
  }
  if (row.type === 'model.completed') {
    const text = meta?.text as string | undefined;
    const reasoning = meta?.reasoning as string | undefined;
    const synth: SessionEvent[] = [];
    if (typeof reasoning === 'string' && reasoning) {
      synth.push({ type: 'reasoning-delta', text: reasoning });
    }
    if (typeof text === 'string' && text) {
      synth.push({ type: 'text-delta', text });
    }
    if (synth.length === 0) {
      return null;
    }
    if (synth.length === 1) {
      return synth[0];
    }
    return synth;
  }
  if (row.type === 'model.chunk') {
    return null;
  }
  if (row.type === 'tool.intent' || row.type === 'tool.completed') {
    return {
      type: 'tool',
      phase: row.type === 'tool.intent' ? 'requested' : 'completed',
      toolCallId: String(meta?.toolCallId ?? ''),
      name: String(meta?.name ?? ''),
      input: meta?.input,
      output: meta?.output,
    };
  }
  if (row.type === 'tool.failed') {
    return {
      type: 'tool',
      phase: 'failed',
      toolCallId: String(meta?.toolCallId ?? ''),
      name: String(meta?.name ?? ''),
      input: meta?.input,
      output: meta?.output,
    };
  }
  if (row.type === 'tool.skipped') {
    return {
      type: 'tool',
      phase: 'skipped',
      toolCallId: String(meta?.toolCallId ?? ''),
      name: String(meta?.name ?? ''),
      input: meta?.input,
      output: meta?.output,
    };
  }
  if (row.type === 'interrupt.triggered') {
    return {
      type: 'ask',
      askId: String(meta?.interruptId ?? ''),
      schema: (meta?.resumeSchema as never) ?? {},
      source:
        (meta?.source as SessionEvent extends { type: 'ask'; source: infer S } ? S : never) ??
        'interrupt',
      prompt: typeof meta?.reason === 'string' ? meta.reason : undefined,
      tool: meta?.tool as { name: string; input: unknown; toolCallId: string } | undefined,
    };
  }
  if (row.type === 'run.completed') {
    const text = meta?.text as string | undefined;
    return { type: 'done', text: typeof text === 'string' ? text : undefined };
  }
  if (row.type === 'run.failed' || row.type === 'run.cancelled') {
    return {
      type: 'error',
      code: String(meta?.code ?? 'run_failed'),
      message: String(meta?.message ?? 'run failed'),
    };
  }
  return null;
}

export type GetThreadRequest = {
  id: string;
};

export type GetThreadInput = {
  execute(request: GetThreadRequest): Promise<ThreadRecord>;
};

export class GetThreadUseCase implements GetThreadInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly agents: AgentRepository,
    private readonly db: StudioDb,
  ) {}

  execute(request: GetThreadRequest): Promise<ThreadRecord> {
    const thread = this.threads.findById(request.id);
    if (!thread) {
      return Promise.reject(new NotFoundError('thread not found'));
    }
    const agent = this.agents.findById(thread.agentId);

    const rows = this.db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.threadId, thread.id))
      .orderBy(eventsTable.sequence)
      .all();

    const events: SessionEvent[] = [];
    for (const row of rows) {
      const se = rowToSessionEvent(row);
      if (se) {
        if (Array.isArray(se)) {
          events.push(...(se as SessionEvent[]));
        } else {
          events.push(se as SessionEvent);
        }
      }
    }

    return Promise.resolve({
      id: thread.id,
      title: thread.title,
      agentId: thread.agentId,
      agentName: agent?.name ?? '',
      workspaceId: thread.workspaceId,
      kind: thread.kind,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      ...readFields(thread),
      events,
    });
  }
}
