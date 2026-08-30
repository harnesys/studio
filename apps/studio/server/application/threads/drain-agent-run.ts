import type { AgentRun, Journal, StreamEvent } from 'harnesys';
import { isAgentEntry, isBuiltinStep } from 'harnesys';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import type { JournalRepository } from '../../domain/journal.port.ts';

export type DrainAgentRunOptions = {
  threadId: string;
  run: AgentRun;
  handle: { journal: Journal };
  journal: JournalRepository;
  activeRuns: ActiveRunRegistry;
  registry?: ThreadRuntimeRegistry;
  onPersist?: (threadId: string) => void;
};

/** Exclusive drain: persist + SSE hub, then drop idle thread from Map. */
export async function drainAgentRun(options: DrainAgentRunOptions): Promise<void> {
  const { threadId, run, handle, journal, activeRuns, registry, onPersist } = options;
  try {
    for await (const event of run.stream()) {
      journal.applyEvent(threadId, event);
      activeRuns.emit(run.id, event);
      if (event.type === 'entry' && isAgentEntry(event.entry) && event.entry.status === 'paused') {
        journal.saveSnapshot(threadId, handle.journal);
        onPersist?.(threadId);
      } else if (isHitlStep(event)) {
        onPersist?.(threadId);
      }
    }
  } catch {
    // abort / consumer errors
  } finally {
    try {
      journal.saveSnapshot(threadId, handle.journal);
    } catch {
      // thread may already be gone
    }
    onPersist?.(threadId);
    activeRuns.finish(run.id);
    registry?.forget(threadId);
  }
}

function isHitlStep(event: StreamEvent): boolean {
  return (
    event.type === 'step' &&
    isBuiltinStep(event.step) &&
    (event.step.status === 'awaiting_confirm' || event.step.status === 'awaiting_input')
  );
}
