import type { AgentMemoryConfig, SemanticSessionTtl } from 'harnesys';

export function sessionTtlFromAgentMemory(
  memory: AgentMemoryConfig | undefined,
): SemanticSessionTtl | undefined {
  if (memory?.semantic == null) {
    return undefined;
  }
  const value = memory.semantic.spec?.sessionTtl;
  return value === 'thread' || value === '24h' ? value : undefined;
}
