import { NotFoundError } from '../domain/studio.error.ts';
import type { NodeRuntime, NodeSupervisor } from './node-supervisor.ts';
export function requireNode(supervisor: NodeSupervisor, workspaceId: string): NodeRuntime {
  return supervisor.require(workspaceId);
}
export function nodeForThread(supervisor: NodeSupervisor, threadId: string): NodeRuntime {
  const found = supervisor.findByThreadId(threadId);
  if (!found) {
    throw new NotFoundError('thread not found');
  }
  return found;
}
export function nodeForAgent(supervisor: NodeSupervisor, agentId: string): NodeRuntime {
  for (const entry of supervisor.list()) {
    if (entry.store.agentRepo.findById(agentId)) {
      return entry;
    }
  }
  throw new NotFoundError('agent not found');
}
export function scan<T>(
  supervisor: NodeSupervisor,
  pick: (entry: NodeRuntime) => T | undefined,
): T | undefined {
  for (const entry of supervisor.list()) {
    const value = pick(entry);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
