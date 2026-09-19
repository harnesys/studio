import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { CommitMeta, RuntimeState } from '../ports/runtime-state.ts';
export class InMemoryRuntimeState implements RuntimeState {
  readonly sessionId: string;
  private snapshot: Snapshot | null = null;
  private readonly events: Event[] = [];
  private readonly sequences = new Set<number>();
  private readonly children = new Map<string, InMemoryRuntimeState>();
  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }
  load(): Promise<Snapshot | null> {
    return Promise.resolve(this.snapshot);
  }
  commit(snapshot: Snapshot, events: readonly Event[], meta: CommitMeta): Promise<void> {
    if (this.sequences.has(meta.sequence)) {
      this.snapshot = snapshot;
      return Promise.resolve();
    }
    this.sequences.add(meta.sequence);
    this.snapshot = snapshot;
    for (const event of events) {
      this.events.push(event);
    }
    return Promise.resolve();
  }
  child(spawnId: string): RuntimeState {
    const existing = this.children.get(spawnId);
    if (existing) {
      return existing;
    }
    const child = new InMemoryRuntimeState(`${this.sessionId}:${spawnId}`);
    this.children.set(spawnId, child);
    return child;
  }
  getCommittedEvents(): readonly Event[] {
    return this.events;
  }
}
