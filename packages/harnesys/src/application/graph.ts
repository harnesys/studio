import Ajv from 'ajv';
import type {
  AgentDefinition,
  Node,
  ToolCallBatch,
  ToolCallFixed,
} from '../domain/agent-definition.ts';
import type { Attachment, AttachmentKind } from '../domain/attachment.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { Plan } from './compile.ts';
import { evalExpr } from './expr-eval.ts';
import { isSkippedEntry, matchOutgoing } from './graph-edges.ts';
import {
  applyReducer,
  findBind,
  isPort,
  type MergeStateFn,
  resolveModelForPort,
} from './graph-helpers.ts';
import { mkEv, mkSnap, type SnapCtx } from './graph-snap.ts';
import { type LlmResult, runLlmGenerate } from './llm.ts';
import { executeToolCall, type ToolCallResult } from './tool-call.ts';

export type { MergeStateFn } from './graph-helpers.ts';

function normalizeInputAttachments(input: unknown): {
  text?: string;
  attachments?: Attachment[];
  origin?: string;
} {
  if (typeof input === 'string') {
    return input ? { text: input } : {};
  }
  if (!input || typeof input !== 'object') {
    return {};
  }
  const rec = input as Record<string, unknown>;
  const text = typeof rec.text === 'string' ? rec.text : undefined;
  const origin = typeof rec.origin === 'string' ? rec.origin : undefined;
  const atts: Attachment[] = [];
  const pushFiles = (arr: unknown, kind: AttachmentKind) => {
    if (!Array.isArray(arr)) {
      return;
    }
    for (const f of arr as Record<string, unknown>[]) {
      const p = typeof f.path === 'string' ? f.path : '';
      if (!p) {
        continue;
      }
      atts.push({
        id: crypto.randomUUID(),
        kind,
        name: typeof f.name === 'string' && f.name ? f.name : (p.split(/[\\/]/).at(-1) ?? 'file'),
        mediaType: typeof f.mediaType === 'string' ? f.mediaType : '',
        path: p,
      });
    }
  };
  pushFiles(rec.images, 'image');
  pushFiles(rec.audio, 'audio');
  pushFiles(rec.video, 'video');
  pushFiles(rec.files, 'file');
  if (Array.isArray(rec.attachments)) {
    for (const a of rec.attachments as Record<string, unknown>[]) {
      const k = a.kind as AttachmentKind;
      if (k === 'image' || k === 'audio' || k === 'video' || k === 'file') {
        atts.push({
          id: typeof a.id === 'string' ? a.id : crypto.randomUUID(),
          kind: k,
          name: typeof a.name === 'string' ? a.name : 'file',
          mediaType: typeof a.mediaType === 'string' ? a.mediaType : '',
          path: typeof a.path === 'string' ? a.path : '',
        });
      }
    }
  }
  return {
    text: text || undefined,
    attachments: atts.length > 0 ? atts : undefined,
    origin: origin || undefined,
  };
}

function serializeToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
  resumeInterruptId?: string;
  startNodeId?: string;
  rejected?: boolean;
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
  if (isPort(models)) {
    return [];
  }
  const bindings: ModelBinding[] = [];
  for (const ref of fallbacks) {
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
  const isResumable = loaded?.status === 'needs_input' || loaded?.status === 'running';
  if (isResumable && loaded?.cursor) {
    const curAny = loaded.cursor as {
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
  let entryPending = false;
  if (opts.startNodeId && (opts.resumePayload !== undefined || opts.rejected === true)) {
    const interrupt = (loaded?.cursor as Record<string, unknown>)?.interrupt as
      | Record<string, unknown>
      | undefined;
    if (opts.resumePayload !== undefined && !opts.rejected && interrupt?.resumeSchema) {
      const ajv = new Ajv({ strict: false });
      const valid = ajv.validate(interrupt.resumeSchema as object, opts.resumePayload);
      if (!valid) {
        throw Object.assign(new Error(`resume payload validation failed: ${ajv.errorsText()}`), {
          code: 'resume_validation_failed',
        });
      }
    }
    cur = opts.startNodeId;
    if (opts.rejected) {
      delete st.$resume;
    } else {
      st.$resume = opts.resumePayload;
    }
    entryPending = true;
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
    metadata?: Record<string, unknown>,
  ): Promise<Event> => {
    seq += 1;
    const ev: Event = { ...mkEv(ctx(), type), agentId: opts.agent.id };
    if (metadata) {
      ev.metadata = { ...(ev.metadata as Record<string, unknown>), ...metadata };
    }
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
    const node = opts.plan.nodes[cur] as Node | undefined;
    if (!node) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw Object.assign(new Error(`unknown node ${cur}`), { code: 'no_matching_edge' });
    }
    const slots = { input, state: st, output, resume: st.$resume ?? null };

    if (entryPending && cur === opts.startNodeId) {
      entryPending = false;
      if (isSkippedEntry(node.type, opts.rejected)) {
        st.$resume = opts.rejected ? null : opts.resumePayload;
        const edgeSlots = { input, state: st, output, resume: st.$resume ?? null };
        let nxt: string | undefined;
        try {
          nxt = matchOutgoing(opts.plan.edgesByFrom.get(cur) ?? [], edgeSlots);
        } catch (err) {
          const e = await commit('failed', 'run.failed');
          yield e;
          throw err;
        }
        if (!nxt) {
          const e = await commit('failed', 'run.failed');
          yield e;
          throw Object.assign(new Error('no_matching_edge'), { code: 'no_matching_edge' });
        }
        cur = nxt;
        delete st.$resume;
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
        continue;
      }
    }

    if (node.type === 'core:start') {
      output = { input };
      if (input && typeof input === 'object') {
        const inpAny = input as Record<string, unknown>;
        const msgKey = 'messages';
        const normalized = normalizeInputAttachments(input);
        const hasUserContent = Boolean(normalized.text || normalized.attachments);
        if (hasUserContent) {
          let arr = st[msgKey] as unknown[] | undefined;
          if (!Array.isArray(arr)) {
            const m = inpAny.messages;
            arr = Array.isArray(m) ? [...(m as unknown[])] : [];
            st[msgKey] = arr;
          }
          const content = normalized.text ?? '';
          const userMsg: Record<string, unknown> = { role: 'user', content };
          if (normalized.attachments) {
            userMsg.attachments = normalized.attachments;
          }
          if (normalized.origin) {
            userMsg.origin = normalized.origin;
          }
          arr.push(userMsg);
          const meta: Record<string, unknown> = {};
          if (normalized.text) {
            meta.text = normalized.text;
          }
          if (normalized.attachments) {
            meta.attachments = normalized.attachments;
          }
          if (normalized.origin) {
            meta.origin = normalized.origin;
          }
          const ue = await commit('running', 'user.message', 'recorded', meta);
          yield ue;
        } else if (Array.isArray(inpAny.messages) && !Array.isArray(st[msgKey])) {
          st[msgKey] = [...(inpAny.messages as unknown[])];
        }
      } else if (typeof input === 'string' && input) {
        const msgKey = 'messages';
        let arr = st[msgKey] as unknown[] | undefined;
        if (!Array.isArray(arr)) {
          arr = [];
          st[msgKey] = arr;
        }
        arr.push({ role: 'user', content: input });
        const ue = await commit('running', 'user.message', 'recorded', { text: input });
        yield ue;
      }
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
      let doneText: string | undefined;
      if (typeof fin === 'object' && fin !== null && 'content' in fin) {
        doneText = String((fin as { content: unknown }).content ?? '');
      } else if (typeof fin === 'string') {
        doneText = fin;
      } else if (typeof (fin as { text?: unknown })?.text === 'string') {
        doneText = String((fin as { text: unknown }).text);
      }
      const e = await commit(
        'completed',
        'run.completed',
        'recorded',
        doneText ? { text: doneText } : undefined,
      );
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
      let binding: ModelBinding | null = null;
      let fallbackBindings: ModelBinding[] = [];
      if (isPort(opts.models)) {
        const coords = resolveModelForPort(
          ln.model as string | { provider: string; model: string } | undefined,
          opts.agent,
        );
        if (coords) {
          try {
            binding = await (opts.models as ModelsPort).get(coords.provider, coords.model);
          } catch {
            binding = null;
          }
        }
        if (opts.agent.fallback) {
          const fallbacks: ModelBinding[] = [];
          for (const fb of opts.agent.fallback) {
            const c = resolveModelForPort(fb, opts.agent);
            if (!c) {
              continue;
            }
            try {
              const b = await (opts.models as ModelsPort).get(c.provider, c.model);
              fallbacks.push(b);
            } catch {}
          }
          fallbackBindings = fallbacks;
        }
      } else {
        binding =
          findBind(opts.models as ProviderConfig[], ln.model as never, opts.agent)?.binding ?? null;
        fallbackBindings = resolveFallbackBindings(opts.agent, opts.models);
      }
      if (!binding) {
        const e = await commit('failed', 'run.failed');
        yield e;
        throw Object.assign(new Error('model_unresolved'), { code: 'model_unresolved' });
      }
      const bindingsToTry = [binding, ...fallbackBindings];
      let lastError: unknown;
      let res: LlmResult | undefined;
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
            } else if (event.type === 'model.reasoning') {
              yield {
                ...mkEv(ctx(), 'model.reasoning'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.reasoning-start') {
              yield {
                ...mkEv(ctx(), 'model.reasoning-start'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.reasoning-end') {
              yield {
                ...mkEv(ctx(), 'model.reasoning-end'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.tool-input-start') {
              yield {
                ...mkEv(ctx(), 'model.tool-input-start'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.tool-input-delta') {
              yield {
                ...mkEv(ctx(), 'model.tool-input-delta'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.tool-input-end') {
              yield {
                ...mkEv(ctx(), 'model.tool-input-end'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.tool-call') {
              yield {
                ...mkEv(ctx(), 'model.tool-call'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.source') {
              yield {
                ...mkEv(ctx(), 'model.source'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.file') {
              yield {
                ...mkEv(ctx(), 'model.file'),
                metadata: event.data as Record<string, unknown>,
                agentId: opts.agent.id,
              };
            } else if (event.type === 'model.chunk') {
              await commit(
                'running',
                'model.chunk',
                'recorded',
                event.data as Record<string, unknown>,
              );
            } else if (event.type === 'model.completed') {
              res = event.data as LlmResult;
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
            reasoning: res.reasoning,
            toolCalls: res.toolCalls,
            finishReason: res.finishReason,
            sources: res.sources,
            files: res.files,
            usage: res.usage,
          });
        }
      }
      if (res.usage && typeof res.usage === 'object') {
        const u = res.usage as Record<string, unknown>;
        const total = typeof u.totalTokens === 'number' ? u.totalTokens : undefined;
        if (typeof total === 'number') {
          tokens += total;
        } else {
          tokens += 1;
        }
      } else {
        tokens += 1;
      }
      const completedMeta: Record<string, unknown> = {};
      if (res.text) {
        completedMeta.text = res.text;
      }
      if (res.reasoning) {
        completedMeta.reasoning = res.reasoning;
      }
      if (res.usage) {
        completedMeta.usage = res.usage;
      }
      if (res.toolCalls) {
        completedMeta.toolCalls = res.toolCalls;
      }
      if (res.sources) {
        completedMeta.sources = res.sources;
      }
      if (res.files) {
        completedMeta.files = res.files;
      }
      completedMeta.finishReason = res.finishReason;
      const e = await commit('running', 'model.completed', 'recorded', completedMeta);
      yield e;
      if (res.finishReason === 'tool-calls') {
        await commit('running', 'tool.requested');
      }
    } else if (node.type === 'tool:call') {
      const tn = node as ToolCallFixed | ToolCallBatch;
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
      let res: { results: ToolCallResult[] };
      const outputBeforeBarrier = new Proxy((output as Record<string, unknown>) ?? {}, {
        get(target, prop, receiver) {
          if (prop === 'results') {
            throw Object.assign(new Error('$output.results not available before barrier'), {
              code: 'output_not_ready',
            });
          }
          return Reflect.get(target, prop, receiver);
        },
      });
      try {
        res = await executeToolCall(tn, {
          state: st,
          output: outputBeforeBarrier,
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
          resumeInterruptId: opts.resumeInterruptId,
        });
      } catch (e) {
        if (e instanceof AskUserInterrupt) {
          const interruptId = e.interruptId ?? crypto.randomUUID();
          delete (st as Record<string, unknown>).$resume;
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
      for (const r of res.results) {
        const outputStr = serializeToolResult(r.result);
        const meta: Record<string, unknown> = {
          toolCallId: r.id,
          name: r.name,
          output: outputStr,
        };
        // try to include input if available from toolCalls
        const callInput = (() => {
          if ('name' in tn && typeof tn.name === 'string') {
            const fixed = tn as ToolCallFixed;
            if (r.id === `${runId}:${cur}:0`) {
              return fixed.args;
            }
          }
          return undefined;
        })();
        if (callInput !== undefined) {
          meta.input = callInput;
        }
        const e = await commit(
          'running',
          r.isError ? 'tool.failed' : 'tool.completed',
          'recorded',
          meta,
        );
        yield e;
      }
      if (res.results.length === 0) {
        const e = await commit('running', 'tool.completed');
        yield e;
      }
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
        resumeSchema: JsonSchema;
      };
      const interruptId = crypto.randomUUID();
      delete (st as Record<string, unknown>).$resume;
      const snap = mkSnap(ctx(), 'needs_input');
      (snap.cursor as Record<string, unknown>).interrupt = {
        interruptId,
        reason: ir.reason,
        resumeSchema: ir.resumeSchema,
        nodeId: cur,
      };
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), 'interrupt.triggered'), agentId: opts.agent.id };
      ev.metadata = {
        interruptId,
        reason: ir.reason,
        resumeSchema: ir.resumeSchema,
      };
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
    const edgeSlots = { input, state: st, output, resume: st.$resume ?? null };
    let nxt: string | undefined;
    try {
      nxt = matchOutgoing(opts.plan.edgesByFrom.get(cur) ?? [], edgeSlots);
    } catch (err) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw err;
    }
    if (!nxt) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw Object.assign(new Error('no_matching_edge'), { code: 'no_matching_edge' });
    }
    cur = nxt;
    delete st.$resume;
  }
}
