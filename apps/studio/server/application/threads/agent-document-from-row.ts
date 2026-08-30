import type { PortRef } from 'harnesys';
import { composeAgentSystem } from '../../../shared/default-agent-instructions.ts';
import type { AgentProjectPaths, AgentSpec } from '../../../shared/harnesys-bridge.ts';
import type { Agent } from '../../domain/agent.port.ts';

export type AgentModelBinding = {
  providerName: string;
  modelName: string;
};

type AgentProjectConfig = PortRef | AgentProjectPaths | { paths: string[] } | null | undefined;

/** Map persisted agent row into harnesys AgentSpec for send/resume. */
export function agentSpecFromRow(agent: Agent, model: AgentModelBinding): AgentSpec {
  const projectPaths = projectPathsFromMemory(agent.memory.project);
  const system = composeAgentSystem(agent.instructions);
  const instructions = {
    system,
    ...(projectPaths ? { project: projectPaths } : {}),
  };

  return {
    model: {
      provider: model.providerName,
      model: model.modelName,
      effort: agent.effort ?? undefined,
      generation: agent.generation ?? undefined,
    },
    instructions,
    skills: agent.skills.length ? agent.skills : undefined,
    mcpServers: agent.mcpServers.length ? agent.mcpServers : undefined,
    tools: agent.tools.length ? agent.tools : undefined,
    toolOutput: agent.toolOutput ?? undefined,
    compaction: agent.compaction,
    memory: agent.memory,
  };
}

function projectPathsFromMemory(project: AgentProjectConfig): string[] | undefined {
  if (!isAgentProjectPaths(project)) {
    return undefined;
  }
  const list = project.allow ?? (project as { paths?: string[] }).paths;
  return Array.isArray(list) && list.length > 0 ? list : undefined;
}

function isAgentProjectPaths(value: AgentProjectConfig): value is AgentProjectPaths {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    ('allow' in value && Array.isArray((value as AgentProjectPaths).allow)) ||
    ('paths' in value && Array.isArray((value as { paths?: string[] }).paths))
  );
}
