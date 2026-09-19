import type { RunEventStore } from 'harnesys';
import type { BranchStateSeeder } from '../../domain/branch-state-seeder.port.ts';
import type { RuntimeStateRepository } from '../../domain/runtime-state.port.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import { cutParentEvents, seedMessagesFromEvents } from './fork-logs.ts';
export type SeedBranchStateDeps = {
  threads: ThreadRepository;
  runEvents: RunEventStore;
  runtimeStates: RuntimeStateRepository;
};
export class SeedBranchStateUseCase implements BranchStateSeeder {
  constructor(private readonly deps: SeedBranchStateDeps) {}
  async seedIfNeeded(threadId: string): Promise<void> {
    const thread = this.deps.threads.findById(threadId);
    if (!thread?.parentThreadId || !thread.forkAt) {
      return;
    }
    const state = this.deps.runtimeStates.forState(threadId);
    const existing = await state.load();
    if (existing !== null) {
      return;
    }
    const parentEvents = await this.deps.runEvents.listByThread(thread.parentThreadId);
    const inherited = cutParentEvents(parentEvents, thread.forkAt);
    const messages = seedMessagesFromEvents(inherited);
    if (messages.length === 0) {
      return;
    }
    await state.commit(
      {
        sessionId: state.sessionId,
        runId: crypto.randomUUID(),
        definitionHash: '',
        planHash: '',
        sequence: 0,
        status: 'idle',
        runtimeVersion: 'seed',
        initialInput: null,
        state: { messages },
        cursor: { nodes: {} },
        artifacts: null,
      },
      [],
      { kind: 'recorded', sequence: 0 },
    );
  }
}
