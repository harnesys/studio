import { MAP_ITEM_LIMIT } from '../constants.ts';
import type { AgentDefinition, AgentGraph, Node } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { Plan } from './compile.ts';
import { compileOrThrow } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import { mkSnap, type SnapCtx } from './graph-snap.ts';

export type MapNodeSpec = {
  type: 'control:map';
  items: Expr;
  enter: string;
  body: string[];
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: { policy: 'all' };
  timeoutMs?: number;
  onTimeout?: 'fail' | 'partial';
};

export type MapResultItem = {
  index: number;
  item: unknown;
  output: unknown | null;
  error?: { code: string; message: string };
};

export type MapEmission = {
  type: 'map.item.completed' | 'map.item.failed';
  metadata: { nodeId: string; index: number; code?: string; message?: string };
};

export type MapNodeOutcome = {
  results: MapResultItem[];
  emissions: MapEmission[];
  timedOut: boolean;
};

export type MapSlots = {
  input: unknown;
  state: Record<string, unknown>;
  output: unknown;
  resume: unknown;
};

const MAP_START_ID = '__map_start';

function resolveConcurrency(
  c: Expr | 'parallel' | 'sequential',
  slots: MapSlots,
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

function buildWorkerGraph(parent: AgentGraph, enter: string, body: string[]): AgentGraph {
  const bodySet = new Set(body);
  const nodes: Record<string, Node> = {
    [MAP_START_ID]: { type: 'core:start' },
  };
  for (const id of body) {
    const n = parent.nodes[id];
    if (!n) {
      throw codedRunError('map_body_unknown', `map body id "${id}" not in nodes`);
    }
    if (n.type === 'control:yield') {
      nodes[id] = {
        type: 'core:end',
        ...(n.value !== undefined ? { output: n.value } : {}),
      };
    } else {
      nodes[id] = n;
    }
  }
  const edges = [
    { from: MAP_START_ID, to: enter },
    ...parent.edges.filter((e) => bodySet.has(e.from) && bodySet.has(e.to)),
  ];
  return { nodes, edges };
}

function workerOutputFromState(state: Record<string, unknown>, snap: Snapshot | null): unknown {
  if (snap?.status === 'completed') {
    const msgs = state.messages;
    if (Array.isArray(msgs) && msgs.length > 0) {
      return msgs[msgs.length - 1];
    }
    return state;
  }
  return null;
}

type SeedWorkerArgs = {
  child: RuntimeState;
  parentState: Record<string, unknown>;
  parentOpts: GraphOpts;
  runId: string;
  item: unknown;
  index: number;
};

async function seedWorkerState(args: SeedWorkerArgs): Promise<void> {
  const { child, parentState, parentOpts, runId, item, index } = args;
  const parentSnap = await parentOpts.state.load();
  const state = structuredClone(parentState) as Record<string, unknown>;
  const msgs = Array.isArray(state.messages) ? [...(state.messages as unknown[])] : [];
  const itemText = typeof item === 'string' ? item : JSON.stringify(item, null, 2);
  msgs.push({
    role: 'user',
    content: `Map item [${index}]:\n${itemText}\n\nRespond with the result for this item only.`,
  });
  state.messages = msgs;
  const ctx: SnapCtx = {
    sessionId: child.sessionId,
    runId,
    seq: 0,
    agentJson: JSON.stringify(parentOpts.agent),
    orderJson: JSON.stringify(parentOpts.plan.order),
    input: parentOpts.input,
    state,
    cur: MAP_START_ID,
    steps: 0,
    tokens: 0,
    startedAt: Date.now(),
    nodeStep: 0,
  };
  const snap = mkSnap(ctx, 'running');
  if (parentSnap?.definitionHash) {
    snap.definitionHash = parentSnap.definitionHash;
  }
  if (parentSnap?.planHash) {
    snap.planHash = parentSnap.planHash;
  }
  await child.commit(snap, [], { kind: 'recorded', sequence: 0 });
}

type ChildRunner = (opts: GraphOpts) => AsyncIterable<Event>;

type RunWorkerArgs = {
  parent: GraphOpts;
  index: number;
  item: unknown;
  workerDef: AgentDefinition;
  workerPlan: Plan;
  parentState: Record<string, unknown>;
  runChild: ChildRunner;
  signal: AbortSignal;
};

async function runOneWorker(args: RunWorkerArgs): Promise<MapResultItem> {
  const { parent, index, item, workerDef, workerPlan, parentState, runChild, signal } = args;
  const workerId = crypto.randomUUID();
  const child = parent.state.child(workerId);
  const runId = crypto.randomUUID();
  await seedWorkerState({ child, parentState, parentOpts: parent, runId, item, index });
  const childOpts: GraphOpts = {
    agent: workerDef,
    input: parent.input,
    inputRecorded: true,
    state: child,
    permissions: parent.permissions,
    paths: parent.paths,
    artifacts: parent.artifacts,
    models: parent.models,
    toolRegistry: parent.toolRegistry,
    plan: workerPlan,
    toolMessages: parent.toolMessages,
    mergeState: parent.mergeState,
    signal,
    notes: parent.notes,
    packOutputs: parent.packOutputs,
    agents: parent.agents,
    stream: parent.stream,
    childJournal: parent.childJournal,
    logger: parent.logger,
    sandbox: true,
    mapContext: { item, index },
  };
  try {
    for await (const ev of runChild(childOpts)) {
      parent.childJournal?.(workerId, ev);
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'map_worker_failed';
    const message = err instanceof Error && err.message ? err.message : 'map worker failed';
    return { index, item, output: null, error: { code, message } };
  }
  const snap = await child.load();
  const rec = (snap?.state as Record<string, unknown>) ?? {};
  const status = snap?.status ?? 'failed';
  if (status === 'completed') {
    return { index, item, output: workerOutputFromState(rec, snap) };
  }
  if (status === 'cancelled' || signal.aborted) {
    return {
      index,
      item,
      output: null,
      error: { code: 'timeout', message: 'map worker aborted' },
    };
  }
  return {
    index,
    item,
    output: null,
    error: { code: status, message: `map worker ended with status ${status}` },
  };
}

export type PreparedMap = {
  items: unknown[];
  concurrency: 'parallel' | 'sequential';
  workerDef: AgentDefinition;
  workerPlan: Plan;
  timeoutMs?: number;
  onTimeout: 'fail' | 'partial';
  nodeId: string;
};

export function prepareMap(
  node: MapNodeSpec,
  parent: GraphOpts,
  slots: MapSlots,
  nodeId: string,
): PreparedMap {
  if (node.barrier !== undefined && node.barrier.policy !== 'all') {
    throw codedRunError('barrier_policy', 'barrier.policy must be "all"');
  }
  const raw = evalExpr(node.items, slots);
  if (!Array.isArray(raw)) {
    throw codedRunError('map_items_shape', 'map items must be an array');
  }
  if (raw.length > MAP_ITEM_LIMIT) {
    throw codedRunError('map_item_limit', `map items exceed limit ${MAP_ITEM_LIMIT}`);
  }
  const concurrency = resolveConcurrency(node.concurrency, slots);
  const graph = buildWorkerGraph(parent.agent.graph, node.enter, node.body);
  const workerDef: AgentDefinition = {
    ...parent.agent,
    graph,
    // Workers share parent budget wall via abort; avoid nested ask on child budget.
    budget: parent.agent.budget
      ? { ...parent.agent.budget, policy: 'error' }
      : { maxSteps: 50, policy: 'error' },
  };
  const workerPlan = compileOrThrow(workerDef);
  const onTimeout = node.onTimeout ?? 'fail';
  return {
    items: raw,
    concurrency,
    workerDef,
    workerPlan,
    timeoutMs: node.timeoutMs,
    onTimeout,
    nodeId,
  };
}

export async function executeMap(
  prepared: PreparedMap,
  parent: GraphOpts,
  parentState: Record<string, unknown>,
  runChild: ChildRunner,
): Promise<MapNodeOutcome> {
  const { items, concurrency, workerDef, workerPlan, timeoutMs, onTimeout, nodeId } = prepared;
  const emissions: MapEmission[] = [];
  const results: MapResultItem[] = new Array(items.length);
  if (items.length === 0) {
    return { results: [], emissions: [], timedOut: false };
  }

  const ac = new AbortController();
  const onParentAbort = (): void => ac.abort(parent.signal?.reason);
  parent.signal?.addEventListener('abort', onParentAbort, { once: true });
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      ac.abort('map_timeout');
    }, timeoutMs);
  }

  const runIdx = (index: number): Promise<MapResultItem> =>
    runOneWorker({
      parent,
      index,
      item: items[index],
      workerDef,
      workerPlan,
      parentState,
      runChild,
      signal: ac.signal,
    });

  try {
    if (concurrency === 'sequential') {
      for (let i = 0; i < items.length; i += 1) {
        if (ac.signal.aborted) {
          for (let j = i; j < items.length; j += 1) {
            results[j] = {
              index: j,
              item: items[j],
              output: null,
              error: { code: 'timeout', message: 'map timed out' },
            };
          }
          break;
        }
        results[i] = await runIdx(i);
      }
    } else {
      const settled = await Promise.all(items.map((_, i) => runIdx(i)));
      for (let i = 0; i < settled.length; i += 1) {
        results[i] = settled[i] as MapResultItem;
      }
    }
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    parent.signal?.removeEventListener('abort', onParentAbort);
  }

  for (const item of results) {
    if (!item) {
      continue;
    }
    if (item.error) {
      emissions.push({
        type: 'map.item.failed',
        metadata: {
          nodeId,
          index: item.index,
          code: item.error.code,
          message: item.error.message,
        },
      });
    } else {
      emissions.push({
        type: 'map.item.completed',
        metadata: { nodeId, index: item.index },
      });
    }
  }

  if (timedOut && onTimeout === 'fail') {
    throw codedRunError('map_timeout', `map timed out after ${timeoutMs}ms`);
  }

  return { results: results.filter(Boolean), emissions, timedOut };
}
