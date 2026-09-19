import type { HooksBinding } from 'harnesys';
import type { Hono } from 'hono';
import type { CreateAgentInput } from '../../../application/agents/create-agent.use-case.ts';
import type { CreateAgentFromPresetInput } from '../../../application/agents/create-agent-from-preset.use-case.ts';
import type { DeleteAgentInput } from '../../../application/agents/delete-agent.use-case.ts';
import type { ListAgentPresetsInput } from '../../../application/agents/list-agent-presets.use-case.ts';
import type { ListAgentsInput } from '../../../application/agents/list-agents.use-case.ts';
import type { UpdateAgentInput } from '../../../application/agents/update-agent.use-case.ts';
import type { ListAgentCapabilitiesInput } from '../../../application/capabilities/list-agent-capabilities.use-case.ts';
import type { AgentGraph } from '../../../domain/agent.port.ts';
import { createAgentBody, createAgentFromPresetBody, updateAgentBody } from './agent.body.ts';

export type AgentControllerDeps = {
  listAgents: ListAgentsInput;
  listAgentPresets: ListAgentPresetsInput;
  listAgentCapabilities: ListAgentCapabilitiesInput;
  createAgent: CreateAgentInput;
  createAgentFromPreset: CreateAgentFromPresetInput;
  updateAgent: UpdateAgentInput;
  deleteAgent: DeleteAgentInput;
};

export class AgentController {
  constructor(private readonly deps: AgentControllerDeps) {}

  register(app: Hono): void {
    app.get('/api/agents', async (c) => {
      return c.json(await this.deps.listAgents.execute());
    });

    app.get('/api/workspaces/:id/agents', async (c) => {
      return c.json(await this.deps.listAgents.execute({ workspaceId: c.req.param('id') }));
    });

    app.get('/api/agent-presets', (c) => {
      return c.json(this.deps.listAgentPresets.execute());
    });

    app.get('/api/agents/:id/capabilities', async (c) => {
      const workspaceId = c.req.query('workspaceId') || undefined;
      return c.json(
        await this.deps.listAgentCapabilities.execute({ workspaceId, agentId: c.req.param('id') }),
      );
    });

    app.post('/api/workspaces/:id/agents', async (c) => {
      const body = createAgentBody.parse(await c.req.json());
      const agent = await this.deps.createAgent.execute({
        workspaceId: c.req.param('id'),
        name: body.name,
        parentId: body.parentId ?? undefined,
        modelId: body.modelId ?? undefined,
        role: body.role ?? undefined,
        instructions: body.instructions ?? undefined,
        effort: body.effort ?? undefined,
        generation: body.generation ?? undefined,
        toolOutput: body.toolOutput ?? undefined,
        budget: body.budget ?? undefined,
        capabilities: body.capabilities,
        permissions: body.permissions,
        color: body.color,
        compaction: body.compaction,
        skills: body.skills,
        mcpServers: body.mcpServers,
        graph: body.graph as AgentGraph | undefined,
        hooks: body.hooks as HooksBinding[] | undefined,
        enabledPlugins: body.enabledPlugins,
        defaultModeId: body.defaultModeId ?? null,
        modes: body.modes,
      });
      return c.json(agent, 201);
    });

    app.post('/api/workspaces/:id/agents/from-preset', async (c) => {
      const body = createAgentFromPresetBody.parse(await c.req.json());
      const agent = await this.deps.createAgentFromPreset.execute({
        workspaceId: c.req.param('id'),
        presetId: body.presetId,
        parentId: body.parentId ?? undefined,
      });
      return c.json(agent, 201);
    });

    app.patch('/api/workspaces/:id/agents/:agentId', async (c) => {
      const body = updateAgentBody.parse(await c.req.json());
      const agent = await this.deps.updateAgent.execute({
        workspaceId: c.req.param('id'),
        id: c.req.param('agentId'),
        name: body.name ?? undefined,
        modelId: body.modelId ?? undefined,
        role: body.role ?? undefined,
        instructions: body.instructions ?? undefined,
        effort: body.effort === undefined ? undefined : body.effort,
        generation: body.generation === undefined ? undefined : body.generation,
        toolOutput: body.toolOutput === undefined ? undefined : body.toolOutput,
        budget: body.budget === undefined ? undefined : body.budget,
        capabilities: body.capabilities === undefined ? undefined : body.capabilities,
        permissions: body.permissions,
        color: body.color,
        compaction: body.compaction,
        skills: body.skills,
        mcpServers: body.mcpServers,
        graph: body.graph as AgentGraph | undefined,
        hooks: body.hooks as HooksBinding[] | undefined,
        enabledPlugins: body.enabledPlugins,
        defaultModeId: body.defaultModeId,
        modes: body.modes,
      });
      return c.json(agent);
    });

    app.delete('/api/workspaces/:id/agents/:agentId', async (c) => {
      await this.deps.deleteAgent.execute({
        workspaceId: c.req.param('id'),
        id: c.req.param('agentId'),
      });
      return c.body(null, 204);
    });
  }
}
