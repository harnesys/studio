import { DEFAULT_PERMISSIONS } from '../constants.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { Event } from '../domain/snapshot.ts';
import type { AgentRosterEntry, AgentsResolve } from '../ports/create-runtime.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import { formatAgentTargets, resolveAgentTarget } from './agent-target-resolve.ts';
import { compileOrThrow } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import { emitHook, hookContextText, withHookContextPrefix } from './hooks/emit-hook.ts';
import { intersectPermissions } from './permissions.ts';
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

function resolveTargets(
  calls: SpawnCall[],
  agents: AgentsResolve,
  runAgentId: string,
): SpawnTarget[] {
  const out: SpawnTarget[] = [];
  const roster: AgentRosterEntry[] = agents.list?.() ?? [];
  for (const call of calls) {
    // Exact-id прямой resolve обходит фильтр видимости ростера: чужой делегат
    // (parentId задан и не равен runAgentId) трактуем как missing.
    // Нет записи в ростере или ростера нет вовсе → разрешаем: хост без roster
    // не даёт информации о владении (в т.ч. plugin-таргеты).
    const rosterEntry = roster.find((e) => e.id === call.agentId);
    const foreign =
      rosterEntry !== undefined &&
      rosterEntry.parentId != null &&
      rosterEntry.parentId !== runAgentId;
    let def = foreign ? undefined : agents.resolve(call.agentId);
    if (!def && rosterEntry === undefined && roster.length > 0) {
      const visible = roster.filter(
        (entry) => entry.parentId == null || entry.parentId === runAgentId,
      );
      const hit = resolveAgentTarget(call.agentId, visible);
      if ('error' in hit) {
        throw codedRunError('spawn_target_missing', hit.error);
      }
      def = agents.resolve(hit.id);
    }
    if (!def) {
      const suffix = roster.length > 0 ? `. Available agents: ${formatAgentTargets(roster)}` : '';
      throw codedRunError(
        'spawn_target_missing',
        `spawn target "${call.agentId}" not found${suffix}`,
      );
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
  const startOutcome = await emitHook(parent.hooks, 'SubagentStart', {
    agent_type: target.call.agentId,
  });
  // context-эффект стартового события доставляется в messages ребёнка.
  const childInput = withHookContextPrefix(target.call.input, hookContextText(startOutcome));
  const stopEvent = (): Promise<unknown> =>
    emitHook(parent.hooks, 'SubagentStop', { agent_type: target.call.agentId });
  const childState: RuntimeState = parent.state.child(target.spawnId);
  // У ребёнка нет модели — наследуем модель рана родителя (плагин-агенты с нерезолвной алиас-моделью).
  const childDef =
    target.def.model === undefined && parent.agent.model !== undefined
      ? { ...target.def, model: parent.agent.model }
      : target.def;
  const plan = compileOrThrow(childDef);
  const runRegistry = new Map(filterToolsForAgent(parent.toolRegistry, childDef));
  // Запрет вложенности на уровне движка: ребёнок не получает тулы пака agents.
  for (const [name, def] of runRegistry) {
    if (def.group === 'agents') {
      runRegistry.delete(name);
    }
  }
  runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  // События ребёнка на шину родителя не идут: жизнь сабагента покрывают
  // SubagentStart/SubagentStop.
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
    packOutputs: parent.packOutputs,
    skills: parent.skills,
    env: parent.env,
    agents: parent.agents,
    stream: parent.stream,
    childJournal: parent.childJournal,
    logger: parent.logger,
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
    return {
      agentId: target.call.agentId,
      spawnId: target.spawnId,
      output: childOutputFromState(rec),
      ...blockedProp(),
    };
  }
  // needs_input из ребёнка невозможен по построению; защита на случай обхода.
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
): PreparedSpawn {
  // Песочница: тулы пака agents вырезаны, но узлы control:spawn исполняются
  // и в кастомном графе ребёнка. Вложенный спавн запрещён на уровне движка.
  if (parent.sandbox) {
    throw codedRunError('spawn_in_sandbox', 'spawn is not allowed in a sandboxed run');
  }
  if (node.barrier !== undefined && node.barrier.policy !== 'all') {
    throw codedRunError('barrier_policy', 'barrier.policy must be "all"');
  }
  const rawCalls = evalExpr(node.calls, slots);
  const calls = parseCalls(rawCalls);
  const concurrency = resolveConcurrency(node.concurrency, slots);
  const targets = resolveTargets(calls, parent.agents, parent.agent.id);
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
