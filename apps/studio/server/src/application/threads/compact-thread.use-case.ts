import type { CompactThreadResponse } from '@harnesys/studio-shared';
import type {
  AgentDefinition,
  CompactionMessage,
  EpisodicPort,
  Event,
  HookEmitCtx,
  ModelBinding,
  ModelsPort,
  PendingSessionEvent,
  SessionEvent,
} from 'harnesys';
import { compactForced, resolveCapabilitySet, THRESHOLD_SUMMARY_NAME } from 'harnesys';
import { runInHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { logger, toRuntimeLogger } from '../../config/logger.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { RuntimeStateRepository } from '../../domain/runtime-state.port.ts';
import { NotFoundError, RunConflictError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { buildCapabilityUniverse } from '../capabilities/universe.ts';
import { createEpisodicOnCompacted } from '../memory/episodic-on-compacted.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { publishDeskThread } from './publish-desk-thread.ts';

export type CompactThreadRequest = {
  threadId: string;
  signal?: AbortSignal;
};

export type CompactStreamItem =
  | { kind: 'event'; event: SessionEvent }
  | { kind: 'result'; response: CompactThreadResponse };

export type CompactThreadInput = {
  executeStream(request: CompactThreadRequest): AsyncGenerator<CompactStreamItem>;
};

export type CompactJournalPort = {
  appendForThread(
    threadId: string,
    runId: string,
    events: PendingSessionEvent[],
  ): SessionEvent[] | Promise<SessionEvent[]>;
};

export type CompactThreadDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  runtimeStates: RuntimeStateRepository;
  models: ModelsPort;
  episodic: EpisodicPort;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  runEvents: CompactJournalPort;
  runHooks: ThreadRunHooks;
};

/** Хук-шина рана для PreCompact/PostCompact на ручном проходе (спека §2.3). */
export type ThreadRunHooks = {
  ensure(threadId: string): Promise<HookEmitCtx | undefined>;
  release(threadId: string): Promise<void>;
};

/**
 * Тот же срез, что run-engine `eventToSessionEvent` для PASSTHROUGH model.*
 * прохода компакции (авто в graph и ручной /compact).
 */
function sessionEventFromCompactionPass(ev: {
  type: string;
  data?: unknown;
}): PendingSessionEvent | null {
  const data =
    ev.data && typeof ev.data === 'object' ? (ev.data as Record<string, unknown>) : undefined;
  if (ev.type === 'model.delta') {
    const text = data?.text;
    if (typeof text !== 'string' || !text) {
      return null;
    }
    return {
      type: 'text-delta',
      text,
      id: typeof data?.id === 'string' ? data.id : undefined,
    };
  }
  if (ev.type === 'model.reasoning') {
    const text = data?.text ?? data?.delta;
    if (typeof text !== 'string' || !text) {
      return null;
    }
    return {
      type: 'reasoning-delta',
      text,
      id: typeof data?.id === 'string' ? data.id : undefined,
    };
  }
  if (ev.type === 'model.reasoning-start') {
    return { type: 'reasoning-start', id: String(data?.id ?? '') };
  }
  if (ev.type === 'model.reasoning-end') {
    return { type: 'reasoning-end', id: String(data?.id ?? '') };
  }
  return null;
}

export class CompactThreadUseCase implements CompactThreadInput {
  constructor(private readonly deps: CompactThreadDeps) {}

  async *executeStream(request: CompactThreadRequest): AsyncGenerator<CompactStreamItem> {
    const thread = this.deps.threads.findById(request.threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    const agentRow = this.deps.agents.findById(thread.agentId);
    if (!agentRow) {
      throw new NotFoundError('agent not found');
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const def = this.deps.workspaceHarnesys.resolveAgentDefinition(agentRow.id);
    if (!def?.compaction || def.compaction.name !== THRESHOLD_SUMMARY_NAME) {
      throw new ValidationError('compaction is not configured for this agent');
    }
    const hx = await this.deps.workspaceHarnesys.get(workspace);
    const handle = await this.deps.registry.threadOf(thread.id, hx, agentRow.id, workspace.path);
    const active = await handle.activeRun(thread.id);
    if (active) {
      throw new RunConflictError({ runId: active.runId });
    }

    const state = this.deps.runtimeStates.forState(thread.id);
    const snap = await state.load();
    if (!snap) {
      yield { kind: 'result', response: { compacted: false } };
      return;
    }
    const st: Record<string, unknown> = { ...(snap.state as Record<string, unknown>) };
    const binding = await resolveDefaultBinding(this.deps.models, def);
    const journalRunId = `compact:${crypto.randomUUID()}`;
    const signal = request.signal ?? new AbortController().signal;

    let message: CompactionMessage | undefined;
    const hooks = await this.deps.runHooks.ensure(thread.id);
    // Тот же авторитетный набор, что собирает ран (резолвер composition-root без
    // полей режима: имена от экспозиции не зависят) — toolsJson промпта/оценки
    // не расходится с грантом агента.
    const universe = buildCapabilityUniverse(workspace, {
      hx,
      workspaceHarnesys: this.deps.workspaceHarnesys,
    });
    const runSet = runInHostToolScope(
      { workspaceId: workspace.id, agentId: agentRow.id, threadId: thread.id },
      () =>
        resolveCapabilitySet(def, {
          ...universe,
          roster: this.deps.workspaceHarnesys.listScopedRoster(def),
        }),
    );
    if (runSet.fatal.length > 0) {
      logger.warn({ scope: 'capabilities' }, `compact ${thread.id}: ${runSet.fatal.join('; ')}`);
    }
    const runToolRegistry = new Map(
      [...runSet.registry].map(([name, entry]) => [
        name,
        { ...entry.def, exposure: entry.exposure },
      ]),
    );
    try {
      for await (const ev of compactForced({
        agent: def,
        state: st,
        sessionId: state.sessionId,
        binding,
        models: this.deps.models,
        toolRegistry: runToolRegistry,
        paths: { allow: [workspace.path], cwd: workspace.path },
        signal,
        logger: toRuntimeLogger('runtime'),
        hooks,
      })) {
        if (ev.type === 'completed') {
          message = ev.message;
          continue;
        }
        if (ev.type === 'failed') {
          throw new ValidationError(ev.error);
        }
        const pending = sessionEventFromCompactionPass(ev);
        if (!pending) {
          continue;
        }
        const assigned = await this.deps.runEvents.appendForThread(thread.id, journalRunId, [
          pending,
        ]);
        for (const event of assigned) {
          yield { kind: 'event', event };
        }
      }
    } finally {
      await this.deps.runHooks.release(thread.id).catch(() => undefined);
    }
    if (!message) {
      yield { kind: 'result', response: { compacted: false } };
      return;
    }

    const sequence = snap.sequence + 1;
    const event: Event = {
      eventId: crypto.randomUUID(),
      type: 'compaction.completed',
      timestamp: Date.now(),
      sessionId: state.sessionId,
      runId: snap.runId,
      agentId: def.id,
      sequence,
      metadata: {
        id: message.id,
        coveredFrom: message.coveredFrom,
        coveredUntil: message.coveredUntil,
        reason: message.reason,
        tokensBefore: message.stats.tokensBefore,
        tokensAfter: message.stats.tokensAfter,
      },
    };
    await state.commit({ ...snap, sequence, state: st }, [event], {
      kind: 'recorded',
      sequence,
    });

    const compactionAssigned = await this.deps.runEvents.appendForThread(thread.id, journalRunId, [
      {
        type: 'compaction',
        id: message.id,
        reason: message.reason,
        coveredFrom: message.coveredFrom,
        coveredUntil: message.coveredUntil,
        tokensBefore: message.stats.tokensBefore,
        tokensAfter: message.stats.tokensAfter,
        clientEventId: `compaction:${message.id}`,
      },
    ]);
    for (const sessionEvent of compactionAssigned) {
      yield { kind: 'event', event: sessionEvent };
    }

    try {
      await createEpisodicOnCompacted({
        episodic: this.deps.episodic,
        workspaceId: thread.workspaceId,
        threadId: thread.id,
        episodicRef: undefined,
      })({
        fromSeq: message.coveredFrom,
        toSeq: message.coveredUntil,
        compactionEntryId: message.id,
      });
    } catch (e) {
      logger.warn(
        { scope: 'compaction' },
        `episodic index failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    publishDeskThread(this.deps.getThread, this.deps.deskEvents, thread.id);

    yield {
      kind: 'result',
      response: {
        compacted: true,
        id: message.id,
        coveredFrom: message.coveredFrom,
        coveredUntil: message.coveredUntil,
        tokensBefore: message.stats.tokensBefore,
        tokensAfter: message.stats.tokensAfter,
      },
    };
  }
}

async function resolveDefaultBinding(
  models: ModelsPort,
  def: AgentDefinition,
): Promise<ModelBinding> {
  const ref = def.model;
  if (!ref) {
    throw new ValidationError('agent has no model');
  }
  return await models.get(ref.provider, ref.model);
}
