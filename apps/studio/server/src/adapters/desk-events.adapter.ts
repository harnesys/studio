import type { DeskEvent } from '@harnesys/studio-shared';
import type { DeskEventsInput } from '../domain/desk-events.port.ts';

type DeskListener = (event: DeskEvent) => void;

export class DeskEventsAdapter implements DeskEventsInput {
  private readonly listeners = new Map<string, Set<DeskListener>>();
  private readonly all = new Set<DeskListener>();

  subscribe(workspaceId: string, listener: DeskListener): () => void {
    let set = this.listeners.get(workspaceId);
    if (!set) {
      set = new Set();
      this.listeners.set(workspaceId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(workspaceId);
      }
    };
  }

  subscribeAll(listener: DeskListener): () => void {
    this.all.add(listener);
    return () => {
      this.all.delete(listener);
    };
  }

  emit(workspaceId: string, event: DeskEvent): void {
    for (const listener of this.listeners.get(workspaceId) ?? []) {
      try {
        listener(event);
      } catch {
        // subscriber errors stay local
      }
    }
    for (const listener of this.all) {
      try {
        listener(event);
      } catch {
        // subscriber errors stay local
      }
    }
  }
}
