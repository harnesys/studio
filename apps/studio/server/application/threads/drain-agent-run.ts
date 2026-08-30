import type { AgentRun, SessionEvent } from 'harnesys';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';

export type DrainAgentRunOptions = {
  threadId: string;
  run: AgentRun;
  activeRuns: ActiveRunRegistry;
  registry?: ThreadRuntimeRegistry;
  onPersist?: (threadId: string) => void;
};

export async function drainAgentRun(options: DrainAgentRunOptions): Promise<void> {
  const { threadId, run, activeRuns, registry, onPersist } = options;
  try {
    for await (const event of run.stream()) {
      activeRuns.emit(run.id, event);
      if (event.type === 'ask') {
        onPersist?.(threadId);
      }
    }
  } catch {
    // abort / consumer errors
  } finally {
    onPersist?.(threadId);
    activeRuns.finish(run.id);
    registry?.forget(threadId);
  }
}
