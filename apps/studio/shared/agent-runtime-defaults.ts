import type { AgentMemoryConfig, PortRef } from 'harnesys';

export function defaultAgentCompaction(): PortRef {
  return {
    name: 'threshold-summary',
    spec: {
      thresholdRatio: 0.8,
      protectRecentRatio: 0.1,
      auto: true,
    },
  };
}

export function defaultAgentMemory(): AgentMemoryConfig {
  return {
    pin: {
      name: 'kv-pin',
      spec: { budgetTokens: 1500, maxItems: 32 },
    },
    semantic: {
      name: 'record-store',
      spec: {
        autoProject: ['long'],
        projectLimit: 20,
        projectBudgetTokens: 800,
        sessionTtl: 'thread',
      },
    },
    episodic: {
      name: 'fts',
      spec: { backend: 'fts', indexOnCompact: true, topK: 8 },
    },
    knowledge: null,
    project: { paths: ['AGENTS.md'] },
  };
}
