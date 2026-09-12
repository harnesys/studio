// biome-ignore-all lint/suspicious/useAwait: async required by RuntimeHandle port contract

import { createRunEventBus } from '../adapters/in-memory-run-store.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import { registerPack } from '../domain/pack.ts';
import type { RunResult } from '../domain/run-result.ts';
import { fetchCapability, filesCapability, shellCapability } from '../packs/base.ts';
import type { CreateRuntimeOptions, RuntimeHandle } from '../ports/create-runtime.ts';
import { CONSOLE_LOGGER } from '../ports/logger.ts';
import type { CursorMcpJson, McpRegistry } from '../ports/mcp.ts';
import { check } from './check.ts';
import { compile, compileOrThrow } from './compile.ts';
import { startGraph } from './graph.ts';
import { runGraph } from './graph-run.ts';
import { attachPackRun, fallbackScope } from './packs/pack-run.ts';
import { packCatalog } from './packs/tool-names.ts';
import { createRunEventFeed } from './run-event-feed.ts';
import { createSession, type RuntimeContext } from './session.ts';
import { createLoadSkillTool } from './skills/create-load-skill-tool.ts';
import { createToolRegistry, filterToolsForAgent } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';
import { aliasTool } from './tools/tool-alias.ts';

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
  const baseTools = [...(options.tools ?? [])];
  const logger = options.logger ?? CONSOLE_LOGGER;

  // Base packs are always registered (R20: availability unconditional); a
  // host-supplied registration with the same pack name wins. Portless base
  // packs register with no ports key; per-run create calls get `{}` ports.
  const stubScope = fallbackScope;
  const supplied = options.packs ?? [];
  const suppliedNames = new Set(supplied.map((reg) => reg.pack.name));
  for (const name of suppliedNames) {
    if (supplied.filter((reg) => reg.pack.name === name).length > 1) {
      throw new Error(`pack "${name}" registered twice by host`);
    }
  }
  const baseRegistrations = [filesCapability, shellCapability, fetchCapability]
    .filter((pack) => !suppliedNames.has(pack.name))
    .map((pack) => registerPack(pack, { resolveScope: stubScope }));
  const packRegistrations = [...supplied, ...baseRegistrations];

  let mcpRegistry: McpRegistry | undefined;
  if (options.mcp) {
    if (isMcpRegistry(options.mcp)) {
      mcpRegistry = options.mcp as McpRegistry;
    } else {
      const { McpRegistry: McpRegistryClass } = await import('../adapters/mcp-registry.ts');
      mcpRegistry = new McpRegistryClass(undefined, logger);
      await mcpRegistry.loadJson(options.mcp as CursorMcpJson);
    }
    const mcpTools = await mcpRegistry.tools();
    baseTools.push(...mcpTools);
  }

  const toolRegistry = createToolRegistry(baseTools);
  toolRegistry.set('load_tools', createLoadToolsTool(toolRegistry));
  if (options.skills) {
    const loadSkill = createLoadSkillTool(options.skills);
    toolRegistry.set('load_skill', loadSkill);
    if (!toolRegistry.has('Skill')) {
      toolRegistry.set('Skill', aliasTool(loadSkill, 'Skill'));
    }
  }

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

  const lifecycle = options.lifecycle;
  const events = options.events;
  const feed = options.feed ?? createRunEventFeed({ events, lifecycle, bus: createRunEventBus() });

  const runtimeCtx: RuntimeContext = {
    models: options.models,
    toolRegistry,
    artifacts: options.artifacts,
    middleware: options.middleware,
    permissions: options.permissions,
    paths: options.paths,
    notes: options.notes,
    packRegistrations,
    deferredPacks: options.deferredPacks,
    skills: options.skills,
    toolMessages: options.toolMessages ?? 'ordered',
    mergeState: options.mergeState,
    agents: options.agents,
    lifecycle,
    events,
    feed,
    instanceId: options.instanceId ?? crypto.randomUUID(),
    claimer: options.claimer,
    targets: options.targets,
  };

  return {
    run: async (agent, opts) => {
      const def = resolveAgent(agent);
      const plan = compileOrThrow(def);
      const runRegistry = new Map(filterToolsForAgent(toolRegistry, def));
      runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
      const packOutputs = attachPackRun({
        def,
        registrations: packRegistrations,
        runRegistry,
        fsSkills: options.skills,
        scopeFallback: stubScope,
        deferredPacks: options.deferredPacks,
        logger,
      });
      return runGraph({
        agent: def,
        input: opts.input,
        state: opts.state,
        permissions: opts.permissions ?? options.permissions,
        paths: opts.paths ?? options.paths,
        notes: options.notes,
        skills: options.skills,
        packOutputs,
        artifacts: options.artifacts,
        models: options.models,
        toolRegistry: runRegistry,
        plan,
        toolMessages: options.toolMessages ?? 'ordered',
        mergeState: options.mergeState,
        stream: options.stream,
        agents: options.agents,
        logger,
      });
    },
    start: (agent, opts) => {
      const def = resolveAgent(agent);
      const plan = compileOrThrow(def);
      const runRegistry = new Map(filterToolsForAgent(toolRegistry, def));
      runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
      const packOutputs = attachPackRun({
        def,
        registrations: packRegistrations,
        runRegistry,
        fsSkills: options.skills,
        scopeFallback: stubScope,
        deferredPacks: options.deferredPacks,
        logger,
      });
      return startGraph({
        agent: def,
        input: opts.input,
        state: opts.state,
        permissions: opts.permissions ?? options.permissions,
        paths: opts.paths ?? options.paths,
        notes: options.notes,
        skills: options.skills,
        packOutputs,
        artifacts: options.artifacts,
        models: options.models,
        toolRegistry: runRegistry,
        plan,
        toolMessages: options.toolMessages ?? 'ordered',
        mergeState: options.mergeState,
        stream: options.stream,
        agents: options.agents,
        logger,
      });
    },
    // Resume path removed with the journal-first engine: use SessionHandle.respond.
    // The method stays on the handle so existing callers fail loudly, not silently.
    resume: async (): Promise<RunResult> => {
      throw codedRunError(
        'resume_removed',
        'RuntimeHandle.resume removed: use SessionHandle.respond',
      );
    },
    compile: (def) => compile(def),
    check: (def) => check(def, { tools: toolRegistry, agents: options.agents }),
    session: (agent, sessionOpts) => {
      return createSession(agent, sessionOpts ?? {}, runtimeCtx);
    },
    skills: {
      list: () => options.skills?.list() ?? [],
    },
    packs: {
      list: () => packCatalog(packRegistrations),
    },
    tools: {
      list: () =>
        [...toolRegistry.values()].map((t) => ({
          name: t.name,
          description: t.description,
          ...(t.group !== undefined ? { group: t.group } : {}),
        })),
      registry: () => toolRegistry,
    },
    mcp: {
      list: () => mcpRegistry?.list() ?? [],
    },
    reloadSkills: () => {
      void options.skills?.reload();
    },
    reloadMcp: async () => {
      await mcpRegistry?.reload();
    },
    close: async () => {
      await mcpRegistry?.closeAll();
    },
  };
}
