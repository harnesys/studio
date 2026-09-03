import type { AgentDefinition } from '../domain/agent-definition.ts';
import { PendingHitlError, ThreadBusyError } from '../domain/errors.ts';
import type { Middleware } from '../domain/middleware.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { AgentRun, AgentRunStatus, SendInput, SessionHandle } from '../ports/session.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compile } from './compile.ts';
import { type GraphOpts } from './graph.ts';
import { resolvePaths } from './paths.ts';
import { resolvePermissions } from './permissions.ts';
import { createRunEngine, type RunEngine } from './run-engine.ts';

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

function normalizeInput(input: SendInput): unknown {
  if (typeof input === 'string') {
    return { text: input };
  }
  return input;
}

function memoryState(): RuntimeState {
  return {
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
}

function isBusy(engine: RunEngine | null): boolean {
  return engine?.status === 'running' || engine?.status === 'needs_input';
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
  let live: RunEngine | null = null;

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
    mode: 'start' | 'recover',
    runOpts?: { signal?: AbortSignal; permissions?: PermissionMap; paths?: PathsConfig },
  ): AgentRun {
    const runId = crypto.randomUUID();
    const def = resolveAgent();
    const { plan } = compile(def);
    const toolOps: string[] = [];
    for (const [, toolDef] of ctx.toolRegistry) {
      if (toolDef.operations) {
        toolOps.push(...toolDef.operations);
      }
    }
    const graphOpts: GraphOpts = {
      agent: def,
      input: mode === 'start' ? normalizeInput(input as SendInput) : input,
      state,
      permissions: resolvePermissions(
        toolOps,
        runOpts?.permissions,
        opts.permissions,
        ctx.permissions,
      ),
      paths: resolvePaths(def.paths, ctx.paths, runOpts?.paths ?? opts.paths),
      artifacts: ctx.artifacts,
      models: ctx.models,
      toolRegistry: ctx.toolRegistry,
      plan,
      toolMessages: ctx.toolMessages,
      mergeState: ctx.mergeState,
      signal: runOpts?.signal ?? new AbortController().signal,
    };

    const engine = createRunEngine({ graphOpts, runId });
    live = engine;
    if (mode === 'recover') {
      void engine.recover();
    } else {
      void engine.start();
    }

    return {
      id: runId,
      get status() {
        return engine.status as AgentRunStatus;
      },
      stream: () => engine.stream(),
      output: engine.output,
      respond: (askId, payload) =>
        engine.command({ type: 'resume', interruptId: askId, payload }),
      reject: (askId, rejectOpts) =>
        engine.command({ type: 'reject', interruptId: askId, note: rejectOpts?.note }),
      cancel: () => {
        void engine.command({ type: 'cancel', mode: 'hard' });
      },
    };
  }

  return {
    send(input, sendOpts) {
      if (live?.status === 'needs_input') {
        throw new PendingHitlError('session');
      }
      if (isBusy(live)) {
        throw new ThreadBusyError('session');
      }
      return createRun(opts.state ?? memoryState(), input, 'start', sendOpts);
    },
    resume(resumeOpts) {
      if (isBusy(live)) {
        throw new ThreadBusyError('session');
      }
      return createRun(opts.state ?? memoryState(), null, 'recover', resumeOpts);
    },
  };
}
