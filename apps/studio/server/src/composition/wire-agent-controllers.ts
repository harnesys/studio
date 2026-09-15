import type { Hono } from 'hono';
import { AgentController } from '../adapters/http/agent/agent.controller.ts';
import type { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import type { SqliteModePresetRepo } from '../adapters/store/sqlite/repos/sqlite-mode-preset.repo.ts';
import type { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import type { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import type { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import type { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { CreateAgentUseCase } from '../application/agents/create-agent.use-case.ts';
import { CreateAgentFromPresetUseCase } from '../application/agents/create-agent-from-preset.use-case.ts';
import { DeleteAgentUseCase } from '../application/agents/delete-agent.use-case.ts';
import { ListAgentPresetsUseCase } from '../application/agents/list-agent-presets.use-case.ts';
import { ListAgentsUseCase } from '../application/agents/list-agents.use-case.ts';
import { UpdateAgentUseCase } from '../application/agents/update-agent.use-case.ts';
import { ListAgentCapabilitiesUseCase } from '../application/capabilities/list-agent-capabilities.use-case.ts';
import { ValidateAgentConfigUseCase } from '../application/capabilities/validate-agent-config.use-case.ts';
import { GetWorkspaceMcpUseCase } from '../application/workspaces/get-workspace-mcp.use-case.ts';
import { ListWorkspaceSkillsUseCase } from '../application/workspaces/list-workspace-skills.use-case.ts';
import type { DeskEventsPort } from '../domain/desk-events.port.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';

export type WireAgentControllersDeps = {
  app: Hono;
  agentRepo: SqliteAgentRepo;
  threadRepo: SqliteThreadRepo;
  scheduleRepo: SqliteScheduleRepo;
  webhookRepo: SqliteWebhookRepo;
  memory: StudioMemoryPorts;
  modePresetRepo: SqliteModePresetRepo;
  workspaceRepo: SqliteWorkspaceRepo;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  deskEvents: DeskEventsPort;
};

export function wireAgentControllers(d: WireAgentControllersDeps): void {
  // create rejects unknown skills/mcpServers against the same workspace sources
  // the agent form pickers list from (`/workspaces/:id/skills`, `/workspaces/:id/mcp`).
  const validateConfig = new ValidateAgentConfigUseCase({
    agents: d.agentRepo,
    workspaces: d.workspaceRepo,
    workspaceHarnesys: d.workspaceHarnesys,
  });
  const createAgent = new CreateAgentUseCase(d.agentRepo, {
    modePresets: d.modePresetRepo,
    workspaceCatalog: {
      listSkills: new ListWorkspaceSkillsUseCase(d.workspaceRepo, d.workspaceHarnesys),
      listMcp: new GetWorkspaceMcpUseCase(d.workspaceRepo, d.workspaceHarnesys),
    },
    deskEvents: d.deskEvents,
    validateConfig,
  });

  new AgentController({
    listAgents: new ListAgentsUseCase(d.agentRepo),
    listAgentPresets: new ListAgentPresetsUseCase(),
    listAgentCapabilities: new ListAgentCapabilitiesUseCase({
      agents: d.agentRepo,
      workspaces: d.workspaceRepo,
      workspaceHarnesys: d.workspaceHarnesys,
    }),
    createAgent,
    createAgentFromPreset: new CreateAgentFromPresetUseCase(d.agentRepo, createAgent),
    updateAgent: new UpdateAgentUseCase(d.agentRepo, {
      deskEvents: d.deskEvents,
      validateConfig,
    }),
    deleteAgent: new DeleteAgentUseCase(d.agentRepo, d.threadRepo, {
      schedules: d.scheduleRepo,
      webhooks: d.webhookRepo,
      semantic: d.memory.semantic,
      pins: d.memory.pin,
      deskEvents: d.deskEvents,
    }),
  }).register(d.app);
}
