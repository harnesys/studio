import type { AgentProjectPaths, AgentSpec, PortRef } from 'harnesys';
import { composeAgentSystem } from '../../../shared/default-agent-instructions.ts';
import type { Agent } from '../../domain/agent.port.ts';

export type AgentModelBinding = {
  providerName: string;
  modelName: string;
};

type AgentProjectConfig = PortRef | AgentProjectPaths | null | undefined;

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
  if (!isAgentProjectPaths(project) || project.paths.length === 0) {
    return undefined;
  }
  return project.paths;
}

function isAgentProjectPaths(value: AgentProjectConfig): value is AgentProjectPaths {
  return (
    typeof value === 'object' && value !== null && 'paths' in value && Array.isArray(value.paths)
  );
}
