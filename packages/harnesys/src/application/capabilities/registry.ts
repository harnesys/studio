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
  const resolved = new Map<string, ResolvedCapability | null>();
  const resolving = new Set<string>();

  function resolveReg(reg: CapabilityRegistration): ResolvedCapability | null {
    const name = reg.pack.name;
    if (resolved.has(name)) {
      return resolved.get(name) ?? null;
    }
    const fail = () => {
      resolved.set(name, null);
      return null;
    };
    const config = enabledConfig(reg, def);
    if (config === null) {
      return fail();
    }
    const missingPort = (reg.pack.requires ?? []).find((p) => !(p in reg.ports));
    if (missingPort) {
      diagnostics.push({
        severity: 'error',
        code: 'capability_port_missing',
        message: `${name}: port "${missingPort}" not provided by host`,
      });
      return fail();
    }
    resolving.add(name);
    let missingDep: string | undefined;
    for (const d of reg.pack.dependsOn ?? []) {
      const depReg = byName.get(d);
      if (!depReg || resolving.has(d) || resolveReg(depReg) === null) {
        missingDep = d;
        break;
      }
    }
    resolving.delete(name);
    if (missingDep) {
      diagnostics.push({
        severity: 'error',
        code: 'capability_dep_missing',
        message: `${name}: depends on "${missingDep}"`,
      });
      return fail();
    }
    const cap = { reg, config };
    resolved.set(name, cap);
    return cap;
  }

  const enabled: ResolvedCapability[] = [];
  const sorted = [...registrations].sort((a, b) => a.pack.name.localeCompare(b.pack.name));
  for (const reg of sorted) {
    const cap = resolveReg(reg);
    if (cap) {
      enabled.push(cap);
    }
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
