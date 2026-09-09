// biome-ignore-all lint/suspicious/useAwait: async required by RuntimeHandle port contract

import {
  createRunEventBus,
  InMemoryRunEventStore,
  InMemoryRunLifecycleStore,
} from '../adapters/in-memory-run-store.ts';
import { registerCapability } from '../domain/pack.ts';
import { fetchCapability, filesCapability, shellCapability } from '../packs/base.ts';
import { skillsCapability } from '../packs/skills.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { RunResult } from '../domain/run-result.ts';
import type { CreateRuntimeOptions, RuntimeHandle } from '../ports/create-runtime.ts';
import type { CursorMcpJson, McpRegistry } from '../ports/mcp.ts';
import { capabilityCatalog } from './packs/tool-names.ts';
import { check } from './check.ts';
import { compile, compileOrThrow } from './compile.ts';
import { startGraph } from './graph.ts';
import { runGraph } from './graph-run.ts';
import { createRunEventFeed } from './run-event-feed.ts';
import { createSession, type RuntimeContext } from './session.ts';
import { createToolRegistry, filterToolsForAgent } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';

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

  // Base packs are always registered (R20: availability unconditional, prompt
  // fragments always composable); a host-supplied registration with the same
  // pack name wins — dedupe by name, first occurrence kept.
  const supplied = options.capabilities ?? [];
  const suppliedNames = new Set(supplied.map((reg) => reg.pack.name));
  const stubScope = () => ({ workspaceId: '_', agentId: '_', threadId: '_' });
  const baseRegistrations = [filesCapability, shellCapability, fetchCapability]
    .filter((pack) => !suppliedNames.has(pack.name))
    .map((pack) => registerCapability(pack, {}, stubScope));
  // Auto skills registration must also land its tools in the registry: a
  // registration alone never reaches baseTools, and load_skill would vanish.
  const autoSkills =
    options.skills && !suppliedNames.has(skillsCapability.name)
      ? registerCapability(skillsCapability, { skills: options.skills }, stubScope)
      : undefined;
  if (autoSkills) {
    baseTools.push(
      ...autoSkills.pack.tools({
        ports: autoSkills.ports,
        resolveScope: autoSkills.resolveScope,
        config: {},
      }),
    );
  }
  const capabilityRegistrations = [
    ...supplied,
    ...baseRegistrations,
    ...(autoSkills ? [autoSkills] : []),
  ];

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
    baseTools.push(...mcpTools);
  }

  const toolRegistry = createToolRegistry(baseTools);
  toolRegistry.set('load_tools', createLoadToolsTool(toolRegistry));

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

  if ((options.lifecycle === undefined) !== (options.events === undefined)) {
    throw new Error('createRuntime: lifecycle and events must be provided together');
  }
  let lifecycle = options.lifecycle;
  let events = options.events;
  if (lifecycle === undefined && events === undefined) {
    const memEvents = new InMemoryRunEventStore();
    events = memEvents;
    lifecycle = new InMemoryRunLifecycleStore(memEvents);
  }
  if (lifecycle === undefined || events === undefined) {
    throw new Error('createRuntime: lifecycle and events must be provided together');
  }
  const feed = options.feed ?? createRunEventFeed({ events, lifecycle, bus: createRunEventBus() });

  const runtimeCtx: RuntimeContext = {
    models: options.models,
    toolRegistry,
    artifacts: options.artifacts,
    middleware: options.middleware,
    permissions: options.permissions,
    paths: options.paths,
    notes: options.notes,
    capabilityRegistrations,
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
      return runGraph({
        agent: def,
        input: opts.input,
        state: opts.state,
        permissions: opts.permissions ?? options.permissions,
        paths: opts.paths ?? options.paths,
        notes: options.notes,
        capabilityRegistrations,
        artifacts: options.artifacts,
        models: options.models,
        toolRegistry: runRegistry,
        plan,
        toolMessages: options.toolMessages ?? 'ordered',
        mergeState: options.mergeState,
        stream: options.stream,
        agents: options.agents,
      });
    },
    start: (agent, opts) => {
      const def = resolveAgent(agent);
      const plan = compileOrThrow(def);
      const runRegistry = new Map(filterToolsForAgent(toolRegistry, def));
      runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
      return startGraph({
        agent: def,
        input: opts.input,
        state: opts.state,
        permissions: opts.permissions ?? options.permissions,
        paths: opts.paths ?? options.paths,
        notes: options.notes,
        capabilityRegistrations,
        artifacts: options.artifacts,
        models: options.models,
        toolRegistry: runRegistry,
        plan,
        toolMessages: options.toolMessages ?? 'ordered',
        mergeState: options.mergeState,
        stream: options.stream,
        agents: options.agents,
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
    capabilities: {
      list: () => capabilityCatalog(capabilityRegistrations),
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
