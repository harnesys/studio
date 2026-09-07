import type { RunEventFeed, RunLifecycleStore } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { publishDeskThread } from './publish-desk-thread.ts';

export type PersistHandoffCurrentDeps = {
  lifecycle: RunLifecycleStore;
  threads: ThreadRepository;
  agents: AgentRepository;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
};

/** Wraps feed.publish: on `agent.handoff` patches thread.agentId and emits desk. */
export function withHandoffCurrentPersist(
  feed: RunEventFeed,
  deps: PersistHandoffCurrentDeps,
): RunEventFeed {
  return {
    subscribe: (runId, fromSeq) => feed.subscribe(runId, fromSeq),
    publish(runId, events) {
      feed.publish(runId, events);
      for (const event of events) {
        if (event.type === 'agent.handoff') {
          persistHandoffCurrent(deps, runId, event.agentId);
        }
      }
    },
  };
}

function persistHandoffCurrent(
  deps: PersistHandoffCurrentDeps,
  runId: string,
  agentId: string,
): void {
  void applyHandoff(deps, runId, agentId).catch((error: unknown) => {
    console.warn(
      `[handoff] persist current agent failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

async function applyHandoff(
  deps: PersistHandoffCurrentDeps,
  runId: string,
  agentId: string,
): Promise<void> {
  if (!agentId) {
    return;
  }
  const rec = await deps.lifecycle.get(runId);
  if (!rec) {
    return;
  }
  const thread = deps.threads.findById(rec.threadId);
  if (!thread || thread.agentId === agentId) {
    return;
  }
  const agent = deps.agents.findById(agentId);
  if (!agent || agent.workspaceId !== thread.workspaceId) {
    console.warn(`[handoff] agent not found: ${agentId}`);
    return;
  }
  deps.threads.patch(thread.id, { agentId });
  publishDeskThread(deps.getThread, deps.deskEvents, thread.id);
}
