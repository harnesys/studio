import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { CapabilityConfig, CapabilityRegistration } from '../../domain/capability.ts';

export type ResolvedCapability = {
  reg: CapabilityRegistration;
  config: CapabilityConfig;
};

export type CapabilityDiagnostic = {
  severity: 'error' | 'warning';
  code: 'unknown_capability' | 'capability_port_missing' | 'capability_dep_missing';
  message: string;
};

function enabledConfig(reg: CapabilityRegistration, def: AgentDefinition): CapabilityConfig | null {
  const source = reg.pack.configFrom ? reg.pack.configFrom(def) : def.capabilities?.[reg.pack.name];
  if (source == null) {
    return null;
  }
  return 'spec' in source ? (source as CapabilityConfig) : {};
}

export function resolveCapabilities(
  def: AgentDefinition,
  registrations: CapabilityRegistration[],
): { enabled: ResolvedCapability[]; diagnostics: CapabilityDiagnostic[] } {
  const diagnostics: CapabilityDiagnostic[] = [];
  const byName = new Map(registrations.map((r) => [r.pack.name, r]));
  const enabled: ResolvedCapability[] = [];
  const sorted = [...registrations].sort((a, b) => a.pack.name.localeCompare(b.pack.name));
  for (const reg of sorted) {
    const config = enabledConfig(reg, def);
    if (config === null) {
      continue;
    }
    const missingPort = (reg.pack.requires ?? []).find((p) => !(p in reg.ports));
    if (missingPort) {
      diagnostics.push({
        severity: 'error',
        code: 'capability_port_missing',
        message: `${reg.pack.name}: port "${missingPort}" not provided by host`,
      });
      continue;
    }
    const missingDep = (reg.pack.dependsOn ?? []).find(
      (d) => !byName.has(d) || enabledConfig(byName.get(d) as CapabilityRegistration, def) === null,
    );
    if (missingDep) {
      diagnostics.push({
        severity: 'error',
        code: 'capability_dep_missing',
        message: `${reg.pack.name}: depends on "${missingDep}"`,
      });
      continue;
    }
    enabled.push({ reg, config });
  }
  for (const name of Object.keys(def.capabilities ?? {})) {
    if (!byName.has(name) && def.capabilities?.[name] != null) {
      diagnostics.push({
        severity: 'warning',
        code: 'unknown_capability',
        message: `capability "${name}" is not registered by the host`,
      });
    }
  }
  return { enabled, diagnostics };
}
