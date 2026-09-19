import Ajv from 'ajv';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { AgentPacks, PackConfig, PackRegistration } from '../../domain/pack.ts';
import type { SettingDefaultSpec } from '../../domain/plugin-ir.ts';
export type ResolvedPack = {
  reg: PackRegistration;
  config: PackConfig;
};
export type PackSettingDefaults = Record<string, SettingDefaultSpec[]>;
export type PackDiagnosticCode =
  | 'pack_unknown'
  | 'pack_port_missing'
  | 'pack_tools_empty'
  | 'skill_name_collision'
  | 'spec_invalid';
export type PackDiagnostic = {
  severity: 'warning';
  code: PackDiagnosticCode;
  message: string;
};
const ajv = new Ajv({ strict: false, allErrors: true });
type RegLike = {
  pack: {
    name: string;
    specSchema?: unknown;
  };
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
  settingDefaults?: PackSettingDefaults,
): {
  enabled: Array<{
    reg: R;
    config: PackConfig;
  }>;
  diagnostics: PackDiagnostic[];
} {
  const diagnostics: PackDiagnostic[] = [];
  const byName = new Map(registrations.map((r) => [r.pack.name, r]));
  const enabled: Array<{
    reg: R;
    config: PackConfig;
  }> = [];
  const sorted = [...registrations].sort((a, b) => (a.pack.name < b.pack.name ? -1 : 1));
  for (const reg of sorted) {
    const assigned = enabledConfig(reg, packs);
    if (assigned === null) {
      continue;
    }
    const defaults = settingDefaults?.[reg.pack.name];
    const config: PackConfig =
      defaults !== undefined && defaults.length > 0
        ? { ...assigned, spec: applySettingDefaults(assigned.spec, defaults) }
        : assigned;
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
export function applySettingDefaults(
  spec: Record<string, unknown> | undefined,
  defaults: readonly SettingDefaultSpec[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(spec ?? {}) };
  for (const entry of defaults) {
    merged[entry.key] = overlayDefault(merged[entry.key], entry.value);
  }
  return merged;
}
function overlayDefault(explicit: unknown, fallback: unknown): unknown {
  if (explicit === undefined) {
    return fallback;
  }
  if (isPlainObject(explicit) && isPlainObject(fallback)) {
    return overlayObjects(fallback, explicit);
  }
  return explicit;
}
function overlayObjects(
  fallback: Record<string, unknown>,
  explicit: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fallback };
  for (const [key, value] of Object.entries(explicit)) {
    const base = out[key];
    out[key] = isPlainObject(base) && isPlainObject(value) ? overlayObjects(base, value) : value;
  }
  return out;
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function resolvePacks(
  def: AgentDefinition,
  registrations: PackRegistration[],
  settingDefaults?: PackSettingDefaults,
): {
  enabled: ResolvedPack[];
  diagnostics: PackDiagnostic[];
} {
  return resolveRegs(def.packs, registrations, settingDefaults);
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
