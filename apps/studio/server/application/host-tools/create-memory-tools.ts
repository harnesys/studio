import type {
  AgentMemoryConfig,
  EpisodicPort,
  KnowledgePort,
  PinPort,
  SemanticMemoryPort,
  ToolDefinition,
} from 'harnesys';
import {
  createEpisodicTools,
  createKnowledgeTools,
  createPinTools,
  createSemanticTools,
} from 'harnesys';
import { requireHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from '../memory/agent-memory-scope.ts';
import { sessionTtlFromAgentMemory } from '../memory/semantic-session-ttl.ts';

export type MemoryToolsDeps = {
  pin: PinPort;
  semantic: SemanticMemoryPort;
  episodic: EpisodicPort;
  knowledge: KnowledgePort;
  workspaces: WorkspaceRepository;
  agents: AgentRepository;
};

function topKFromMemory(memory: AgentMemoryConfig | undefined | null): number | undefined {
  const value = memory?.knowledge?.spec?.topK;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

export function createMemoryTools(deps: MemoryToolsDeps): ToolDefinition[] {
  const resolveScope = () =>
    resolveAgentMemoryScope(deps.workspaces, deps.agents, requireHostToolScope());
  const agentMemory = () => deps.agents.findById(requireHostToolScope().agentId)?.memory;
  return [
    ...createPinTools({ port: deps.pin, resolveScope }),
    ...createSemanticTools({
      port: deps.semantic,
      resolveScope,
      sessionTtl: () => sessionTtlFromAgentMemory(agentMemory()),
    }),
    ...createEpisodicTools({ port: deps.episodic, resolveScope }),
    ...createKnowledgeTools({
      port: deps.knowledge,
      resolveScope,
      topK: () => topKFromMemory(agentMemory()),
    }),
  ];
}
