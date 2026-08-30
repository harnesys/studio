import Ajv from 'ajv';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { Plan } from './compile.ts';
import { evalExpr, evalWhen } from './expr-eval.ts';
import { applyReducer, findBind, isPort, type MergeStateFn } from './graph-helpers.ts';
import { mkEv, mkSnap, type SnapCtx } from './graph-snap.ts';
import { runLlmGenerate } from './llm.ts';
import { executeToolCall } from './tool-call.ts';

export type { MergeStateFn } from './graph-helpers.ts';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export type GraphOpts = {
  agent: AgentDefinition;
  input: unknown;
  state: RuntimeState;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  artifacts?: ArtifactStore;
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  plan: Plan;
  toolMessages: 'barrier' | 'ordered';
  mergeState?: MergeStateFn;
  signal?: AbortSignal;
  resumePayload?: unknown;
  startNodeId?: string;
  stream?: { chunkIntervalMs?: number; chunkSize?: number };
};

function resolveFallbackBindings(
  agent: AgentDefinition,
  models: ProviderConfig[] | ModelsPort,
): ModelBinding[] {
  const fallbacks = agent.fallback;
  if (!fallbacks || fallbacks.length === 0) {
    return [];
  }
  const bindings: ModelBinding[] = [];
  for (const ref of fallbacks) {
    if (isPort(models)) {
      continue;
    }
    const result = findBind(models as ProviderConfig[], ref, agent);
    if (result?.binding) {
      bindings.push(result.binding);
    }
  }
  return bindings;
}

export async function* startGraph(opts: GraphOpts): AsyncIterable<Event> {
  const loaded = await opts.state.load();
  const runId = loaded?.runId ?? crypto.randomUUID();
  let seq = loaded?.sequence ?? 0;
  const input = opts.input;
  const st: Record<string, unknown> = loaded
    ? { ...(loaded.state as Record<string, unknown>) }
    : {};
  if (!loaded && opts.agent.state?.initial) {
    const sl0 = { input, state: {} as Record<string, unknown>, output: null, resume: null };
    for (const [k, v] of Object.entries(opts.agent.state.initial)) {
      if (typeof v === 'string' && v.trim().startsWith('$')) {
        st[k] = evalExpr(v, sl0);
      } else {
        st[k] = v as unknown;
      }
    }
  }
  const startId = Object.entries(opts.plan.nodes).find(([, n]) => n.type === 'core:start')?.[0];
  if (!startId) {
    throw Object.assign(new Error('missing start'), { code: 'start_count' });
  }
  let cur = startId;
  if (loaded?.cursor) {
    const curAny = loaded.cursor as unknown as {
      currentNodeId?: string;
      nodes?: Record<string, { phase: string }>;
    };
    if (typeof curAny.currentNodeId === 'string') {
      cur = curAny.currentNodeId;
    } else if (curAny.nodes) {
      const e = Object.entries(curAny.nodes).find(([, v]) => v.phase === 'executing');
      if (e) {
        cur = e[0];
      }
    }
  }
  if (opts.resumePayload !== undefined && opts.startNodeId) {
    const interrupt = (loaded?.cursor as Record<string, unknown>)?.interrupt as
      | Record<string, unknown>
      | undefined;

    if (interrupt && opts.resumePayload !== undefined) {
      const existingPayload = (loaded?.state as Record<string, unknown>)?.$resume;
      if (existingPayload !== undefined) {
        if (canonicalJson(existingPayload) === canonicalJson(opts.resumePayload)) {
          return;
        }
        throw Object.assign(new Error('interrupt already resumed with different payload'), {
          code: 'already_resumed',
        });
      }
    }

    if (interrupt?.resumeSchema && opts.resumePayload !== undefined) {
      const ajv = new Ajv();
      const valid = ajv.validate(interrupt.resumeSchema as object, opts.resumePayload);
      if (!valid) {
        throw Object.assign(new Error(`resume payload validation failed: ${ajv.errorsText()}`), {
          code: 'resume_validation_failed',
        });
      }
    }

    cur = opts.startNodeId;
    st.$resume = opts.resumePayload;
  }
  let output: unknown = null;
  let steps = 0;
  let tokens = 0;
  const t0 = performance.now();
  let lastMsg: string | undefined;
  const nodeSteps = new Map<string, number>();
  const agentJson = JSON.stringify(opts.agent);
  const orderJson = JSON.stringify(opts.plan.order);
  const ctx = (): SnapCtx => ({
    sessionId: opts.state.sessionId,
    runId,
    seq,
    agentJson,
    orderJson,
    input,
    state: st,
    cur,
    steps,
    tokens,
    nodeStep: nodeSteps.get(cur) ?? 0,
  });
  const commit = async (
    status: string,
    type: string,
    kind: 'recorded' | 'intent' = 'recorded',
  ): Promise<Event> => {
    seq += 1;
    const ev: Event = { ...mkEv(ctx(), type), agentId: opts.agent.id };
    await opts.state.commit({ ...mkSnap(ctx(), status), sequence: seq }, [ev], {
      kind,
      sequence: seq,
    });
    return ev;
  };
  while (true) {
    if (opts.signal?.aborted) {
      const e = await commit('cancelled', 'run.cancelled');
      yield e;
      break;
    }
    const node = opts.plan.nodes[cur] as import('../domain/agent-definition.ts').Node | undefined;
    if (!node) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw Object.assign(new Error(`unknown node ${cur}`), { code: 'no_matching_edge' });
    }
    const slots = { input, state: st, output, resume: st.$resume ?? null };
    if (node.type === 'core:start') {
      output = { input };
      const e = await commit('running', 'node.completed');
      yield e;
    } else if (node.type === 'core:end') {
      let fin: unknown = output;
      if (typeof node.output === 'string') {
        try {
          fin = evalExpr(node.output, slots);
        } catch {
          fin = node.output;
        }
      } else if (node.output !== undefined) {
        fin = node.output;
      } else {
        const msgs = st.messages as unknown[] | undefined;
        if (Array.isArray(msgs) && msgs.length > 0) {
          fin = msgs[msgs.length - 1];
        }
      }
      output = fin;
      const e = await commit('completed', 'run.completed');
      yield e;
      break;
    } else if (node.type === 'llm:generate') {
      const ln = node as {
        type: 'llm:generate';
        prompt: string;
        messages?: string;
        tools?: string[];
        model?: string | { provider: string; model: string };
        output?: unknown;
      };
      if (ln.messages) {
        lastMsg = ln.messages;
      }
      let binding: import('../ports/models.ts').ModelBinding | null = null;
      if (isPort(opts.models)) {
        const ref = ln.model as string | { provider: string; model: string } | undefined;
        const prov =
          typeof ref === 'object' && ref !== null && 'provider' in ref
            ? (ref as { provider: string }).provider
            : 'default';
        const mname =
          typeof ref === 'string'
            ? ref
            : ((ref as { model?: string } | undefined)?.model ?? opts.agent.model?.model ?? '');
        if (mname) {
          try {
            binding = await (opts.models as ModelsPort).get(prov, mname);
          } catch {
            binding = null;
          }
        }
      } else {
        binding =
          findBind(opts.models as ProviderConfig[], ln.model as never, opts.agent)?.binding ?? null;
      }
      if (!binding) {
        const e = await commit('failed', 'run.failed');
        yield e;
        throw Object.assign(new Error('model_unresolved'), { code: 'model_unresolved' });
      }
      const fallbackBindings = resolveFallbackBindings(opts.agent, opts.models);
      const bindingsToTry = [binding, ...fallbackBindings];
      let lastError: unknown;
      let res: import('./llm.ts').LlmResult | undefined;
      for (let attempt = 0; attempt < bindingsToTry.length; attempt++) {
        const currentBinding = bindingsToTry[attempt];
        if (!currentBinding) {
          continue;
        }
        try {
          await commit('running', 'model.requested', 'recorded');
          const stream = runLlmGenerate(
            {
              type: 'llm:generate',
              prompt: ln.prompt,
              messages: ln.messages,
              tools: ln.tools,
              model: ln.model as never,
              output: ln.output,
            },
            {
              agent: opts.agent,
              state: st,
              input,
              output,
              modelBinding: currentBinding,
              toolRegistry: opts.toolRegistry,
              signal: opts.signal ?? new AbortController().signal,
            },
          );
          for await (const event of stream) {
            if (event.type === 'model.delta') {
              yield {
                ...mkEv(ctx(), 'model.delta'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.chunk') {
              await commit('running', 'model.chunk');
            } else if (event.type === 'model.completed') {
              res = event.data as import('./llm.ts').LlmResult;
            }
          }
          if (res) {
            lastError = undefined;
            break;
          }
        } catch (err) {
          lastError = err;
          if (attempt < bindingsToTry.length - 1) {
          }
        }
      }
      if (lastError) {
        throw lastError;
      }
      if (!res) {
        throw Object.assign(new Error('model completed without result'), {
          code: 'model_completed_without_result',
        });
      }
      output = res;
      if (lastMsg) {
        const key = lastMsg
          .trim()
          .replace(/^\$state\./, '')
          .split(/[.[]/)[0] as string;
        if (key) {
          let arr = st[key] as unknown[] | undefined;
          if (!Array.isArray(arr)) {
            const inp = input as { messages?: unknown };
            arr = Array.isArray(inp?.messages) ? [...(inp.messages as unknown[])] : [];
            st[key] = arr;
          }
          arr.push({
            role: 'assistant',
            content: res.text ?? '',
            toolCalls: res.toolCalls,
            finishReason: res.finishReason,
          });
        }
      }
      tokens += 1;
      const e = await commit('running', 'model.completed');
      yield e;
      if (res.finishReason === 'tool-calls') {
        await commit('running', 'tool.requested');
      }
    } else if (node.type === 'tool:call') {
      const tn = node as unknown as
        | import('../domain/agent-definition.ts').ToolCallFixed
        | import('../domain/agent-definition.ts').ToolCallBatch;
      const needsIntent = (() => {
        const names: string[] = 'name' in tn && tn.name ? [tn.name] : [];
        return names.some((n) => {
          const def = opts.toolRegistry.get(n);
          const se = def?.sideEffect;
          return se === 'financial' || se === 'destructive' || se === 'credentialed';
        });
      })();
      if (needsIntent) {
        await commit('running', 'tool.intent', 'intent');
      }
      let res: { results: import('./tool-call.ts').ToolCallResult[] };
      try {
        res = await executeToolCall(tn, {
          state: st,
          output,
          input,
          resume: st.$resume ?? null,
          toolRegistry: opts.toolRegistry,
          permissions: opts.permissions,
          paths: opts.paths,
          artifacts: opts.artifacts,
          signal: opts.signal ?? new AbortController().signal,
          runId,
          nodeId: cur,
          nodeExecutionId: `${runId}:${cur}:${steps}`,
          sessionId: opts.state.sessionId,
          toolMessages: opts.toolMessages,
          messagesPath: lastMsg,
          resumePayload: opts.resumePayload,
        });
      } catch (e) {
        if (e instanceof AskUserInterrupt) {
          const interruptId = e.interruptId ?? crypto.randomUUID();
          st.$resume = null;
          const snap = mkSnap(ctx(), 'needs_input');
          (snap.cursor as Record<string, unknown>).interrupt = {
            interruptId,
            reason: e.prompt,
            resumeSchema: e.resumeSchema ?? {
              type: 'object',
              properties: {
                text: { type: 'string' },
                optionIds: { type: 'array', items: { type: 'string' } },
              },
            },
            nodeId: cur,
            source: e.source ?? 'ask_user',
            tool: e.tool,
          };
          seq += 1;
          const ev: Event = { ...mkEv(ctx(), 'interrupt.triggered'), agentId: opts.agent.id };
          ev.metadata = {
            interruptId,
            reason: e.prompt,
            resumeSchema: e.resumeSchema,
            source: e.source ?? 'ask_user',
            tool: e.tool,
          };
          await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
          yield ev;
          break;
        }
        throw e;
      }
      output = { results: res.results };
      const e = await commit('running', 'tool.completed');
      yield e;
    } else if (node.type === 'control:assign') {
      const asn = node as { type: 'control:assign'; patch: Record<string, unknown> };
      const patched: string[] = [];
      for (const [k, v] of Object.entries(asn.patch)) {
        let ev: unknown = v;
        if (typeof v === 'string' && v.trim().startsWith('$')) {
          try {
            ev = evalExpr(v, slots);
          } catch {
            ev = v;
          }
        } else if (typeof v === 'string' && v.includes('{$')) {
          ev = v.replace(/\{\$[^}]+\}/g, (m) => {
            try {
              return String(evalExpr(m.slice(1, -1), slots));
            } catch {
              return m;
            }
          });
        }
        st[k] = applyReducer(k, st[k], ev, {
          reducers: opts.agent.state?.reducers,
          mergeState: opts.mergeState,
        });
        patched.push(k);
      }
      output = { patched };
      const e = await commit('running', 'node.completed');
      yield e;
    } else if (node.type === 'control:goto') {
      const g = node as { type: 'control:goto'; target: string };
      let tgt: unknown;
      try {
        tgt = evalExpr(g.target, slots);
      } catch (e) {
        const ev = await commit('failed', 'run.failed');
        yield ev;
        throw Object.assign(new Error((e as Error).message), { code: 'goto_target_missing' });
      }
      if (typeof tgt !== 'string' || !opts.plan.nodes[tgt]) {
        const ev = await commit('failed', 'run.failed');
        yield ev;
        throw Object.assign(new Error('goto_target_missing'), { code: 'goto_target_missing' });
      }
      cur = tgt;
      nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
      steps += 1;
      if (opts.agent.budget?.maxSteps !== undefined && steps >= opts.agent.budget.maxSteps) {
        const ev = await commit('budget_exceeded', 'run.failed');
        yield ev;
        break;
      }
      if (
        opts.agent.budget?.deadlineMs !== undefined &&
        performance.now() - t0 > opts.agent.budget.deadlineMs
      ) {
        const ev = await commit('budget_exceeded', 'run.failed');
        yield ev;
        break;
      }
      continue;
    } else if (node.type === 'control:interrupt') {
      const ir = node as {
        type: 'control:interrupt';
        reason: string;
        resumeSchema: import('../domain/json-schema.ts').JsonSchema;
      };
      const interruptId = crypto.randomUUID();
      st.$resume = null;
      const snap = mkSnap(ctx(), 'needs_input');
      (snap.cursor as Record<string, unknown>).interrupt = {
        interruptId,
        reason: ir.reason,
        resumeSchema: ir.resumeSchema,
        nodeId: cur,
      };
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), 'interrupt.triggered'), agentId: opts.agent.id };
      await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
      yield ev;
      break;
    } else {
      const e = await commit('running', 'node.completed');
      yield e;
    }
    nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
    steps += 1;
    if (opts.agent.budget?.maxSteps !== undefined && steps >= opts.agent.budget.maxSteps) {
      const e = await commit('budget_exceeded', 'run.failed');
      yield e;
      break;
    }
    if (
      opts.agent.budget?.deadlineMs !== undefined &&
      performance.now() - t0 > opts.agent.budget.deadlineMs
    ) {
      const e = await commit('budget_exceeded', 'run.failed');
      yield e;
      break;
    }
    const edges = opts.plan.edgesByFrom.get(cur) ?? [];
    let nxt: string | undefined;
    for (const ed of edges) {
      if (ed.when === undefined) {
        nxt = ed.to;
        break;
      }
      try {
        if (evalWhen(ed.when, slots)) {
          nxt = ed.to;
          break;
        }
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'unknown_path') {
          const e = await commit('failed', 'run.failed');
          yield e;
          throw err;
        }
      }
    }
    if (!nxt) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw Object.assign(new Error('no_matching_edge'), { code: 'no_matching_edge' });
    }
    cur = nxt;
    st.$resume = null;
  }
}
