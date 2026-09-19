import { formatAgentTargets, resolveAgentTarget } from '../../application/agent-target-resolve.ts';
import { parseSpawnBudget } from '../../application/graph-spawn.ts';
import type { AgentBudget, BudgetPolicy } from '../../domain/agent-definition.ts';
import type { AgentCatalogPatch, AgentCatalogSummary } from '../../ports/agents-catalog.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { scopeFor } from './scope-for.ts';

async function runGuard<T>(fn: () => Promise<T>): Promise<
  | T
  | {
      error: string;
    }
> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
function notYourDelegate(
  name: string,
  verb: 'updated' | 'removed',
): {
  error: string;
} {
  return {
    error: `"${name}" is not your delegate; only delegates created by you can be ${verb} here (top-level agents are managed in the workspace UI).`,
  };
}
type OwnedDelegate =
  | {
      row: AgentCatalogSummary;
    }
  | {
      error: string;
    };
function resolveOwnedDelegate(
  query: string,
  rows: AgentCatalogSummary[],
  currentAgentId: string,
  verb: 'updated' | 'removed',
): OwnedDelegate {
  const roster = rows.map((row) => ({ id: row.id, name: row.name }));
  const hit = resolveAgentTarget(query, roster);
  if ('error' in hit) {
    if (hit.error.startsWith('ambiguous')) {
      return hit;
    }
    const mine = rows
      .filter((row) => row.parentId === currentAgentId)
      .map((row) => ({ id: row.id, name: row.name }));
    const available = formatAgentTargets(mine) || '(none)';
    return {
      error:
        `unknown target "${query}": no such agent in your scope — it may be a typo, already deleted, or owned by another agent ` +
        `(top-level agents are managed in the workspace UI). Your delegates: ${available}`,
    };
  }
  const row = rows.find((r) => r.id === hit.id);
  if (!row) {
    return { error: `unknown target "${query}"` };
  }
  if (row.parentId !== currentAgentId) {
    return notYourDelegate(row.name, verb);
  }
  return { row };
}
type AgentsUpdateInput = {
  agentId?: unknown;
  name?: unknown;
  role?: unknown;
  instructions?: unknown;
  budget?: unknown;
};
const PATCH_STRING_FIELDS = ['name', 'role', 'instructions'] as const;
const BUDGET_LIMIT_FIELDS = ['maxSteps', 'maxTokens', 'deadlineMs'] as const;
function isBudgetPolicy(value: unknown): value is BudgetPolicy {
  return value === 'ask' || value === 'error';
}
function collectBudget(raw: unknown):
  | {
      budget: AgentBudget;
    }
  | {
      error: string;
    } {
  const rec =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const policy = rec?.policy;
  if (policy !== undefined && !isBudgetPolicy(policy)) {
    return { error: 'budget.policy must be ask or error' };
  }
  const hasLimit = rec !== null && BUDGET_LIMIT_FIELDS.some((key) => rec[key] !== undefined);
  if (rec && policy !== undefined && !hasLimit) {
    return { budget: { policy } };
  }
  const parsed = parseSpawnBudget(raw);
  if (parsed.error !== undefined) {
    return { error: parsed.error };
  }
  return { budget: { ...parsed.budget, ...(policy !== undefined ? { policy } : {}) } };
}
function collectPatch(input: AgentsUpdateInput):
  | {
      patch: AgentCatalogPatch;
    }
  | {
      error: string;
    } {
  const patch: AgentCatalogPatch = {};
  for (const key of PATCH_STRING_FIELDS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string' || !value) {
      return { error: `${key} must be a non-empty string` };
    }
    patch[key] = value;
  }
  if (input.budget !== undefined && input.budget !== null) {
    const collected = collectBudget(input.budget);
    if ('error' in collected) {
      return { error: collected.error };
    }
    patch.budget = collected.budget;
  }
  return { patch };
}
async function applyUpdate(
  deps: CreateAgentsToolsParams,
  raw: unknown,
  ctx: {
    agentId?: string;
  },
): Promise<
  | {
      agentId: string;
    }
  | {
      error: string;
    }
> {
  const patchFn = deps.agents.patch;
  if (!patchFn) {
    return { error: 'agents_update is not available in this host' };
  }
  const input = (raw ?? {}) as AgentsUpdateInput;
  if (typeof input.agentId !== 'string' || !input.agentId) {
    return { error: 'agentId must be a non-empty string' };
  }
  const scope = scopeFor(deps, ctx);
  const rows = await deps.agents.list(scope);
  const target = resolveOwnedDelegate(input.agentId, rows, scope.agentId, 'updated');
  if ('error' in target) {
    return target;
  }
  const collected = collectPatch(input);
  if ('error' in collected) {
    return collected;
  }
  if (Object.keys(collected.patch).length === 0) {
    return { error: 'nothing to update' };
  }
  await patchFn.call(deps.agents, scope, target.row.id, collected.patch);
  return { agentId: target.row.id };
}
async function applyDelete(
  deps: CreateAgentsToolsParams,
  raw: unknown,
  ctx: {
    agentId?: string;
  },
): Promise<
  | {
      removed: string;
      name: string;
    }
  | {
      error: string;
    }
> {
  const removeFn = deps.agents.remove;
  if (!removeFn) {
    return { error: 'agents_delete is not available in this host' };
  }
  const input = (raw ?? {}) as {
    agentId?: unknown;
  };
  if (typeof input.agentId !== 'string' || !input.agentId) {
    return { error: 'agentId must be a non-empty string' };
  }
  const scope = scopeFor(deps, ctx);
  const rows = await deps.agents.list(scope);
  const target = resolveOwnedDelegate(input.agentId, rows, scope.agentId, 'removed');
  if ('error' in target) {
    return target;
  }
  const res = await removeFn.call(deps.agents, scope, target.row.id);
  if ('error' in res) {
    return res;
  }
  return { removed: target.row.id, name: target.row.name };
}
const AGENT_ID_INPUT = {
  agentId: { type: 'string', description: 'Delegate id or name from agents_list' },
};
export function createAgentLifecycleTools(deps: CreateAgentsToolsParams): ToolDefinition[] {
  const lifecycle: ToolDefinition[] = [];
  if (deps.agents.patch) {
    lifecycle.push(
      tool('agents_update', {
        group: 'agents',
        operations: ['agents'],
        sideEffect: 'write',
        description:
          'Patch name/role/instructions/budget of your own delegate; graph and packs are owner-only (tools removed; use sources; workspace UI). ' +
          'agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets and agents you do not own fail here with an error. ' +
          'budget replaces the stored budget: omitted fields drop out. Same shape as agents_create: maxSteps/maxTokens/deadlineMs integers >= 1 and policy ask|error; at least one of them is required. ' +
          'At least one field besides agentId is required. Returns { agentId }.',
        input: {
          type: 'object',
          properties: {
            ...AGENT_ID_INPUT,
            name: { type: 'string', description: 'New display name' },
            role: { type: 'string', description: 'New role label (not unique)' },
            instructions: {
              type: 'string',
              description: 'New system instructions for the delegate',
            },
            budget: {
              type: 'object',
              description:
                'Run budget; replaces the stored budget (omitted fields drop out). At least one of maxSteps/maxTokens/deadlineMs/policy. Same shape as agents_create.',
              properties: {
                maxSteps: { type: 'integer', minimum: 1 },
                maxTokens: { type: 'integer', minimum: 1 },
                deadlineMs: { type: 'integer', minimum: 1 },
                policy: {
                  type: 'string',
                  enum: ['ask', 'error'],
                  description: 'Budget stop behavior; mirrors agents_create',
                },
              },
              additionalProperties: false,
            },
          },
          required: ['agentId'],
        },
        execute: (raw, ctx) => runGuard(() => applyUpdate(deps, raw, ctx)),
      }),
    );
  }
  if (deps.agents.remove) {
    lifecycle.push(
      tool('agents_delete', {
        group: 'agents',
        operations: ['agents'],
        sideEffect: 'write',
        description:
          'Remove your own delegate that is not running anywhere; workspace UI manages top-level agents. ' +
          'agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets and agents you do not own fail here with an error. ' +
          'Returns { removed, name }.',
        input: {
          type: 'object',
          properties: { ...AGENT_ID_INPUT },
          required: ['agentId'],
        },
        execute: (raw, ctx) => runGuard(() => applyDelete(deps, raw, ctx)),
      }),
    );
  }
  return lifecycle;
}
