import type { CapabilityScope } from '../../domain/capability.ts';
import type { AgentCatalogCreateInput, AgentsCatalogPort } from '../../ports/agents-catalog.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreateAgentsToolsParams = {
  agents: AgentsCatalogPort;
  resolveScope: () => CapabilityScope;
};

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

type AgentsListInput = {
  role?: string;
  name?: string;
};

export function createAgentsTools(deps: CreateAgentsToolsParams): ToolDefinition[] {
  return [
    tool('agents_list', {
      group: 'agents',
      description:
        'List agents in this workspace (id, name, role, instructions). Optional role/name filters; role is not unique. Prefer reuse via agents_list before agents_create.',
      input: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Filter by role (exact match)' },
          name: { type: 'string', description: 'Filter by name (exact match)' },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = (raw ?? {}) as AgentsListInput;
          const filter =
            input.role !== undefined || input.name !== undefined
              ? { role: input.role, name: input.name }
              : undefined;
          const rows = await deps.agents.list(scope, filter);
          return rows.map((row) => ({
            id: row.id,
            name: row.name,
            role: row.role,
            instructions: row.instructions,
          }));
        }),
    }),
    tool('agents_create', {
      group: 'agents',
      description:
        'Create an agent in this workspace. Returns { id, name }. Omit graph to let the host build a default ReAct graph. Call agents_list first to reuse an existing agent when possible.',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name' },
          role: { type: 'string', description: 'Role label (not unique)' },
          instructions: { type: 'string', description: 'System instructions for the agent' },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tool names available to the agent',
          },
          skills: {
            type: 'array',
            items: { type: 'string' },
            description: 'Skill names to attach',
          },
          mcpServers: {
            type: 'array',
            items: { type: 'string' },
            description: 'MCP server names to attach',
          },
          budget: {
            type: 'object',
            description: 'Optional run budget (maxSteps, maxTokens, deadlineMs, policy)',
          },
          capabilities: {
            type: 'object',
            description: 'Optional capability map (name → config or null)',
          },
          graph: {
            type: 'object',
            description: 'Optional custom graph; omit for host default ReAct',
          },
          model: {
            type: 'object',
            description: 'Optional model ref (provider, model, effort, generation)',
          },
        },
        required: ['name', 'role', 'instructions'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as AgentCatalogCreateInput;
          if (!input.name || !input.role || !input.instructions) {
            return { error: 'name, role, and instructions are required' };
          }
          return await deps.agents.create(scope, input);
        }),
    }),
  ];
}
