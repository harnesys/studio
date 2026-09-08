import type { AgentDefinition } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { Event } from '../domain/snapshot.ts';
import type { AgentsResolve } from '../ports/create-runtime.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import { compileOrThrow } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import { type DeniedToolEntry, deniedToolsList } from './tool-approve-checkpoint.ts';
import { filterToolsForAgent } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';

export type SpawnCall = {
  agentId: string;
  input: unknown;
};

export type SpawnResultItem = {
  agentId: string;
  spawnId: string;
  output: unknown;
  error?: { code: string; message: string };
  blocked?: DeniedToolEntry[];
};

export type SpawnEmission = {
  type: 'agent.completed' | 'agent.failed';
  metadata: {
    agentId: string;
    spawnId: string;
    code?: string;
    message?: string;
  };
};

export type SpawnNodeSpec = {
  type: 'control:spawn';
  calls: Expr;
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: { policy: 'all' };
};

export type SpawnSlots = {
  input: unknown;
  state: Record<string, unknown>;
  output: unknown;
  resume: unknown;
};

export type SpawnNodeOutcome = {
  results: SpawnResultItem[];
  emissions: SpawnEmission[];
};

export type SpawnTarget = {
  call: SpawnCall;
  def: AgentDefinition;
  spawnId: string;
};

export type PreparedSpawn = {
  targets: SpawnTarget[];
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
    return { agentId: rec.agentId, input: rec.input };
  });
}

function resolveTargets(calls: SpawnCall[], agents: AgentsResolve): SpawnTarget[] {
  const out: SpawnTarget[] = [];
  for (const call of calls) {
    const def = agents.resolve(call.agentId);
    if (!def) {
      throw codedRunError('spawn_target_missing', `spawn target "${call.agentId}" not found`);
    }
    out.push({ call, def, spawnId: crypto.randomUUID() });
  }
  return out;
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
  const childState: RuntimeState = parent.state.child(target.spawnId);
  const plan = compileOrThrow(target.def);
  const runRegistry = new Map(filterToolsForAgent(parent.toolRegistry, target.def));
  runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  const childOpts: GraphOpts = {
    agent: target.def,
    input: target.call.input,
    state: childState,
    permissions: parent.permissions,
    paths: parent.paths,
    artifacts: parent.artifacts,
    models: parent.models,
    toolRegistry: runRegistry,
    plan,
    toolMessages: parent.toolMessages,
    mergeState: parent.mergeState,
    signal: parent.signal,
    notes: parent.notes,
    capabilityRegistrations: parent.capabilityRegistrations,
    agents: parent.agents,
    stream: parent.stream,
    childJournal: parent.childJournal,
    // Песочница включается жёстко: вложенные спавны наследуют deny-режим,
    // флаг родителя не копируется.
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
  const blockedProp = (): { blocked?: DeniedToolEntry[] } =>
    blocked.length > 0 ? { blocked } : {};
  try {
    for await (const ev of runChild(childOpts)) {
      parent.childJournal?.(target.spawnId, ev);
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'spawn_child_failed';
    const message = err instanceof Error && err.message ? err.message : 'spawn child failed';
    await readBlocked();
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
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: childOutputFromState(rec),
      ...blockedProp(),
    };
  }
  // needs_input из ребёнка невозможен по построению; защита на случай обхода.
  if (status === 'needs_input') {
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
): PreparedSpawn {
  if (node.barrier !== undefined && node.barrier.policy !== 'all') {
    throw codedRunError('barrier_policy', 'barrier.policy must be "all"');
  }
  const rawCalls = evalExpr(node.calls, slots);
  const calls = parseCalls(rawCalls);
  const concurrency = resolveConcurrency(node.concurrency, slots);
  const targets = resolveTargets(calls, parent.agents);
  return { targets, concurrency };
}

export async function executeSpawn(
  prepared: PreparedSpawn,
  parent: GraphOpts,
  runChild: ChildRunner,
): Promise<SpawnNodeOutcome> {
  const { targets, concurrency } = prepared;
  const emissions: SpawnEmission[] = [];
  const results: SpawnResultItem[] = new Array(targets.length);
  if (concurrency === 'sequential') {
    for (let i = 0; i < targets.length; i += 1) {
      const t = targets[i];
      if (!t) {
        continue;
      }
      results[i] = await runOneChild(parent, t, runChild);
    }
  } else {
    const settled = await Promise.all(targets.map((t) => runOneChild(parent, t, runChild)));
    for (let i = 0; i < settled.length; i += 1) {
      results[i] = settled[i] as SpawnResultItem;
    }
  }

  for (const item of results) {
    if (item.error) {
      emissions.push({
        type: 'agent.failed',
        metadata: {
          agentId: item.agentId,
          spawnId: item.spawnId,
          code: item.error.code,
          message: item.error.message,
        },
      });
    } else {
      emissions.push({
        type: 'agent.completed',
        metadata: { agentId: item.agentId, spawnId: item.spawnId },
      });
    }
  }

  return { results, emissions };
}
