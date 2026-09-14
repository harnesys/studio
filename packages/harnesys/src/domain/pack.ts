import type { LlmNoteProvider } from '../application/llm-notes.ts';
import type { ToolDefinition, ToolExposure } from '../ports/tools.ts';
import type { JsonSchema } from './json-schema.ts';

export type CapabilityScope = {
  workspaceId: string;
  agentId: string;
  /** Display name of the agent when the host has one; memory scoping prefers it over agentId. */
  agentName?: string;
  threadId: string;
};

export type PackSkill = {
  name: string;
  description: string;
  whenToUse?: string;
  body: string;
};

export type PackToolMeta = { name: string; description: string };

export type PackMeta = {
  tools: PackToolMeta[];
  skills: string[];
  hasSettings: boolean;
};

export type PackConfig = { spec?: Record<string, unknown> };
/** Точечное вычитание/экспозиция внутри включённого источника; отличается от PackConfig формой. */
export type PackOverride = {
  spec?: PackConfig;
  disabledTools?: string[];
  exposure?: Record<string, ToolExposure>;
};
export type PackAssignment = boolean | PackConfig | PackOverride;
export type PackName = string;
export type AgentPacks = Record<PackName, PackAssignment>;

export type PackCtx<Ports, Spec> = {
  ports: Ports;
  spec: Spec;
  scope: CapabilityScope;
};

export type Pack<Ports = Record<string, never>, Spec = Record<string, unknown>> = {
  name: string;
  version: string;
  description: string;
  icon?: string;
  specSchema?: JsonSchema;
  meta: PackMeta;
  create: (ctx: PackCtx<Ports, Spec>) => {
    tools?: ToolDefinition[];
    skills?: PackSkill[];
    notes?: LlmNoteProvider | LlmNoteProvider[];
  };
};

export type PackRegistration<Ports = Record<string, unknown>> = {
  pack: Pack<Ports, Record<string, unknown>>;
  ports?: Ports;
  resolveScope?: () => CapabilityScope;
};

export function definePack<Ports, Spec>(pack: Pack<Ports, Spec>): Pack<Ports, Spec> {
  if (!pack.name || !pack.version || !pack.description) {
    throw new Error('pack requires name, version, description');
  }
  if (!pack.meta) {
    throw new Error(`pack "${pack.name}" requires meta for the catalog endpoint`);
  }
  return pack;
}

export function registerPack<Ports>(
  pack: Pack<Ports, Record<string, unknown>>,
  opts?: { ports?: Ports; resolveScope?: () => CapabilityScope },
): PackRegistration<Ports> {
  return { pack, ports: opts?.ports, resolveScope: opts?.resolveScope };
}

export function normalizePackAssignment(value: PackAssignment): PackOverride {
  if (typeof value === 'boolean') {
    return {};
  }
  return value;
}
