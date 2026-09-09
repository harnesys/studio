import Ajv from 'ajv';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { AgentPacks, PackConfig, PackRegistration } from '../../domain/pack.ts';

export type ResolvedPack = {
  reg: PackRegistration;
  config: PackConfig;
};

export type PackDiagnosticCode =
  | 'pack_unknown'
  | 'pack_port_missing'
  | 'pack_tools_empty'
  | 'pack_tool_collision'
  | 'skill_name_collision'
  | 'spec_invalid';

export type PackDiagnostic = {
  severity: 'warning';
  code: PackDiagnosticCode;
  message: string;
};

const ajv = new Ajv({ strict: false, allErrors: true });

type RegLike = {
  pack: { name: string; specSchema?: unknown };
  ports?: unknown;
  resolveScope?: unknown;
};

function enabledConfig(reg: RegLike, packs: AgentPacks | undefined): PackConfig | null {
  const raw = packs?.[reg.pack.name];
  if (raw === undefined || raw === null || raw === false) {
    return null;
  }
  return raw === true ? {} : raw;
}

function resolveRegs<R extends RegLike>(
  packs: AgentPacks | undefined,
  registrations: R[],
): { enabled: Array<{ reg: R; config: PackConfig }>; diagnostics: PackDiagnostic[] } {
  const diagnostics: PackDiagnostic[] = [];
  const byName = new Map(registrations.map((r) => [r.pack.name, r]));
  const enabled: Array<{ reg: R; config: PackConfig }> = [];
  const sorted = [...registrations].sort((a, b) => (a.pack.name < b.pack.name ? -1 : 1));
  for (const reg of sorted) {
    const config = enabledConfig(reg, packs);
    if (config === null) {
      continue;
    }
    if (reg.resolveScope === undefined && reg.ports !== undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'pack_port_missing',
        message: `${reg.pack.name}: ports provided without resolveScope`,
      });
      continue;
    }
    if (reg.pack.specSchema !== undefined) {
      const valid = ajv.validate(reg.pack.specSchema as Record<string, unknown>, config.spec ?? {});
      if (!valid) {
        diagnostics.push({
          severity: 'warning',
          code: 'spec_invalid',
          message: `${reg.pack.name}: spec does not match specSchema (${ajv.errorsText()})`,
        });
        continue;
      }
    }
    enabled.push({ reg, config });
  }
  for (const name of Object.keys(packs ?? {})) {
    if (!byName.has(name) && packs?.[name] !== undefined && packs?.[name] !== false) {
      diagnostics.push({
        severity: 'warning',
        code: 'pack_unknown',
        message: `pack "${name}" is not registered by the host`,
      });
    }
  }
  return { enabled, diagnostics };
}

export function resolvePacks(
  def: AgentDefinition,
  registrations: PackRegistration[],
): { enabled: ResolvedPack[]; diagnostics: PackDiagnostic[] } {
  return resolveRegs(def.packs, registrations);
}

export function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
