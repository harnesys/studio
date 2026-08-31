import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Attachment } from '../domain/attachment.ts';
import { PendingHitlError, ThreadBusyError } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { Middleware } from '../domain/middleware.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type {
  AgentRun,
  AgentRunStatus,
  SendInput,
  SessionEvent,
  SessionHandle,
} from '../ports/session.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compile } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';
import { runGraph } from './graph-run.ts';
import { resolvePaths } from './paths.ts';
import { resolvePermissions } from './permissions.ts';

export type RuntimeContext = {
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  artifacts?: ArtifactStore;
  middleware?: Middleware[];
  permissions?: PermissionMap;
  paths?: PathsConfig;
  toolMessages: 'barrier' | 'ordered';
  mergeState?: (key: string, a: unknown, b: unknown) => unknown;
  agents: { resolve: (id: string) => AgentDefinition | undefined };
};

type SessionStatus = 'idle' | 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled';

function normalizeInput(input: SendInput): unknown {
  if (typeof input === 'string') {
    return { text: input };
  }
  return input;
}

function eventToSessionEvent(ev: Event): SessionEvent | null {
  const t = ev.type;
  if (t === 'user.message') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const raw = m?.text as string | undefined;
    const atts = m?.attachments as Attachment[] | undefined;
    const origin = typeof m?.origin === 'string' ? m.origin : undefined;
    const text = typeof raw === 'string' ? raw : '';
    if (!text && (!atts || atts.length === 0)) {
      return null;
    }
    return {
      type: 'user',
      text,
      attachments: Array.isArray(atts) && atts.length > 0 ? atts : undefined,
      origin,
    };
  }
  if (t === 'model.delta') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const raw = m?.text;
    const id = typeof m?.id === 'string' ? m.id : undefined;
    if (typeof raw === 'string' && raw) {
      return { type: 'text-delta', text: raw, id };
    }
    return null;
  }
  if (t === 'model.reasoning') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const raw = m?.text ?? m?.delta;
    const id = typeof m?.id === 'string' ? m.id : undefined;
    if (typeof raw === 'string' && raw) {
      return { type: 'reasoning-delta', text: raw, id };
    }
    return null;
  }
  if (t === 'model.reasoning-start') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'reasoning-start', id: String(m?.id ?? '') };
  }
  if (t === 'model.reasoning-end') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'reasoning-end', id: String(m?.id ?? '') };
  }
  if (t === 'model.tool-input-start') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.toolName ?? m?.name ?? ''),
      delta: '',
    };
  }
  if (t === 'model.tool-input-delta') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const delta = typeof m?.delta === 'string' ? m.delta : '';
    if (!delta) {
      return null;
    }
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.toolName ?? m?.name ?? ''),
      delta,
    };
  }
  if (t === 'model.tool-input-end') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'streaming',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.toolName ?? m?.name ?? ''),
      delta: '',
    };
  }
  if (t === 'model.tool-call') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'requested',
      toolCallId: String(m?.id ?? m?.toolCallId ?? ''),
      name: String(m?.name ?? m?.toolName ?? ''),
      input: m?.args ?? m?.input,
    };
  }
  if (t === 'model.source') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'source', source: m?.source ?? m };
  }
  if (t === 'model.file') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return { type: 'file', file: m?.file ?? m };
  }
  if (t === 'model.completed') {
    return null;
  }
  if (t === 'tool.completed' || t === 'tool.intent') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: t === 'tool.intent' ? 'requested' : 'completed',
      toolCallId: String(m?.toolCallId ?? ''),
      name: String(m?.name ?? ''),
      input: m?.input,
      output: m?.output,
    };
  }
  if (t === 'tool.failed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'failed' as const,
      toolCallId: String(m?.toolCallId ?? ''),
      name: String(m?.name ?? ''),
      input: m?.input,
      output: m?.output,
    };
  }
  if (t === 'tool.skipped') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      phase: 'skipped' as const,
      toolCallId: String(m?.toolCallId ?? ''),
      name: String(m?.name ?? ''),
      input: m?.input,
      output: m?.output,
    };
  }
  if (t === 'interrupt.triggered') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'ask',
      askId: String(m?.interruptId ?? ''),
      schema: (m?.resumeSchema as JsonSchema) ?? {},
      source:
        (m?.source as 'permission' | 'approve' | 'middleware' | 'interrupt' | 'ask_user') ??
        'interrupt',
      prompt: typeof m?.reason === 'string' ? m.reason : undefined,
      tool: m?.tool as { name: string; input: unknown; toolCallId: string } | undefined,
    };
  }
  if (t === 'run.completed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'done',
      text: typeof m?.text === 'string' ? m.text : undefined,
    };
  }
  if (t === 'run.failed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    return {
      type: 'error',
      code: String(m?.code ?? 'run_failed'),
      message: String(m?.message ?? 'run failed'),
    };
  }
  return null;
}

export function createSession(
  agent: AgentDefinition | string,
  opts: {
    state?: RuntimeState;
    permissions?: PermissionMap;
    paths?: PathsConfig;
  },
  ctx: RuntimeContext,
): SessionHandle {
  let status: SessionStatus = 'idle';
  let pendingAsk: { askId: string; schema: JsonSchema } | null = null;

  const resolveAgent = (): AgentDefinition => {
    if (typeof agent !== 'string') {
      return agent;
    }
    const resolved = ctx.agents.resolve(agent);
    if (!resolved) {
      throw new Error(`agent "${agent}" not found`);
    }
    return resolved;
  };

  function createRun(
    state: RuntimeState,
    input: unknown,
    runOpts?: { signal?: AbortSignal; permissions?: PermissionMap; paths?: PathsConfig },
  ): AgentRun {
    const runId = crypto.randomUUID();
    const events: SessionEvent[] = [];
    let resolveOutput: (v: { text: string }) => void;
    const outputPromise = new Promise<{ text: string }>((resolve) => {
      resolveOutput = resolve;
    });
    let respondFn: (askId: string, payload: unknown) => Promise<void>;
    let rejectFn: (askId: string, opts?: { note?: string }) => Promise<void>;
    let cancelFn: () => void;

    const ac = new AbortController();
    status = 'running';

    const def = resolveAgent();
    const { plan } = compile(def);
    const toolOps: string[] = [];
    for (const [, def] of ctx.toolRegistry) {
      if (def.operations) {
        toolOps.push(...def.operations);
      }
    }
    const effectivePerms = resolvePermissions(
      toolOps,
      runOpts?.permissions,
      opts.permissions,
      ctx.permissions,
    );
    const effectivePaths = resolvePaths(def.paths, ctx.paths, runOpts?.paths ?? opts.paths);

    const graphOpts: GraphOpts = {
      agent: def,
      input: normalizeInput(input as SendInput),
      state,
      permissions: effectivePerms,
      paths: effectivePaths,
      artifacts: ctx.artifacts,
      models: ctx.models,
      toolRegistry: ctx.toolRegistry,
      plan,
      toolMessages: ctx.toolMessages,
      mergeState: ctx.mergeState,
      signal: runOpts?.signal ?? ac.signal,
    };

    const iter = startGraph(graphOpts);

    const consume = async (): Promise<void> => {
      try {
        for await (const ev of iter) {
          const se = eventToSessionEvent(ev);
          if (se) {
            events.push(se);
            if (se.type === 'ask') {
              pendingAsk = { askId: se.askId, schema: se.schema };
              status = 'needs_input';
            }
          }
        }
        const snap = await state.load();
        const finalStatus = snap?.status ?? 'completed';
        if (finalStatus === 'completed') {
          status = 'completed';
          const st = snap?.state as Record<string, unknown> | undefined;
          const msgs = st?.messages;
          const lastText =
            Array.isArray(msgs) && msgs.length > 0
              ? String((msgs[msgs.length - 1] as Record<string, unknown>)?.content ?? '')
              : '';
          resolveOutput({ text: lastText });
        } else if (finalStatus === 'needs_input') {
          // already set
        } else {
          status = 'failed';
          resolveOutput({ text: '' });
        }
      } catch {
        status = 'failed';
        resolveOutput({ text: '' });
      }
    };

    const consumePromise = consume().catch(() => {});

    respondFn = async (askId: string, payload: unknown): Promise<void> => {
      if (!pendingAsk || pendingAsk.askId !== askId) {
        return;
      }
      pendingAsk = null;
      status = 'running';
      await consumePromise;

      const snap = await state.load();
      const interrupt = (snap?.cursor as Record<string, unknown>)?.interrupt as
        | Record<string, unknown>
        | undefined;

      const command = {
        type: 'resume' as const,
        interruptId: String(interrupt?.interruptId ?? askId),
        payload,
      };

      const result = await runGraph({
        ...graphOpts,
        resumePayload: command.payload,
        startNodeId: interrupt?.nodeId as string | undefined,
      });

      if (result.status === 'completed') {
        status = 'completed';
        const text =
          typeof result.output === 'object' && result.output !== null && 'text' in result.output
            ? String((result.output as { text: unknown }).text ?? '')
            : '';
        resolveOutput({ text });
      } else if (result.status === 'needs_input') {
        const askEvent = events.findLast((e) => e.type === 'ask');
        if (askEvent) {
          pendingAsk = {
            askId: (askEvent as { askId: string }).askId,
            schema: (askEvent as { schema: JsonSchema }).schema,
          };
        }
        status = 'needs_input';
      } else {
        status = 'failed';
        resolveOutput({ text: '' });
      }
    };

    rejectFn = async (askId: string, rejectOpts?: { note?: string }): Promise<void> => {
      if (!pendingAsk || pendingAsk.askId !== askId) {
        return;
      }
      pendingAsk = null;
      status = 'running';
      await consumePromise;

      const snap = await state.load();
      const interrupt = (snap?.cursor as Record<string, unknown>)?.interrupt as
        | Record<string, unknown>
        | undefined;

      // reject: no resumePayload → default edge (without $resume) is taken
      const result = await runGraph({
        ...graphOpts,
        startNodeId: interrupt?.nodeId as string | undefined,
      });

      if (result.status === 'completed') {
        status = 'completed';
        resolveOutput({ text: rejectOpts?.note ?? '' });
      } else {
        status = 'failed';
        resolveOutput({ text: rejectOpts?.note ?? '' });
      }
    };

    cancelFn = (): void => {
      ac.abort();
      status = 'cancelled';
    };

    const run: AgentRun = {
      id: runId,
      get status() {
        return status as AgentRunStatus;
      },
      stream: async function* () {
        let idx = 0;
        while (true) {
          if (idx < events.length) {
            yield events[idx] as SessionEvent;
            idx += 1;
          } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            break;
          } else {
            await new Promise((r) => setTimeout(r, 10));
          }
        }
      },
      output: outputPromise,
      respond: (askId: string, payload: unknown) => respondFn(askId, payload),
      reject: (askId: string, rejectOpts?: { note?: string }) => rejectFn(askId, rejectOpts),
      cancel: () => cancelFn(),
    };

    return run;
  }

  return {
    send(input, sendOpts) {
      if (status === 'running' || status === 'needs_input') {
        throw new ThreadBusyError('session');
      }
      if (pendingAsk) {
        throw new PendingHitlError('session');
      }
      const state = opts.state ?? {
        sessionId: crypto.randomUUID(),
        load: async () => null,
        commit: async () => {},
        child: () => ({
          sessionId: '',
          load: async () => null,
          commit: async () => {},
          child: () => null as never,
        }),
      };
      return createRun(state, input, sendOpts);
    },
    resume(resumeOpts) {
      if (status === 'running' || status === 'needs_input') {
        throw new ThreadBusyError('session');
      }
      const state = opts.state ?? {
        sessionId: crypto.randomUUID(),
        load: async () => null,
        commit: async () => {},
        child: () => ({
          sessionId: '',
          load: async () => null,
          commit: async () => {},
          child: () => null as never,
        }),
      };
      return createRun(state, null, resumeOpts);
    },
  };
}
