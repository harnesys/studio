// biome-ignore-all lint/suspicious/useAwait: async required by RuntimeHandle port contract
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Command, RunResult } from '../domain/run-result.ts';
import type { CreateRuntimeOptions, RuntimeHandle } from '../ports/create-runtime.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SessionHandle } from '../ports/session.ts';
import { check } from './check.ts';
import { compile } from './compile.ts';
import { startGraph } from './graph.ts';
import { runGraph } from './graph-run.ts';
import { resolvePaths } from './paths.ts';
import { resolvePermissions } from './permissions.ts';
import { createSession, type RuntimeContext } from './session.ts';
import { createToolRegistry } from './tool-registry.ts';

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeHandle> {
  const toolRegistry = createToolRegistry(options.tools);

  const resolveAgent = (
    agent: AgentDefinition | string,
  ): AgentDefinition => {
    if (typeof agent !== 'string') {
      return agent;
    }
    const resolved = options.agents.resolve(agent);
    if (!resolved) {
      throw new Error(`agent "${agent}" not found`);
    }
    return resolved;
  };

  const runtimeCtx: RuntimeContext = {
    models: options.models,
    toolRegistry,
    artifacts: options.artifacts,
    middleware: options.middleware,
    permissions: options.permissions,
    paths: options.paths,
    toolMessages: options.toolMessages ?? 'ordered',
    mergeState: options.mergeState,
    agents: options.agents,
  };

  return {
    run: async (agent, opts) => {
      const def = resolveAgent(agent);
      const { plan } = compile(def);
      return runGraph({
        agent: def,
        input: opts.input,
        state: opts.state,
        permissions: opts.permissions ?? options.permissions,
        paths: opts.paths ?? options.paths,
        artifacts: options.artifacts,
        models: options.models,
        toolRegistry,
        plan,
        toolMessages: options.toolMessages ?? 'ordered',
        mergeState: options.mergeState,
      });
    },
    start: (agent, opts) => {
      const def = resolveAgent(agent);
      const { plan } = compile(def);
      return startGraph({
        agent: def,
        input: opts.input,
        state: opts.state,
        permissions: opts.permissions ?? options.permissions,
        paths: opts.paths ?? options.paths,
        artifacts: options.artifacts,
        models: options.models,
        toolRegistry,
        plan,
        toolMessages: options.toolMessages ?? 'ordered',
        mergeState: options.mergeState,
      });
    },
    resume: async (state: RuntimeState, command: Command, opts: { definition: AgentDefinition }): Promise<RunResult> => {
      const { plan } = compile(opts.definition);
      if (command.type === 'cancel') {
        return runGraph({
          agent: opts.definition,
          input: null,
          state,
          permissions: options.permissions,
          paths: options.paths,
          artifacts: options.artifacts,
          models: options.models,
          toolRegistry,
          plan,
          toolMessages: options.toolMessages ?? 'ordered',
          mergeState: options.mergeState,
        });
      }
      if (command.type === 'reject') {
        return runGraph({
          agent: opts.definition,
          input: null,
          state,
          permissions: options.permissions,
          paths: options.paths,
          artifacts: options.artifacts,
          models: options.models,
          toolRegistry,
          plan,
          toolMessages: options.toolMessages ?? 'ordered',
          mergeState: options.mergeState,
        });
      }
      return runGraph({
        agent: opts.definition,
        input: command.payload,
        state,
        permissions: options.permissions,
        paths: options.paths,
        artifacts: options.artifacts,
        models: options.models,
        toolRegistry,
        plan,
        toolMessages: options.toolMessages ?? 'ordered',
        mergeState: options.mergeState,
        resumePayload: command.payload,
      });
    },
    compile: (def) => compile(def),
    check: (def) => check(def, { tools: toolRegistry }),
    session: (agent, sessionOpts) => {
      return createSession(agent, sessionOpts ?? {}, runtimeCtx);
    },
    reloadSkills: () => {},
    reloadMcp: () => {},
    close: () => {},
  };
}
