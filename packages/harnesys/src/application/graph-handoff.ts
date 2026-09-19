import type { AgentDefinition } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { resolveCapabilitySet } from './capability-set.ts';
import { compileOrThrow, type Plan } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import { subtractDeniedTools } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';
export type HandoffNodeSpec = {
  type: 'control:handoff';
  agentId: string | Expr;
  input: Expr | Record<string, Expr | unknown>;
};
export type HandoffSlots = {
  input: unknown;
  state: Record<string, unknown>;
  output: unknown;
  resume: unknown;
};
export type HandoffEmission = {
  type: 'agent.handoff';
  metadata: {
    agentId: string;
    handoff: true;
  };
};
export type HandoffPrepareResult = {
  agent: AgentDefinition;
  plan: Plan;
  input: unknown;
  toolRegistry: Map<string, ToolDefinition>;
  startNodeId: string;
  emission: HandoffEmission;
};
function evalHandoffValue(v: unknown, slots: HandoffSlots): unknown {
  if (typeof v === 'string' && v.trim().startsWith('$')) {
    return evalExpr(v, slots);
  }
  return v;
}
function evalHandoffInput(
  raw: Expr | Record<string, Expr | unknown>,
  slots: HandoffSlots,
): unknown {
  if (typeof raw === 'string') {
    return evalHandoffValue(raw, slots);
  }
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = evalHandoffValue(v, slots);
  }
  return out;
}
function resolveAgentId(raw: string | Expr, slots: HandoffSlots): string {
  const val = evalHandoffValue(raw, slots);
  if (typeof val !== 'string' || !val) {
    throw codedRunError('handoff_target', `handoff agentId must be string, got ${String(val)}`);
  }
  return val;
}
export function prepareHandoff(
  node: HandoffNodeSpec,
  parent: GraphOpts,
  slots: HandoffSlots,
): HandoffPrepareResult {
  if (parent.sandbox) {
    throw codedRunError('handoff_in_sandbox', 'handoff is not allowed in a sandboxed run');
  }
  const agentId = resolveAgentId(node.agentId, slots);
  if (agentId === parent.agent.id) {
    throw codedRunError('handoff_self', 'handoff onto the current speaker is not allowed');
  }
  const entry = parent.agents.list?.(parent.agent)?.find((e) => e.id === agentId);
  if (entry?.parentId != null) {
    throw codedRunError('handoff_target', `handoff onto a delegate is not allowed: ${agentId}`);
  }
  const def = parent.agents.resolve(agentId, parent.agent);
  if (!def) {
    throw codedRunError('handoff_target', `handoff target "${agentId}" not found`);
  }
  if (!def.model && !def.models) {
    throw codedRunError(
      'handoff_model_unresolved',
      `"${agentId}" has no model configured; handoff would strand the thread. Set its model in the workspace UI first.`,
    );
  }
  const plan = compileOrThrow(def);
  const startNodeId = Object.entries(plan.nodes).find(([, n]) => n.type === 'core:start')?.[0];
  if (!startNodeId) {
    throw codedRunError('start_count', `handoff target "${agentId}" missing start`);
  }
  let toolRegistry: Map<string, ToolDefinition>;
  if (parent.universe !== undefined) {
    const targetSet = resolveCapabilitySet(def, parent.universe);
    if (targetSet.fatal.length > 0) {
      parent.logger?.warn(`[capabilities] handoff ${agentId}: ${targetSet.fatal.join('; ')}`);
    }
    toolRegistry = new Map(
      [...targetSet.registry].map(([name, entry]) => [
        name,
        { ...entry.def, exposure: entry.exposure },
      ]),
    );
  } else {
    toolRegistry = subtractDeniedTools(parent.toolRegistry, def);
    toolRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(toolRegistry));
  }
  return {
    agent: def,
    plan,
    input: evalHandoffInput(node.input, slots),
    toolRegistry,
    startNodeId,
    emission: {
      type: 'agent.handoff',
      metadata: { agentId: def.id, handoff: true },
    },
  };
}
