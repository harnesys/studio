import type { CapabilityScope } from '../../domain/capability.ts';
import type { MemoryScopeId } from '../../ports/memory.ts';

export function memoryScopeOf(resolveScope: () => CapabilityScope): () => MemoryScopeId {
  return () => {
    const scope = resolveScope();
    return {
      workspaceId: scope.workspaceId,
      agentName: scope.agentName ?? scope.agentId,
      threadId: scope.threadId,
    };
  };
}
