// biome-ignore-all lint/suspicious/useAwait: async required by RuntimeHandle port contract
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Command, RunResult } from '../domain/run-result.ts';
import type { CreateRuntimeOptions, RuntimeHandle } from '../ports/create-runtime.ts';
import type { CursorMcpJson, McpRegistry } from '../ports/mcp.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import { check } from './check.ts';
import { compile } from './compile.ts';
import { startGraph } from './graph.ts';
import { runGraph } from './graph-run.ts';
import { createSession, type RuntimeContext } from './session.ts';
import { createLoadSkillTool } from './skills/create-load-skill-tool.ts';
import { createToolRegistry } from './tool-registry.ts';

function isMcpRegistry(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'loadJson' in value &&
    'tools' in value &&
    'closeAll' in value
  );
}

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeHandle> {
  let baseTools = options.tools ?? [];

  if (options.skills) {
    baseTools = [...baseTools, createLoadSkillTool(options.skills)];
  }

  let mcpRegistry: McpRegistry | undefined;
  if (options.mcp) {
    if (isMcpRegistry(options.mcp)) {
      mcpRegistry = options.mcp as McpRegistry;
    } else {
      const { McpRegistry: McpRegistryClass } = await import('../adapters/mcp-registry.ts');
      mcpRegistry = new McpRegistryClass();
      await mcpRegistry.loadJson(options.mcp as CursorMcpJson);
    }
    const mcpTools = await mcpRegistry.tools();
    baseTools = [...baseTools, ...mcpTools];
  }

  const toolRegistry = createToolRegistry(baseTools);

  const resolveAgent = (agent: AgentDefinition | string): AgentDefinition => {
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
    resume: async (
      state: RuntimeState,
      command: Command,
      opts: { definition: AgentDefinition },
    ): Promise<RunResult> => {
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
      const snap = await state.load();
      const interrupt = (snap?.cursor as Record<string, unknown>)?.interrupt as
        | Record<string, unknown>
        | undefined;
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
        startNodeId: interrupt?.nodeId as string | undefined,
      });
    },
    compile: (def) => compile(def),
    check: (def) => check(def, { tools: toolRegistry }),
    session: (agent, sessionOpts) => {
      return createSession(agent, sessionOpts ?? {}, runtimeCtx);
    },
    skills: {
      list: () => options.skills?.list() ?? [],
    },
    tools: {
      list: () =>
        [...toolRegistry.values()].map((t) => ({
          name: t.name,
          description: t.description,
          ...(t.group !== undefined ? { group: t.group } : {}),
        })),
    },
    mcp: {
      list: () => mcpRegistry?.list() ?? [],
    },
    reloadSkills: () => {
      options.skills?.reload();
    },
    reloadMcp: async () => {
      await mcpRegistry?.reload();
    },
    close: async () => {
      await mcpRegistry?.closeAll();
    },
  };
}
