/** `agents_handoff` for the `agents` pack: the thread moves only between
 *  top-level agents. Targets with no model are refused here: the rebinding
 *  would strand the next run on `model_unresolved` (the graph-handoff node
 *  carries the same guard as a fallback, with the identical message). */
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { resolveHandoffTarget } from './handoff-target.ts';

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function createAgentsHandoffTool(deps: CreateAgentsToolsParams): ToolDefinition {
  return tool('agents_handoff', {
    group: 'agents',
    sideEffect: 'write',
    description:
      'Pass this thread to another agent (current speaker changes, origin stays). The graph then runs control:handoff. agentId from agents_list or agents_create. This is not the tool name control:handoff. Top-level agents only; delegates must be run via agents_spawn.',
    input: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Target agent id' },
      },
      required: ['agentId'],
    },
    execute: async (raw) =>
      runGuard(async () => {
        const id = ((raw ?? {}) as { agentId?: unknown }).agentId;
        if (typeof id !== 'string' || !id) {
          return { error: 'agentId must be a non-empty string' };
        }
        const scope = deps.resolveScope();
        const rows = await deps.agents.list(scope);
        const target = resolveHandoffTarget(id, rows, scope.agentId);
        if ('error' in target) {
          return target;
        }
        const def = await deps.agents.get(scope, target.agentId);
        if (def && !def.model && !def.models) {
          const name = rows.find((row) => row.id === target.agentId)?.name ?? target.agentId;
          return {
            error: `"${name}" has no model configured; handoff would strand the thread. Set its model in the workspace UI first.`,
          };
        }
        return target;
      }),
  });
}
