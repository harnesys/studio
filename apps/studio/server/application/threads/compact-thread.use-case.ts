import type {
  AgentDefinition,
  CompactionMessage,
  EpisodicPort,
  Event,
  ModelBinding,
  ModelsPort,
  ToolDefinition,
} from 'harnesys';
import { compactForced, THRESHOLD_SUMMARY_NAME } from 'harnesys';
import type { CompactThreadResponse } from '../../../shared/thread.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { RuntimeStateRepository } from '../../domain/runtime-state.port.ts';
import { NotFoundError, RunConflictError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { createEpisodicOnCompacted } from '../memory/episodic-on-compacted.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { publishDeskThread } from './publish-desk-thread.ts';

export type CompactThreadRequest = {
  threadId: string;
};

export type CompactThreadInput = {
  execute(request: CompactThreadRequest): Promise<CompactThreadResponse>;
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
};

export class CompactThreadUseCase implements CompactThreadInput {
  constructor(private readonly deps: CompactThreadDeps) {}

  async execute(request: CompactThreadRequest): Promise<CompactThreadResponse> {
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
      return { compacted: false };
    }
    const st: Record<string, unknown> = { ...(snap.state as Record<string, unknown>) };
    const binding = await resolveDefaultBinding(this.deps.models, def);

    let message: CompactionMessage | undefined;
    for await (const ev of compactForced({
      agent: def,
      state: st,
      sessionId: state.sessionId,
      binding,
      models: this.deps.models,
      toolRegistry: hx.tools.registry() as Map<string, ToolDefinition>,
      paths: { allow: [workspace.path], cwd: workspace.path },
      signal: new AbortController().signal,
    })) {
      if (ev.type === 'completed') {
        message = ev.message;
      }
    }
    if (!message) {
      return { compacted: false };
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

    try {
      await createEpisodicOnCompacted({
        episodic: this.deps.episodic,
        workspaceId: thread.workspaceId,
        threadId: thread.id,
        episodicRef: agentRow.memory?.episodic ?? undefined,
      })({
        fromSeq: message.coveredFrom,
        toSeq: message.coveredUntil,
        compactionEntryId: message.id,
      });
    } catch (e) {
      console.warn(
        `[compaction] episodic index failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    publishDeskThread(this.deps.getThread, this.deps.deskEvents, thread.id);

    return {
      compacted: true,
      id: message.id,
      coveredFrom: message.coveredFrom,
      coveredUntil: message.coveredUntil,
      tokensBefore: message.stats.tokensBefore,
      tokensAfter: message.stats.tokensAfter,
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
