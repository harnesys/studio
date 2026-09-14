import type { Hono } from 'hono';
import { AgentController } from '../adapters/http/agent/agent.controller.ts';
import type { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import type { SqliteModePresetRepo } from '../adapters/store/sqlite/repos/sqlite-mode-preset.repo.ts';
import type { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import type { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { CreateAgentUseCase } from '../application/agents/create-agent.use-case.ts';
import { CreateAgentFromPresetUseCase } from '../application/agents/create-agent-from-preset.use-case.ts';
import { DeleteAgentUseCase } from '../application/agents/delete-agent.use-case.ts';
import { ListAgentPresetsUseCase } from '../application/agents/list-agent-presets.use-case.ts';
import { ListAgentsUseCase } from '../application/agents/list-agents.use-case.ts';
import { UpdateAgentUseCase } from '../application/agents/update-agent.use-case.ts';
import { GetWorkspaceMcpUseCase } from '../application/workspaces/get-workspace-mcp.use-case.ts';
import { ListWorkspaceSkillsUseCase } from '../application/workspaces/list-workspace-skills.use-case.ts';

export type WireAgentControllersDeps = {
  app: Hono;
  agentRepo: SqliteAgentRepo;
  threadRepo: SqliteThreadRepo;
  modePresetRepo: SqliteModePresetRepo;
  workspaceRepo: SqliteWorkspaceRepo;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
};

export function wireAgentControllers(d: WireAgentControllersDeps): void {
  // create rejects unknown skills/mcpServers against the same workspace sources
  // the agent form pickers list from (`/workspaces/:id/skills`, `/workspaces/:id/mcp`).
  const createAgent = new CreateAgentUseCase(d.agentRepo, undefined, d.modePresetRepo, {
    listSkills: new ListWorkspaceSkillsUseCase(d.workspaceRepo, d.workspaceHarnesys),
    listMcp: new GetWorkspaceMcpUseCase(d.workspaceRepo, d.workspaceHarnesys),
  });

  new AgentController({
    listAgents: new ListAgentsUseCase(d.agentRepo),
    listAgentPresets: new ListAgentPresetsUseCase(),
    createAgent,
    createAgentFromPreset: new CreateAgentFromPresetUseCase(d.agentRepo, createAgent),
    updateAgent: new UpdateAgentUseCase(d.agentRepo),
    deleteAgent: new DeleteAgentUseCase(d.agentRepo, d.threadRepo),
  }).register(d.app);
}
