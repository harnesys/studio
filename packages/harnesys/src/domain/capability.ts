import type { LlmNoteProvider } from '../application/llm-notes.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { AgentDefinition, PortRef } from './agent-definition.ts';

export type CapabilityScope = {
  workspaceId: string;
  agentId: string;
  /** Display name of the agent when the host has one; memory scoping prefers it over agentId. */
  agentName?: string;
  threadId: string;
};

export type CapabilityConfig = { spec?: Record<string, unknown> };

export type CapabilityPackContext<Ports> = {
  ports: Ports;
  resolveScope: () => CapabilityScope;
  config: CapabilityConfig;
};

export type CapabilityPack<Ports = Record<string, unknown>> = {
  name: string;
  version: string;
  description: string;
  requires?: string[];
  dependsOn?: string[];
  /** Источник включения/конфига; по умолчанию def.capabilities[name]. Память мостится от def.memory. */
  configFrom?: (def: AgentDefinition) => CapabilityConfig | PortRef | null | undefined;
  tools: (ctx: CapabilityPackContext<Ports>) => ToolDefinition[];
  prompt?: (ctx: CapabilityPackContext<Ports>) => string;
  notes?: (ctx: CapabilityPackContext<Ports>) => LlmNoteProvider;
};

export type CapabilityRegistration = {
  pack: CapabilityPack<Record<string, unknown>>;
  ports: Record<string, unknown>;
  resolveScope: () => CapabilityScope;
};

export function defineCapability<Ports extends Record<string, unknown>>(
  pack: CapabilityPack<Ports>,
): CapabilityPack<Ports> {
  if (!pack.name || !pack.version || !pack.description) {
    throw new Error('capability pack requires name, version, description');
  }
  return pack;
}

export function registerCapability<Ports extends Record<string, unknown>>(
  pack: CapabilityPack<Ports>,
  ports: Ports,
  resolveScope: () => CapabilityScope,
): CapabilityRegistration {
  return {
    pack: pack as CapabilityPack<Record<string, unknown>>,
    ports,
    resolveScope,
  };
}
