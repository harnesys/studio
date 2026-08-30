// biome-ignore-all lint/suspicious/useAwait: async required by RuntimeHandle port contract
import { NotImplementedError } from '../domain/errors.ts';
import type { CreateRuntimeOptions, RuntimeHandle } from '../ports/create-runtime.ts';
import { check } from './check.ts';
import { compile } from './compile.ts';
import { startGraph } from './graph.ts';
import { runGraph } from './graph-run.ts';
import { createToolRegistry } from './tool-registry.ts';

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeHandle> {
  const toolRegistry = createToolRegistry(options.tools);

  const resolveAgent = (
    agent: import('../domain/agent-definition.ts').AgentDefinition | string,
  ): import('../domain/agent-definition.ts').AgentDefinition => {
    if (typeof agent !== 'string') {
      return agent;
    }
    const resolved = options.agents.resolve(agent);
    if (!resolved) {
      throw new Error(`agent "${agent}" not found`);
    }
    return resolved;
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
    resume: async () => {
      throw new NotImplementedError('resume');
    },
    compile: (def) => compile(def),
    check: (def) => check(def, { tools: toolRegistry }),
    session: () => {
      throw new NotImplementedError('session');
    },
    reloadSkills: () => {
      throw new NotImplementedError('reloadSkills');
    },
    reloadMcp: () => {
      throw new NotImplementedError('reloadMcp');
    },
    close: () => {},
  };
}
