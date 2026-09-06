import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { CapabilityRegistration } from '../../domain/capability.ts';
import { resolveCapabilities } from './registry.ts';

export type CapabilityCatalogEntry = {
  name: string;
  version: string;
  description: string;
  toolNames: string[];
  requires: string[];
};

export function capabilityToolNames(
  def: AgentDefinition,
  registrations: CapabilityRegistration[],
): string[] {
  const { enabled } = resolveCapabilities(def, registrations);
  return enabled.flatMap((c) =>
    c.reg.pack
      .tools({ ports: c.reg.ports, resolveScope: c.reg.resolveScope, config: c.config })
      .map((t) => t.name),
  );
}

export function allCapabilityToolNames(registrations: CapabilityRegistration[]): string[] {
  // фикстура-скоуп нужен только для вызова tools(); имена от него не зависят
  const stub = { workspaceId: '_', agentId: '_', threadId: '_' };
  return registrations.flatMap((r) =>
    r.pack.tools({ ports: r.ports, resolveScope: () => stub, config: {} }).map((t) => t.name),
  );
}

export function capabilityCatalog(
  registrations: CapabilityRegistration[],
): CapabilityCatalogEntry[] {
  const stub = { workspaceId: '_', agentId: '_', threadId: '_' };
  return [...registrations]
    .sort((a, b) => a.pack.name.localeCompare(b.pack.name))
    .map((r) => ({
      name: r.pack.name,
      version: r.pack.version,
      description: r.pack.description,
      requires: r.pack.requires ?? [],
      toolNames: r.pack
        .tools({ ports: r.ports, resolveScope: () => stub, config: {} })
        .map((t) => t.name),
    }));
}
