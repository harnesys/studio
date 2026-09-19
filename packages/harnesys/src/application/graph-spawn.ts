import { DEFAULT_PERMISSIONS } from '../constants.ts';
import type { AgentBudget, AgentDefinition } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { AgentRosterEntry, AgentsResolve } from '../ports/create-runtime.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { formatAgentTargets, resolveAgentTarget } from './agent-target-resolve.ts';
import { resolveCapabilitySet, sandboxUniverse } from './capability-set.ts';
import { compileOrThrow } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import { emitHook, hookContextText, withHookContextPrefix } from './hooks/emit-hook.ts';
import { intersectPermissions } from './permissions.ts';
import { type DeniedToolEntry, deniedToolsList } from './tool-approve-checkpoint.ts';
import { subtractDeniedTools } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';
export type SpawnCall = {
  agentId: string;
  spawnId?: string;
  input: unknown;
  budget?: AgentBudget;
};
export type SpawnBudgetHit = {
  kind: 'steps' | 'tokens' | 'deadline';
  limit: number;
  used: number;
  closingStep: true;
};
export type SpawnCallError = {
  code: string;
  message: string;
};
export type SpawnResultItem = {
  agentId: string;
  spawnId: string;
  output: unknown;
  error?: SpawnCallError;
  blocked?: DeniedToolEntry[];
  budget?: SpawnBudgetHit;
};
export type SpawnDeniedItem = SpawnResultItem & {
  error: SpawnCallError;
};
export type SpawnNodeSpec = {
  type: 'control:spawn';
  calls: Expr;
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: {
    policy: 'all';
  };
};
export type SpawnSlots = {
  input: unknown;
  state: Record<string, unknown>;
  output: unknown;
  resume: unknown;
};
export type SpawnNodeOutcome = {
  results: SpawnResultItem[];
  carried: SpawnResultItem[];
};
export type SpawnTarget = {
  call: SpawnCall;
  def: AgentDefinition;
  spawnId: string;
};
export type PreparedSpawn = {
  targets: SpawnTarget[];
  denied: SpawnDeniedItem[];
  carried: SpawnResultItem[];
  concurrency: 'parallel' | 'sequential';
};
type ChildRunner = (opts: GraphOpts) => AsyncIterable<Event>;
function resolveConcurrency(
  c: Expr | 'parallel' | 'sequential',
  slots: SpawnSlots,
): 'parallel' | 'sequential' {
  if (c === 'parallel' || c === 'sequential') {
    return c;
  }
  if (typeof c === 'string' && c.trim().startsWith('$')) {
    const val = evalExpr(c, slots);
    if (val === 'parallel' || val === 'sequential') {
      return val;
    }
    throw codedRunError('concurrency_invalid', `invalid concurrency ${String(val)}`);
  }
  throw codedRunError('concurrency_invalid', `invalid concurrency ${String(c)}`);
}
export function parseSpawnBudget(raw: unknown): {
  budget?: AgentBudget;
  error?: string;
} {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'budget must be an object' };
  }
  const rec = raw as Record<string, unknown>;
  const out: AgentBudget = {};
  let any = false;
  for (const key of ['maxSteps', 'maxTokens', 'deadlineMs'] as const) {
    const v = rec[key];
    if (v === undefined) {
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return { error: `budget.${key} must be a non-negative number` };
    }
    (out as Record<string, unknown>)[key] = v;
    any = true;
  }
  if (!any) {
    return { error: 'budget must set at least one limit' };
  }
  return { budget: out };
}
function parseCalls(raw: unknown): SpawnCall[] {
  if (!Array.isArray(raw)) {
    throw codedRunError('spawn_calls_shape', 'calls must be array');
  }
  return raw.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw codedRunError('spawn_calls_shape', `calls[${idx}] must be object`);
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.agentId !== 'string' || !rec.agentId) {
      throw codedRunError('spawn_calls_shape', `calls[${idx}].agentId must be string`);
    }
    const parsed = parseSpawnBudget(rec.budget);
    if (parsed.error !== undefined) {
      throw codedRunError('spawn_calls_shape', `calls[${idx}].${parsed.error}`);
    }
    return {
      agentId: rec.agentId,
      ...(typeof rec.spawnId === 'string' && rec.spawnId ? { spawnId: rec.spawnId } : {}),
      input: rec.input,
      ...(parsed.budget !== undefined ? { budget: parsed.budget } : {}),
    };
  });
}
type ResolvedTargets = {
  targets: SpawnTarget[];
  denied: SpawnDeniedItem[];
};
function resolveTargets(
  calls: SpawnCall[],
  agents: AgentsResolve,
  parent: AgentDefinition,
): ResolvedTargets {
  const runAgentId = parent.id;
  const targets: SpawnTarget[] = [];
  const denied: SpawnDeniedItem[] = [];
  const roster: AgentRosterEntry[] = agents.list?.(parent) ?? [];
  const deny = (agentId: string, message: string): void => {
    denied.push({
      agentId,
      spawnId: crypto.randomUUID(),
      output: null,
      error: { code: 'spawn_target_missing', message },
    });
  };
  for (const call of calls) {
    const rosterEntry = roster.find((e) => e.id === call.agentId);
    const foreign =
      rosterEntry !== undefined &&
      rosterEntry.parentId != null &&
      rosterEntry.parentId !== runAgentId;
    let def = foreign ? undefined : agents.resolve(call.agentId, parent);
    if (!def && rosterEntry === undefined && roster.length > 0) {
      const visible = roster.filter(
        (entry) => entry.parentId == null || entry.parentId === runAgentId,
      );
      const hit = resolveAgentTarget(call.agentId, visible);
      if ('error' in hit) {
        deny(call.agentId, hit.error);
        continue;
      }
      def = agents.resolve(hit.id, parent);
    }
    if (!def) {
      const available = roster.length > 0 ? formatAgentTargets(roster) : '(none)';
      deny(call.agentId, `unknown spawn target "${call.agentId}". Available agents: ${available}`);
      continue;
    }
    const spawnId = call.spawnId ?? crypto.randomUUID();
    targets.push({ call, def, spawnId });
  }
  return { targets, denied };
}
function spawnBudgetHit(
  snap: Snapshot | null | undefined,
  b: AgentBudget | undefined,
): SpawnBudgetHit | undefined {
  const cb = snap?.cursor.budget;
  if (b === undefined || cb === undefined) {
    return undefined;
  }
  if (b.maxSteps !== undefined && cb.steps >= b.maxSteps) {
    return { kind: 'steps', limit: b.maxSteps, used: cb.steps, closingStep: true };
  }
  if (b.maxTokens !== undefined && cb.tokens >= b.maxTokens) {
    return { kind: 'tokens', limit: b.maxTokens, used: cb.tokens, closingStep: true };
  }
  if (b.deadlineMs !== undefined) {
    const used = Date.now() - cb.startedAt;
    if (used >= b.deadlineMs) {
      return { kind: 'deadline', limit: b.deadlineMs, used, closingStep: true };
    }
  }
  return undefined;
}
function childOutputFromState(state: Record<string, unknown>): unknown {
  const msgs = state.messages;
  if (Array.isArray(msgs) && msgs.length > 0) {
    return msgs[msgs.length - 1];
  }
  return state;
}
async function runOneChild(
  parent: GraphOpts,
  target: SpawnTarget,
  runChild: ChildRunner,
): Promise<SpawnResultItem> {
  const startOutcome = await emitHook(parent.hooks, 'SubagentStart', {
    agent_type: target.call.agentId,
  });
  const childInput = withHookContextPrefix(target.call.input, hookContextText(startOutcome));
  const stopEvent = (): Promise<unknown> =>
    emitHook(parent.hooks, 'SubagentStop', { agent_type: target.call.agentId });
  const childState: RuntimeState = parent.state.child(target.spawnId);
  const modelInherited =
    target.def.model === undefined && parent.agent.model !== undefined
      ? { ...target.def, model: parent.agent.model }
      : target.def;
  const childBudget = target.call.budget ?? modelInherited.budget ?? parent.agent.budget;
  const childDef =
    childBudget === modelInherited.budget
      ? modelInherited
      : { ...modelInherited, budget: childBudget };
  const plan = compileOrThrow(childDef);
  let childPackOutputs = parent.packOutputs;
  let runRegistry: Map<string, ToolDefinition>;
  if (parent.universe !== undefined) {
    const childSet = resolveCapabilitySet(childDef, sandboxUniverse(parent.universe));
    if (childSet.fatal.length > 0) {
      parent.logger?.warn(
        `[capabilities] spawn ${target.call.agentId}: ${childSet.fatal.join('; ')}`,
      );
    }
    runRegistry = new Map(
      [...childSet.registry].map(([name, entry]) => [
        name,
        { ...entry.def, exposure: entry.exposure },
      ]),
    );
    childPackOutputs = childSet.packOutputs;
  } else {
    runRegistry = subtractDeniedTools(parent.toolRegistry, childDef);
    for (const [name, def] of runRegistry) {
      if (def.group === 'agents') {
        runRegistry.delete(name);
      }
    }
    runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  }
  const childOpts: GraphOpts = {
    agent: childDef,
    input: childInput,
    state: childState,
    permissions: intersectPermissions(
      target.def.permissions ?? DEFAULT_PERMISSIONS,
      parent.permissions ?? DEFAULT_PERMISSIONS,
    ),
    paths: parent.paths,
    artifacts: parent.artifacts,
    models: parent.models,
    toolRegistry: runRegistry,
    plan,
    toolMessages: parent.toolMessages,
    mergeState: parent.mergeState,
    signal: parent.signal,
    notes: parent.notes,
    packOutputs: childPackOutputs,
    universe: parent.universe,
    skills: parent.skills,
    env: parent.env,
    agents: parent.agents,
    stream: parent.stream,
    childJournal: parent.childJournal,
    logger: parent.logger,
    sandbox: true,
  };
  let blocked: DeniedToolEntry[] = [];
  const readBlocked = async (): Promise<void> => {
    try {
      const snap = await childState.load();
      blocked = deniedToolsList((snap?.state as Record<string, unknown>) ?? {});
    } catch {
      blocked = [];
    }
  };
  const blockedProp = (): {
    blocked?: DeniedToolEntry[];
  } => (blocked.length > 0 ? { blocked } : {});
  try {
    for await (const ev of runChild(childOpts)) {
      parent.childJournal?.(target.spawnId, ev);
    }
  } catch (err) {
    const code =
      err &&
      typeof err === 'object' &&
      typeof (
        err as {
          code?: unknown;
        }
      ).code === 'string'
        ? (
            err as {
              code: string;
            }
          ).code
        : 'spawn_child_failed';
    const message = err instanceof Error && err.message ? err.message : 'spawn child failed';
    await readBlocked();
    await stopEvent();
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: null,
      error: { code, message },
      ...blockedProp(),
    };
  }
  const snap = await childState.load();
  const status = snap?.status ?? 'failed';
  const rec = (snap?.state as Record<string, unknown>) ?? {};
  blocked = deniedToolsList(rec);
  if (status === 'completed') {
    await stopEvent();
    const over = spawnBudgetHit(snap, childBudget);
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: childOutputFromState(rec),
      ...(over !== undefined ? { budget: over } : {}),
      ...blockedProp(),
    };
  }
  if (status === 'needs_input') {
    await stopEvent();
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: null,
      error: {
        code: 'sandbox_blocked',
        message: `spawn child ended with status ${status}`,
      },
      ...blockedProp(),
    };
  }
  await stopEvent();
  return {
    agentId: target.call.agentId,
    spawnId: target.spawnId,
    output: null,
    error: {
      code: status,
      message: `spawn child ended with status ${status}`,
    },
    ...blockedProp(),
  };
}
export function prepareSpawn(
  node: SpawnNodeSpec,
  parent: GraphOpts,
  slots: SpawnSlots,
  done?: SpawnResultItem[],
): PreparedSpawn {
  if (parent.sandbox) {
    throw codedRunError('spawn_in_sandbox', 'spawn is not allowed in a sandboxed run');
  }
  if (node.barrier !== undefined && node.barrier.policy !== 'all') {
    throw codedRunError('barrier_policy', 'barrier.policy must be "all"');
  }
  const rawCalls = evalExpr(node.calls, slots);
  const calls = parseCalls(rawCalls);
  const doneResults = (done ?? []).filter((r) => calls.some((c) => c.spawnId === r.spawnId));
  const pendingCalls =
    doneResults.length > 0
      ? calls.filter((c) => !doneResults.some((r) => r.spawnId === c.spawnId))
      : calls;
  const concurrency = resolveConcurrency(node.concurrency, slots);
  const { targets, denied } = resolveTargets(pendingCalls, parent.agents, parent.agent);
  return { targets, denied, carried: doneResults, concurrency };
}
export async function executeSpawn(
  prepared: PreparedSpawn,
  parent: GraphOpts,
  runChild: ChildRunner,
  onChildDone?: (result: SpawnResultItem) => Promise<void> | void,
): Promise<SpawnNodeOutcome> {
  const { targets, concurrency, carried } = prepared;
  const results: SpawnResultItem[] = new Array(targets.length);
  const settleOne = async (i: number, t: SpawnTarget): Promise<void> => {
    const item = await runOneChild(parent, t, runChild);
    results[i] = item;
    await onChildDone?.(item);
  };
  if (concurrency === 'sequential') {
    for (let i = 0; i < targets.length; i += 1) {
      const t = targets[i];
      if (!t) {
        continue;
      }
      await settleOne(i, t);
    }
  } else {
    await Promise.all(targets.map((t, i) => settleOne(i, t)));
  }
  return { results, carried };
}
