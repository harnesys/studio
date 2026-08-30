// biome-ignore-all lint/suspicious/noConfusingVoidType: RuntimeHandle reload/close use void|Promise<void> per docs/05
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Middleware } from '../domain/middleware.ts';
import type { Command, RunResult } from '../domain/run-result.ts';
import type { SkillSummary } from '../domain/skill.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ArtifactStore } from './artifacts.ts';
import type { CursorMcpJson, McpRegistry, McpServerInfo } from './mcp.ts';
import type { ModelsPort, ProviderConfig } from './models.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RuntimeState } from './runtime-state.ts';
import type { SessionHandle } from './session.ts';
import type { SkillRegistry } from './skills.ts';
import type { CustomNodeImpl, ToolCatalogEntry, ToolDefinition } from './tools.ts';

export type AgentsResolve = {
  resolve: (id: string) => AgentDefinition | undefined;
};

export type CreateRuntimeOptions = {
  models: ProviderConfig[] | ModelsPort;
  tools?: ToolDefinition[];
  mcp?: CursorMcpJson | McpRegistry;
  skills?: SkillRegistry;
  agents: AgentsResolve;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  artifacts?: ArtifactStore;
  nodes?: Record<string, CustomNodeImpl>;
  middleware?: Middleware[];
  toolMessages?: 'barrier' | 'ordered';
  mergeState?: (key: string, a: unknown, b: unknown) => unknown;
};

export type RuntimeHandle = {
  run(
    agent: AgentDefinition | string,
    opts: {
      input: unknown;
      state: RuntimeState;
      permissions?: PermissionMap;
      paths?: PathsConfig;
    },
  ): Promise<RunResult>;
  start(
    agent: AgentDefinition | string,
    opts: {
      input: unknown;
      state: RuntimeState;
      permissions?: PermissionMap;
      paths?: PathsConfig;
    },
  ): AsyncIterable<Event>;
  resume(
    state: RuntimeState,
    command: Command,
    opts: { definition: AgentDefinition },
  ): Promise<RunResult>;
  compile(def: AgentDefinition): unknown;
  check(def: AgentDefinition): unknown;
  session(
    agent: AgentDefinition | string,
    opts?: {
      state?: RuntimeState;
      permissions?: PermissionMap;
      paths?: PathsConfig;
    },
  ): SessionHandle;
  skills: {
    list(): SkillSummary[] | Promise<SkillSummary[]>;
  };
  tools: {
    list(): ToolCatalogEntry[];
  };
  mcp: {
    list(): McpServerInfo[] | Promise<McpServerInfo[]>;
  };
  reloadSkills(): Promise<void> | void;
  reloadMcp(): Promise<void> | void;
  close(): Promise<void> | void;
};
