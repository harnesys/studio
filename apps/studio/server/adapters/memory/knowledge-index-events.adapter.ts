import type { KnowledgeIndexState } from '../../../shared/knowledge.ts';
import type { KnowledgeIndexEventsPort } from '../../domain/knowledge-index-events.port.ts';

type Listener = (state: KnowledgeIndexState) => void;

export class KnowledgeIndexEventsAdapter implements KnowledgeIndexEventsPort {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(workspaceId: string, listener: Listener): () => void {
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

  emit(workspaceId: string, state: KnowledgeIndexState): void {
    for (const listener of this.listeners.get(workspaceId) ?? []) {
      try {
        listener(state);
      } catch {
        // subscriber errors stay local
      }
    }
  }
}
