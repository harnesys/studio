import { resolveAgentTarget } from '../../application/agent-target-resolve.ts';
import { parseSpawnBudget } from '../../application/graph-spawn.ts';
import type { AgentRosterEntry } from '../../ports/create-runtime.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';

function spawnCallsShapeError(calls: unknown[]): string | null {
  for (let idx = 0; idx < calls.length; idx += 1) {
    const item = calls[idx];
    const rec =
      item && typeof item === 'object'
        ? (item as {
            agentId?: unknown;
            budget?: unknown;
            input?: unknown;
          })
        : null;
    const agentId = rec?.agentId;
    if (typeof agentId !== 'string' || !agentId) {
      return `calls[${idx}].agentId must be a non-empty string`;
    }
    if (
      rec !== null &&
      typeof rec.input !== 'string' &&
      (typeof rec.input !== 'object' || rec.input === null)
    ) {
      return `calls[${idx}].input is required: { messages: [...] } or a plain string`;
    }
    const parsed = parseSpawnBudget(rec?.budget);
    if (parsed.error !== undefined) {
      return `calls[${idx}].${parsed.error}`;
    }
  }
  return null;
}
function spawnCallsTargetError(calls: unknown[], roster: AgentRosterEntry[]): string | null {
  for (const item of calls) {
    const agentId = (
      item as {
        agentId: string;
      }
    ).agentId;
    const hit = resolveAgentTarget(agentId, roster);
    if ('error' in hit) {
      return hit.error;
    }
  }
  return null;
}
export function spawnAgentTool(deps: CreateAgentsToolsParams): ToolDefinition {
  return tool('agents_spawn', {
    group: 'agents',
    sideEffect: 'write',
    description:
      'Queue one-shot subcontracts: the graph then runs control:spawn. calls is [{ agentId, input, budget? }] — budget {maxSteps?, maxTokens?, deadlineMs?} caps this child only; omit to inherit your own budget. input is required: { messages: [{ role: "user", content: "<task>" }] } or a plain string (one user message). Children cannot ask questions back — `ask`-gated calls, approvals and `ask_user` are denied in child context (pre-approve a delegate with an `allow` permissions map, or provide everything upfront). On budget exhaustion a child never fails: it closes with a report and the result carries budget { kind, limit, used, closingStep: true } (used may exceed limit by that closing report step). agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets fail here with the agent list. Prefer agents_list (reuse) before agents_create. This is not the tool name control:spawn.',
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
                  'Child run input (required): { "messages": [{ "role": "user", "content": "<task>" }] }, or a plain string — the engine wraps it into one user message. Arbitrary other shapes are the child graph\'s problem.',
                oneOf: [{ type: 'string' }, { type: 'object' }],
              },
              budget: {
                type: 'object',
                description:
                  'Optional child quota (maxSteps, maxTokens, deadlineMs >= 0), replaces the child budget entirely; defaults to inheriting yours. policy is ignored: a sandboxed child never asks and always closes with a report.',
                properties: {
                  maxSteps: {
                    type: 'number',
                    description: 'Node executions allowed for the child',
                  },
                  maxTokens: { type: 'number' },
                  deadlineMs: { type: 'number' },
                  policy: {
                    type: 'string',
                    enum: ['ask', 'error'],
                    description:
                      'Accepted and ignored: a sandboxed child never asks and always closes with a report.',
                  },
                },
                additionalProperties: false,
              },
            },
            required: ['agentId'],
          },
        },
      },
      required: ['calls'],
    },
    execute: async (raw, execCtx) =>
      runGuard(async () => {
        const rec = (raw ?? {}) as {
          calls?: unknown;
        };
        if (!Array.isArray(rec.calls)) {
          return { error: 'calls must be an array' };
        }
        if (rec.calls.length === 0) {
          return { error: 'no spawn calls provided' };
        }
        const shapeError = spawnCallsShapeError(rec.calls);
        if (shapeError) {
          return { error: shapeError };
        }
        const scope = scopeFor(deps, execCtx);
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
  });
}
