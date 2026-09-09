import { resolveAgentTarget } from '../../application/agent-target-resolve.ts';

import type { CapabilityScope, PackConfig } from '../../domain/pack.ts';
import type { AgentCatalogCreateInput, AgentsCatalogPort } from '../../ports/agents-catalog.ts';
import type { AgentRosterEntry } from '../../ports/create-runtime.ts';
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

function spawnCallsShapeError(calls: unknown[]): string | null {
  for (let idx = 0; idx < calls.length; idx += 1) {
    const item = calls[idx];
    const agentId =
      item && typeof item === 'object' ? (item as { agentId?: unknown }).agentId : undefined;
    if (typeof agentId !== 'string' || !agentId) {
      return `calls[${idx}].agentId must be a non-empty string`;
    }
  }
  return null;
}

function spawnCallsTargetError(calls: unknown[], roster: AgentRosterEntry[]): string | null {
  for (const item of calls) {
    const agentId = (item as { agentId: string }).agentId;
    const hit = resolveAgentTarget(agentId, roster);
    if ('error' in hit) {
      return hit.error;
    }
  }
  return null;
}

export function createAgentsTools(deps: CreateAgentsToolsParams): ToolDefinition[] {
  return [
    tool('agents_list', {
      group: 'agents',
      description:
        'List agents in this workspace (id, name, role, instructions, tools, model). Optional role/name filters; role is not unique. tools lists declared names; the effective set at run time may be smaller (host/MCP filtering). Prefer reuse via agents_list before agents_create. Spawned children are one-shot with no interactive user: judge fit by tools/model before agents_spawn.',
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
          return await Promise.all(
            rows.map(async (row) => {
              const def = await deps.agents.get(scope, row.id);
              return {
                id: row.id,
                name: row.name,
                role: row.role,
                instructions: row.instructions,
                tools: def?.tools ?? [],
                ...(def?.model ? { model: `${def.model.provider}/${def.model.model}` } : {}),
              };
            }),
          );
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
          packs: {
            type: 'object',
            description: 'Optional pack map (name → config or null)',
          },
          capabilities: {
            type: 'object',
            description: 'Deprecated alias of packs; packs wins when both are present',
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
          const input = raw as AgentCatalogCreateInput & {
            capabilities?: Record<string, PackConfig | null>;
          };
          if (!input.name || !input.role || !input.instructions) {
            return { error: 'name, role, and instructions are required' };
          }
          const packs = input.packs ?? input.capabilities;
          const next: AgentCatalogCreateInput & { capabilities?: unknown } = { ...input };
          delete next.capabilities;
          if (packs !== undefined) {
            next.packs = packs;
          }
          return await deps.agents.create(scope, next);
        }),
    }),
    tool('agents_spawn', {
      group: 'agents',
      sideEffect: 'write',
      description:
        'Queue one-shot subcontracts: the graph then runs control:spawn. calls is [{ agentId, input }]. input is usually { messages: [{ role: "user", content: "<task>" }] }. Children cannot ask questions back (permission/approval/input tools are denied in child context); provide everything upfront. agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets fail here with the agent list. Prefer agents_list (reuse) before agents_create. This is not the tool name control:spawn.',
      input: {
        type: 'object',
        properties: {
          calls: {
            type: 'array',
            description: 'Child runs to start. Parent waits for all.',
            items: {
              type: 'object',
              properties: {
                agentId: {
                  type: 'string',
                  description: 'Target agent id from agents_list or agents_create',
                },
                input: {
                  description:
                    'Child run input. Typical: { "messages": [{ "role": "user", "content": "<task>" }] }',
                },
              },
              required: ['agentId'],
            },
          },
        },
        required: ['calls'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const rec = (raw ?? {}) as { calls?: unknown };
          if (!Array.isArray(rec.calls)) {
            return { error: 'calls must be an array' };
          }
          const shapeError = spawnCallsShapeError(rec.calls);
          if (shapeError) {
            return { error: shapeError };
          }
          const scope = deps.resolveScope();
          const rows = await deps.agents.list(scope);
          const targetError = spawnCallsTargetError(
            rec.calls,
            rows.map((row) => ({ id: row.id, name: row.name })),
          );
          if (targetError) {
            return { error: targetError };
          }
          return { calls: rec.calls };
        }),
    }),
    tool('agents_handoff', {
      group: 'agents',
      sideEffect: 'write',
      description:
        'Pass this thread to another agent (current speaker changes, origin stays). The graph then runs control:handoff. agentId from agents_list or agents_create. This is not the tool name control:handoff.',
      input: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Target agent id' },
        },
        required: ['agentId'],
      },
      execute: (raw) => {
        const rec = (raw ?? {}) as { agentId?: unknown };
        if (typeof rec.agentId !== 'string' || !rec.agentId) {
          return { error: 'agentId must be a non-empty string' };
        }
        return { agentId: rec.agentId };
      },
    }),
  ];
}
