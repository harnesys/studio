import { PASSTHROUGH_MODEL_EVENTS } from '../constants.ts';
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
import type { AgentsResolve } from '../ports/create-runtime.ts';
import type { Logger } from '../ports/logger.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { runSummaryPassIfDue } from './compaction/run.ts';
import type { Plan } from './compile.ts';
import type { Slots } from './expr-eval.ts';
import { evalExpr } from './expr-eval.ts';
import {
  appendAssistantNote,
  appendMapResultsMessage,
  appendSpawnResultsMessage,
  applyAgentControlToolResults,
  clearQueuedHandoff,
  clearQueuedMap,
  clearQueuedSpawns,
  clearQueuedWait,
} from './graph-agent-controls.ts';
import { isSkippedEntry, matchOutgoing } from './graph-edges.ts';
import { type HandoffNodeSpec, prepareHandoff } from './graph-handoff.ts';
import {
  applyReducer,
  findBind,
  isPort,
  type MergeStateFn,
  resolveModelForPort,
  stateKeyOf,
} from './graph-helpers.ts';
import { executeMap, type MapNodeSpec, prepareMap } from './graph-map.ts';
import { mkEv, mkSnap, type SnapCtx } from './graph-snap.ts';
import { executeSpawn, prepareSpawn, type SpawnNodeSpec } from './graph-spawn.ts';
import { prepareWait, type WaitNodeSpec } from './graph-wait.ts';
import { emitHook, type HookEmitCtx, hookContextText, resolveHookCtx } from './hooks/emit-hook.ts';
import { type LlmResult, runLlmGenerate } from './llm.ts';
import {
  type BudgetLeft,
  budgetNote,
  type LlmNote,
  type LlmNoteContext,
  type LlmNoteProvider,
} from './llm-notes.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import { printPackDiagnostics, selectPackOutputs } from './packs/pack-run.ts';
import { executeToolCall, type ToolCallResult } from './tool-call.ts';
import { sandboxDenyText } from './tool-permission.ts';

export type { MergeStateFn } from './graph-helpers.ts';

function isApprovedFalse(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      (payload as { approved?: unknown }).approved === false,
  );
}

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
  const seenPaths = new Set<string>();
  if (Array.isArray(rec.attachments)) {
    for (const a of rec.attachments as Record<string, unknown>[]) {
      const k = a.kind as AttachmentKind;
      if (k === 'image' || k === 'audio' || k === 'video' || k === 'file') {
        const path = typeof a.path === 'string' ? a.path : '';
        if (path) {
          seenPaths.add(path);
        }
        atts.push({
          id: typeof a.id === 'string' ? a.id : crypto.randomUUID(),
          kind: k,
          name: typeof a.name === 'string' ? a.name : 'file',
          mediaType: typeof a.mediaType === 'string' ? a.mediaType : '',
          path,
        });
      }
    }
  }
  const pushFiles = (arr: unknown, kind: AttachmentKind) => {
    if (!Array.isArray(arr)) {
      return;
    }
    for (const f of arr as Record<string, unknown>[]) {
      const p = typeof f.path === 'string' ? f.path : '';
      if (!p || seenPaths.has(p)) {
        continue;
      }
      seenPaths.add(p);
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
  outputHint?: unknown;
  notes?: LlmNoteProvider[];
  packOutputs?: PackRunMap;
  /** FS skill registry; the catalog section is rendered per agent in llm.ts. */
  skills?: SkillRegistry;
  /** Готовый env рана для tool-процессов (PATH = RunTarget.binDirs ++ process PATH);
   *  отсутствие — тулы наследуют process env. */
  env?: Record<string, string>;
  /** Шина хуков рана; идентичность резолвится в startGraph. */
  hooks?: HookEmitCtx;
  rejected?: boolean;
  /** Ввод уже записан в лог (SessionHandle.send): core:start не коммитит user.message. */
  inputRecorded?: boolean;
  stream?: { chunkIntervalMs?: number; chunkSize?: number };
  agents: AgentsResolve;
  /** Вызывается из drain-цикла дочернего графа для каждого события ребёнка;
   *  engine пишет в журнал треда под runId = spawnId. */
  childJournal?: (spawnId: string, ev: Event) => void;
  /** Дочерний ран: ни один interrupt-источник не паркует ран, гейты отвечают deny. */
  sandbox?: boolean;
  /** control:map worker context for $item / $index. */
  mapContext?: { item: unknown; index: number };
  logger?: Logger;
};

function graphSlots(
  opts: GraphOpts,
  st: Record<string, unknown>,
  input: unknown,
  output: unknown,
): Slots {
  const slots: Slots = {
    input,
    state: st,
    output,
    resume: st.$resume ?? null,
  };
  if (opts.mapContext) {
    slots.item = opts.mapContext.item;
    slots.index = opts.mapContext.index;
  }
  return slots;
}

async function resolveFallbackBindings(
  agent: AgentDefinition,
  models: ProviderConfig[] | ModelsPort,
): Promise<ModelBinding[]> {
  const fallbacks = agent.fallback;
  if (!fallbacks || fallbacks.length === 0) {
    return [];
  }
  const bindings: ModelBinding[] = [];
  for (const ref of fallbacks) {
    if (isPort(models)) {
      const coords = resolveModelForPort(ref, agent);
      if (!coords) {
        continue;
      }
      try {
        bindings.push(await (models as ModelsPort).get(coords.provider, coords.model));
      } catch {}
    } else {
      const result = findBind(models as ProviderConfig[], ref, agent);
      if (result?.binding) {
        bindings.push(result.binding);
      }
    }
  }
  return bindings;
}

export async function* startGraph(opts: GraphOpts): AsyncIterable<Event> {
  let agent = opts.agent;
  let plan = opts.plan;
  let input = opts.input;
  let toolRegistry = opts.toolRegistry;
  let inputRecorded = opts.inputRecorded === true;
  let caps = selectPackOutputs(agent, opts.packOutputs ?? new Map());
  printPackDiagnostics(caps.diagnostics, opts.logger);
  const loaded = await opts.state.load();
  const runId = loaded?.runId ?? crypto.randomUUID();
  let seq = loaded?.sequence ?? 0;
  const st: Record<string, unknown> = loaded
    ? { ...(loaded.state as Record<string, unknown>) }
    : {};
  if (!loaded && agent.state?.initial) {
    const sl0 = { input, state: {} as Record<string, unknown>, output: null, resume: null };
    for (const [k, v] of Object.entries(agent.state.initial)) {
      if (typeof v === 'string' && v.trim().startsWith('$')) {
        st[k] = evalExpr(v, sl0);
      } else {
        st[k] = v as unknown;
      }
    }
  }
  const startId = Object.entries(plan.nodes).find(([, n]) => n.type === 'core:start')?.[0];
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
  let compactionAttempted = false;
  if (opts.startNodeId && (opts.resumePayload !== undefined || opts.rejected === true)) {
    cur = opts.startNodeId;
    if (opts.rejected) {
      delete st.$resume;
    } else {
      st.$resume = opts.resumePayload;
    }
    entryPending = true;
  }
  const interruptSource = loaded?.cursor?.interrupt?.source;
  let output: unknown = opts.startNodeId === undefined ? null : (opts.outputHint ?? null);
  // Шина рана с живой идентичностью: дальше по графу используется только она.
  const hooks = resolveHookCtx(opts.hooks, {
    sessionId: opts.state.sessionId,
    runId,
    agentId: agent.id,
    threadId: opts.state.sessionId,
    cwd: opts.paths?.cwd ?? '',
  });
  // SessionStart открывает ран: context-эффект доставляется через notes-канал.
  const hookNotes: LlmNote[] = [];
  const sessionStart = await emitHook(hooks, 'SessionStart', {
    source: isResumable ? 'resume' : 'startup',
  });
  const sessionStartContext = hookContextText(sessionStart);
  if (sessionStartContext !== undefined) {
    hookNotes.push({ tag: 'hooks', text: sessionStartContext });
  }
  // Бюджет живёт внутри одного запуска: новый запрос (статус completed/failed)
  // начинает отсчёт заново, а прерванный (needs_input/running) продолжает —
  // иначе дедлайн последнего рана срабатывает мгновенно при следующем сообщении.
  let steps = isResumable ? (loaded?.cursor?.budget?.steps ?? 0) : 0;
  let tokens = isResumable ? (loaded?.cursor?.budget?.tokens ?? 0) : 0;
  let t0 = isResumable ? (loaded?.cursor?.budget?.startedAt ?? Date.now()) : Date.now();
  let lastMsg: string | undefined;
  const nodeSteps = new Map<string, number>();
  let agentJson = JSON.stringify(agent);
  let orderJson = JSON.stringify(plan.order);
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
    startedAt: t0,
    nodeStep: nodeSteps.get(cur) ?? 0,
  });
  const commit = async (
    status: string,
    type: string,
    kind: 'recorded' | 'intent' = 'recorded',
    metadata?: Record<string, unknown>,
  ): Promise<Event> => {
    seq += 1;
    const ev: Event = { ...mkEv(ctx(), type), agentId: agent.id };
    if (metadata) {
      ev.metadata = { ...(ev.metadata as Record<string, unknown>), ...metadata };
    }
    await opts.state.commit({ ...mkSnap(ctx(), status), sequence: seq }, [ev], {
      kind,
      sequence: seq,
    });
    return ev;
  };
  type BudgetOver = { kind: 'steps' | 'tokens' | 'deadline'; limit: number; used: number };

  function budgetOver(): BudgetOver | null {
    const b = agent.budget;
    if (!b) {
      return null;
    }
    if (b.maxSteps !== undefined && steps >= b.maxSteps) {
      return { kind: 'steps', limit: b.maxSteps, used: steps };
    }
    if (b.maxTokens !== undefined && tokens >= b.maxTokens) {
      return { kind: 'tokens', limit: b.maxTokens, used: tokens };
    }
    if (b.deadlineMs !== undefined && Date.now() - t0 > b.deadlineMs) {
      return { kind: 'deadline', limit: b.deadlineMs, used: Date.now() - t0 };
    }
    return null;
  }

  function budgetReason(over: BudgetOver): string {
    if (over.kind === 'steps') {
      return `Step budget of ${over.limit} reached`;
    }
    if (over.kind === 'tokens') {
      return `Token budget of ${over.limit} reached`;
    }
    return `Deadline of ${over.limit}ms exceeded`;
  }

  async function budgetStop(over: BudgetOver): Promise<Event> {
    if ((agent.budget?.policy ?? 'error') === 'ask') {
      const interruptId = `budget/${runId}/${cur}/${steps}`;
      delete (st as Record<string, unknown>).$resume;
      const resumeSchema = {
        type: 'object',
        properties: { approved: { type: 'boolean' }, reason: { type: 'string' } },
      } as JsonSchema;
      const snap = mkSnap(ctx(), 'needs_input');
      (snap.cursor as Record<string, unknown>).interrupt = {
        interruptId,
        reason: budgetReason(over),
        resumeSchema,
        nodeId: cur,
        source: 'budget',
        output,
      };
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), 'interrupt.triggered'), agentId: agent.id };
      ev.metadata = { interruptId, reason: budgetReason(over), resumeSchema, source: 'budget' };
      await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
      return ev;
    }
    return commit('budget_exceeded', 'run.failed', 'recorded', {
      code: 'budget_exceeded',
      kind: over.kind,
      limit: over.limit,
      used: over.used,
    });
  }

  // Песочничный ребёнок: бюджет — условие сдачи, а не отказа. Оверран не валит
  // ран, а вооружает единственный закрывающий generate без тулов; штатный путь
  // — снимок тулов на последнем шаге (wrapDue) и отчёт вместо нового вызова.
  let closingArmed = false;
  // Две супрессии: арминг (оверран до/между узлов) и чек после закрывающего
  // generate. Третья — не графовый путь к отчёту, а петля: прежнее поведение.
  let wrapSuppressions = 0;
  function isSandboxWrap(): boolean {
    if (opts.sandbox !== true || wrapSuppressions >= 2) {
      return false;
    }
    if (Object.values(plan.nodes).every((n) => n.type !== 'llm:generate')) {
      return false;
    }
    wrapSuppressions += 1;
    closingArmed = true;
    return true;
  }
  function wrapDue(): boolean {
    if (opts.sandbox !== true || agent.budget === undefined) {
      return false;
    }
    if (closingArmed) {
      return true;
    }
    const b = agent.budget;
    return b.maxSteps !== undefined && b.maxSteps - steps <= 1;
  }

  function budgetLeftForPrompt(): BudgetLeft | undefined {
    const b = agent.budget;
    if (!b) {
      return undefined;
    }
    const out: BudgetLeft = {};
    let any = false;
    if (b.maxSteps !== undefined) {
      out.stepsLeft = Math.max(0, b.maxSteps - steps);
      out.stepsTotal = b.maxSteps;
      any = true;
    }
    if (b.maxTokens !== undefined) {
      out.tokensLeft = Math.max(0, b.maxTokens - tokens);
      out.tokensTotal = b.maxTokens;
      any = true;
    }
    if (b.deadlineMs !== undefined) {
      out.msLeft = Math.max(0, b.deadlineMs - (Date.now() - t0));
      any = true;
    }
    return any ? out : undefined;
  }
  while (true) {
    if (opts.signal?.aborted) {
      const e = await commit('cancelled', 'run.cancelled');
      yield e;
      break;
    }
    const node = plan.nodes[cur] as Node | undefined;
    if (!node) {
      const e = await commit('failed', 'run.failed');
      yield e;
      throw Object.assign(new Error(`unknown node ${cur}`), { code: 'no_matching_edge' });
    }
    const slots = graphSlots(opts, st, input, output);

    if (entryPending && cur === opts.startNodeId) {
      entryPending = false;
      if (
        interruptSource === 'budget' &&
        (opts.rejected === true || isApprovedFalse(opts.resumePayload))
      ) {
        const e = await commit('cancelled', 'run.cancelled', 'recorded', {
          reason: 'budget_exceeded',
        });
        yield e;
        break;
      }
      if (interruptSource === 'budget') {
        steps = 0;
        tokens = 0;
        t0 = Date.now();
      }
      if (isSkippedEntry(node.type, opts.rejected, interruptSource)) {
        st.$resume = opts.rejected ? null : opts.resumePayload;
        if (node.type === 'control:wait') {
          const timedOut =
            opts.resumePayload !== undefined &&
            typeof opts.resumePayload === 'object' &&
            opts.resumePayload !== null &&
            (opts.resumePayload as { timedOut?: unknown }).timedOut === true;
          clearQueuedWait(st);
          yield await commit('running', 'wait.resumed', 'recorded', {
            nodeId: cur,
            timedOut,
            source: interruptSource === 'timer' ? 'timer' : 'respond',
          });
        }
        const edgeSlots = graphSlots(opts, st, input, output);
        let nxt: string | undefined;
        try {
          nxt = matchOutgoing(plan.edgesByFrom.get(cur) ?? [], edgeSlots);
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
        const over = budgetOver();
        if (over && !isSandboxWrap()) {
          yield await budgetStop(over);
          break;
        }
        continue;
      }
    }

    await emitHook(hooks, 'NodeStart', { node: { id: cur, type: node.type } });
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
          const ups = await emitHook(hooks, 'UserPromptSubmit', { message: content });
          if (ups?.blocked) {
            // Блок UserPromptSubmit: промпт не обрабатывается (паритет Claude).
            const e = await commit('failed', 'run.failed', 'recorded', {
              code: 'user_prompt_blocked',
              message: ups.blocked.reason,
            });
            yield e;
            break;
          }
          const upsContext = hookContextText(ups);
          const hookPrefix = upsContext !== undefined ? `[hooks]\n${upsContext}\n\n` : '';
          const userMsg: Record<string, unknown> = {
            role: 'user',
            content: `${hookPrefix}${content}`,
          };
          if (normalized.attachments) {
            userMsg.attachments = normalized.attachments;
          }
          if (normalized.origin) {
            userMsg.origin = normalized.origin;
          }
          arr.push(userMsg);
          if (!inputRecorded) {
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
          }
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
        const ups = await emitHook(hooks, 'UserPromptSubmit', { message: input });
        if (ups?.blocked) {
          // Блок UserPromptSubmit: промпт не обрабатывается (паритет Claude).
          const e = await commit('failed', 'run.failed', 'recorded', {
            code: 'user_prompt_blocked',
            message: ups.blocked.reason,
          });
          yield e;
          break;
        }
        const upsContext = hookContextText(ups);
        const hookPrefix = upsContext !== undefined ? `[hooks]\n${upsContext}\n\n` : '';
        arr.push({ role: 'user', content: `${hookPrefix}${input}` });
        if (!inputRecorded) {
          const ue = await commit('running', 'user.message', 'recorded', { text: input });
          yield ue;
        }
      }
      const e = await commit('running', 'node.completed');
      yield e;
    } else if (node.type === 'core:end') {
      // Финал Graph-рана агентом: точка события Stop.
      await emitHook(hooks, 'Stop', {});
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
          agent,
        );
        if (coords) {
          try {
            binding = await (opts.models as ModelsPort).get(coords.provider, coords.model);
          } catch {
            binding = null;
          }
        }
      } else {
        binding =
          findBind(opts.models as ProviderConfig[], ln.model as never, agent)?.binding ?? null;
      }
      fallbackBindings = await resolveFallbackBindings(agent, opts.models);
      if (!binding) {
        const e = await commit('failed', 'run.failed');
        yield e;
        throw Object.assign(new Error('model_unresolved'), { code: 'model_unresolved' });
      }
      if (!compactionAttempted) {
        compactionAttempted = true;
        for await (const ev of runSummaryPassIfDue({
          agent: agent,
          state: st,
          sessionId: opts.state.sessionId,
          binding,
          models: opts.models,
          toolRegistry: toolRegistry,
          paths: opts.paths,
          signal: opts.signal ?? new AbortController().signal,
          logger: opts.logger,
          hooks,
        })) {
          if (ev.type === 'completed') {
            const m = ev.message;
            const u = m.stats.usage as Record<string, unknown> | undefined;
            tokens +=
              typeof u?.totalTokens === 'number' && Number.isFinite(u.totalTokens)
                ? u.totalTokens
                : (typeof u?.inputTokens === 'number' ? u.inputTokens : 0) +
                  (typeof u?.outputTokens === 'number' ? u.outputTokens : 0);
            const e = await commit('running', 'compaction.completed', 'recorded', {
              id: m.id,
              coveredFrom: m.coveredFrom,
              coveredUntil: m.coveredUntil,
              reason: m.reason,
              tokensBefore: m.stats.tokensBefore,
              tokensAfter: m.stats.tokensAfter,
            });
            yield e;
          } else if (ev.type === 'failed') {
            const e = await commit('running', 'compaction.failed', 'recorded', { error: ev.error });
            yield e;
          } else if (PASSTHROUGH_MODEL_EVENTS.has(ev.type)) {
            yield {
              ...mkEv(ctx(), ev.type),
              metadata: ev.data as Record<string, unknown>,
              agentId: agent.id,
            };
          }
        }
      }
      const bindingsToTry = [binding, ...fallbackBindings];
      let lastError: unknown;
      let res: LlmResult | undefined;
      let usedModel = '';
      let startedAt = 0;
      for (let attempt = 0; attempt < bindingsToTry.length; attempt++) {
        const currentBinding = bindingsToTry[attempt];
        if (!currentBinding) {
          continue;
        }
        try {
          await commit('running', 'model.requested', 'recorded');
          usedModel = currentBinding.model.name;
          startedAt = Date.now();
          const notes: LlmNote[] = [];
          const wrap = wrapDue();
          const left = budgetLeftForPrompt();
          if (left) {
            notes.push(budgetNote(left, wrap));
          } else if (wrap) {
            notes.push(budgetNote({}, true));
          }
          // Deferred-эффекты асинхронных хуков дренируются перед обращением
          // к модели; hookNotes (SessionStart + deferred context) — sticky.
          if (hooks) {
            for (const eff of hooks.bus.drainDeferred()) {
              if (eff.kind === 'context') {
                hookNotes.push({ tag: 'hooks', text: eff.text });
              }
            }
          }
          notes.push(...hookNotes);
          const notesErrors: string[] = [];
          if (opts.notes?.length || caps.enabled.length > 0) {
            const noteCtx: LlmNoteContext = {
              agentId: agent.id,
              runId,
              sessionId: opts.state.sessionId,
              nodeId: cur,
              steps,
              state: st,
            };
            for (const provider of opts.notes ?? []) {
              try {
                notes.push(...(await provider(noteCtx)));
              } catch (e) {
                notesErrors.push(`${cur}: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            for (const c of caps.enabled) {
              for (const provider of c.notes) {
                try {
                  notes.push(...(await provider(noteCtx)));
                } catch (e) {
                  notesErrors.push(`${cur}: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }
          }
          const stream = runLlmGenerate(
            {
              type: 'llm:generate',
              prompt: ln.prompt,
              messages: ln.messages,
              // песочничная обёртка: последний шаг без тулов — только отчёт
              tools: wrap ? [] : ln.tools,
              model: ln.model as never,
              output: ln.output,
            },
            {
              agent: agent,
              state: st,
              input,
              output,
              modelBinding: currentBinding,
              toolRegistry: toolRegistry,
              signal: opts.signal ?? new AbortController().signal,
              notes,
              notesErrors,
              packOutputs: caps.enabled,
              skills: opts.skills,
              artifacts: opts.artifacts,
              paths: opts.paths,
              hooks,
              steps,
            },
          );
          for await (const event of stream) {
            if (PASSTHROUGH_MODEL_EVENTS.has(event.type)) {
              yield {
                ...mkEv(ctx(), event.type),
                metadata: event.data as Record<string, unknown>,
                agentId: agent.id,
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
        const key = stateKeyOf(lastMsg);
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
        const total =
          typeof u.totalTokens === 'number' && Number.isFinite(u.totalTokens)
            ? u.totalTokens
            : (typeof u.inputTokens === 'number' ? u.inputTokens : 0) +
              (typeof u.outputTokens === 'number' ? u.outputTokens : 0);
        tokens += total;
      }
      const completedMeta: Record<string, unknown> = {};
      if (usedModel) {
        completedMeta.model = usedModel;
      }
      if (startedAt > 0) {
        completedMeta.durationMs = Date.now() - startedAt;
      }
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
          const def = toolRegistry.get(n);
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
          toolRegistry: toolRegistry,
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
          sandbox: opts.sandbox,
          toolOutput: agent.toolOutput,
          hooks,
          env: opts.env,
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
            output,
          };
          seq += 1;
          const ev: Event = { ...mkEv(ctx(), 'interrupt.triggered'), agentId: agent.id };
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
      applyAgentControlToolResults(res.results, st);
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
          reducers: agent.state?.reducers,
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
      if (typeof tgt !== 'string' || !plan.nodes[tgt]) {
        const ev = await commit('failed', 'run.failed');
        yield ev;
        throw Object.assign(new Error('goto_target_missing'), { code: 'goto_target_missing' });
      }
      cur = tgt;
      nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
      steps += 1;
      const over = budgetOver();
      if (over && !isSandboxWrap()) {
        yield await budgetStop(over);
        break;
      }
      continue;
    } else if (node.type === 'control:interrupt') {
      const ir = node as {
        type: 'control:interrupt';
        reason: string;
        resumeSchema: JsonSchema;
      };
      // Песочница: парковаться некому — ошибка ребёнка вместо needs_input.
      if (opts.sandbox) {
        const message = sandboxDenyText('interrupt', 'user input');
        const e = await commit('failed', 'run.failed', 'recorded', {
          code: 'sandbox_blocked',
          message,
        });
        yield e;
        throw Object.assign(new Error(message), { code: 'sandbox_blocked' });
      }
      const interruptId = crypto.randomUUID();
      delete (st as Record<string, unknown>).$resume;
      const snap = mkSnap(ctx(), 'needs_input');
      (snap.cursor as Record<string, unknown>).interrupt = {
        interruptId,
        reason: ir.reason,
        resumeSchema: ir.resumeSchema,
        nodeId: cur,
        source: 'interrupt',
        output,
      };
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), 'interrupt.triggered'), agentId: agent.id };
      ev.metadata = {
        interruptId,
        reason: ir.reason,
        resumeSchema: ir.resumeSchema,
      };
      await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
      yield ev;
      break;
    } else if (node.type === 'control:spawn') {
      let spawnOutcome: Awaited<ReturnType<typeof executeSpawn>>;
      try {
        const prepared = prepareSpawn(
          node as SpawnNodeSpec,
          { ...opts, agent, plan, input, toolRegistry },
          slots,
        );
        for (const t of prepared.targets) {
          const e = await commit('running', 'agent.spawned', 'recorded', {
            agentId: t.call.agentId,
            spawnId: t.spawnId,
            taskInput: t.call.input,
          });
          yield e;
        }
        spawnOutcome = await executeSpawn(
          prepared,
          { ...opts, agent, plan, input, toolRegistry, hooks },
          startGraph,
        );
      } catch (err) {
        const code =
          err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'spawn_failed';
        const message = err instanceof Error && err.message ? err.message : 'spawn failed';
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
      for (const emission of spawnOutcome.emissions) {
        const e = await commit('running', emission.type, 'recorded', emission.metadata);
        yield e;
      }
      output = spawnOutcome.results;
      appendSpawnResultsMessage(st, lastMsg, spawnOutcome.results);
      clearQueuedSpawns(st);
      const e = await commit('running', 'node.completed');
      yield e;
    } else if (node.type === 'control:handoff') {
      let prepared: ReturnType<typeof prepareHandoff>;
      try {
        prepared = prepareHandoff(
          node as HandoffNodeSpec,
          { ...opts, agent, plan, input, toolRegistry },
          slots,
        );
      } catch (err) {
        const code =
          err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'handoff_target';
        const message = err instanceof Error && err.message ? err.message : 'handoff failed';
        clearQueuedHandoff(st);
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
      yield await commit('running', prepared.emission.type, 'recorded', prepared.emission.metadata);
      agent = prepared.agent;
      plan = prepared.plan;
      input = prepared.input;
      toolRegistry = prepared.toolRegistry;
      inputRecorded = false;
      caps = selectPackOutputs(agent, opts.packOutputs ?? new Map());
      printPackDiagnostics(caps.diagnostics, opts.logger);
      agentJson = JSON.stringify(agent);
      orderJson = JSON.stringify(plan.order);
      output = { agentId: prepared.agent.id };
      clearQueuedHandoff(st);
      appendAssistantNote(
        st,
        lastMsg,
        'Thread handed off to you. You own the conversation from here.',
      );
      yield await commit('running', 'node.completed');
      cur = prepared.startNodeId;
      nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
      steps += 1;
      const overHandoff = budgetOver();
      if (overHandoff && !isSandboxWrap()) {
        yield await budgetStop(overHandoff);
        break;
      }
      continue;
    } else if (node.type === 'control:map') {
      try {
        const prepared = prepareMap(
          node as MapNodeSpec,
          { ...opts, agent, plan, input, toolRegistry },
          slots,
          cur,
        );
        yield await commit('running', 'map.started', 'recorded', {
          nodeId: cur,
          count: prepared.items.length,
          concurrency: prepared.concurrency,
        });
        const mapIter = executeMap(
          prepared,
          { ...opts, agent, plan, input, toolRegistry, hooks },
          st,
          startGraph,
        );
        let mapStep = await mapIter.next();
        while (!mapStep.done) {
          yield await commit('running', mapStep.value.type, 'recorded', mapStep.value.metadata);
          mapStep = await mapIter.next();
        }
        const mapOutcome = mapStep.value;
        output = { results: mapOutcome.results };
        appendMapResultsMessage(st, lastMsg, mapOutcome.results);
        clearQueuedMap(st);
        yield await commit('running', 'map.completed', 'recorded', {
          nodeId: cur,
          ok: mapOutcome.results.filter((r) => !r.error).length,
          failed: mapOutcome.results.filter((r) => r.error).length,
          timedOut: mapOutcome.timedOut || undefined,
        });
      } catch (err) {
        clearQueuedMap(st);
        const code =
          err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'map_failed';
        const message = err instanceof Error && err.message ? err.message : 'map failed';
        if (code === 'map_timeout') {
          const e = await commit('timed_out', 'run.failed', 'recorded', { code, message });
          yield e;
          break;
        }
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
    } else if (node.type === 'control:wait') {
      if (opts.sandbox) {
        const message = sandboxDenyText('wait', 'user input');
        const e = await commit('failed', 'run.failed', 'recorded', {
          code: 'sandbox_blocked',
          message,
        });
        yield e;
        throw Object.assign(new Error(message), { code: 'sandbox_blocked' });
      }
      let preparedWait: ReturnType<typeof prepareWait>;
      try {
        preparedWait = prepareWait(node as WaitNodeSpec, slots);
      } catch (err) {
        const code =
          err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'wait_failed';
        const message = err instanceof Error && err.message ? err.message : 'wait failed';
        const e = await commit('failed', 'run.failed', 'recorded', { code, message });
        yield e;
        throw Object.assign(new Error(message), { code });
      }
      delete (st as Record<string, unknown>).$resume;
      const snap = mkSnap(ctx(), 'waiting');
      (snap.cursor as Record<string, unknown>).interrupt = {
        interruptId: preparedWait.interruptId,
        reason: preparedWait.reason,
        resumeSchema: preparedWait.resumeSchema,
        nodeId: cur,
        source: preparedWait.source,
        output,
        waitMode: preparedWait.mode,
        onTimeout: preparedWait.onTimeout,
      };
      if (preparedWait.fireAt !== undefined) {
        (snap.cursor as Record<string, unknown>).timers = [
          { id: preparedWait.interruptId, fireAt: preparedWait.fireAt },
        ];
      }
      seq += 1;
      const ev: Event = { ...mkEv(ctx(), 'wait.started'), agentId: agent.id };
      ev.metadata = {
        interruptId: preparedWait.interruptId,
        reason: preparedWait.reason,
        resumeSchema: preparedWait.resumeSchema,
        source: preparedWait.source,
        mode: preparedWait.mode,
        fireAt: preparedWait.fireAt,
        onTimeout: preparedWait.onTimeout,
      };
      await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
      yield ev;
      break;
    } else if (node.type === 'control:yield') {
      const e = await commit('failed', 'run.failed', 'recorded', {
        code: 'yield_outside_map',
        message: 'control:yield is only valid inside control:map body',
      });
      yield e;
      throw Object.assign(new Error('yield_outside_map'), { code: 'yield_outside_map' });
    } else {
      const e = await commit('failed', 'run.failed', 'recorded', {
        code: 'node_unsupported',
        nodeType: node.type,
      });
      yield e;
      throw Object.assign(new Error(`unsupported node type: ${node.type}`), {
        code: 'node_unsupported',
      });
    }
    nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
    steps += 1;
    await emitHook(hooks, 'NodeEnd', { node: { id: cur, type: node.type } });
    const over = budgetOver();
    if (over && !isSandboxWrap()) {
      const e = await budgetStop(over);
      yield e;
      break;
    }
    const edgeSlots = graphSlots(opts, st, input, output);
    let nxt: string | undefined;
    try {
      nxt = matchOutgoing(plan.edgesByFrom.get(cur) ?? [], edgeSlots);
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
