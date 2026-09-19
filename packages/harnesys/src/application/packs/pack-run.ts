import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type {
  CapabilityScope,
  PackConfig,
  PackRegistration,
  PackSkill,
} from '../../domain/pack.ts';
import { CONSOLE_LOGGER, type Logger } from '../../ports/logger.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import type { LlmNoteProvider } from '../llm-notes.ts';
import { combineSkillRegistries } from '../skills/combined-skills.ts';
import { filterSkills } from '../skills/skills-catalog.ts';
import type { PackDiagnostic } from './registry.ts';
import { resolvePacks } from './registry.ts';
export type PackRunOutput = {
  reg: PackRegistration;
  config: PackConfig;
  tools: ToolDefinition[];
  skills: PackSkill[];
  notes: LlmNoteProvider[];
};
export type PackRunMap = Map<string, PackRunOutput>;
const excludedByMap = new WeakMap<PackRunMap, Set<string>>();
export function excludedPackNames(outputs: PackRunMap): ReadonlySet<string> {
  return excludedByMap.get(outputs) ?? new Set();
}
export function fallbackScope(): CapabilityScope {
  return { workspaceId: '_', agentId: '_', threadId: '_' };
}
function normalizeNotes(notes: LlmNoteProvider | LlmNoteProvider[] | undefined): LlmNoteProvider[] {
  if (notes === undefined) {
    return [];
  }
  return Array.isArray(notes) ? notes : [notes];
}
export function printPackDiagnostics(
  diagnostics: PackDiagnostic[],
  logger: Logger = CONSOLE_LOGGER,
): void {
  for (const d of diagnostics) {
    logger.warn(`[packs] ${d.code}: ${d.message}`);
  }
}
export function buildPackRun(
  def: AgentDefinition,
  registrations: PackRegistration[],
  scopeFallback: () => CapabilityScope = fallbackScope,
): {
  outputs: PackRunMap;
  enabled: PackRunOutput[];
  diagnostics: PackDiagnostic[];
  excluded: Set<string>;
} {
  const { enabled: resolved, diagnostics } = resolvePacks(def, registrations);
  const order = new Map(registrations.map((r, idx) => [r.pack.name, idx]));
  const sorted = [...resolved].sort(
    (a, b) => (order.get(a.reg.pack.name) ?? 0) - (order.get(b.reg.pack.name) ?? 0),
  );
  const outputs: PackRunMap = new Map();
  const enabled: PackRunOutput[] = [];
  const excluded = new Set<string>();
  const skillOwners = new Map<string, string>();
  for (const { reg, config } of sorted) {
    let out: {
      tools?: ToolDefinition[];
      skills?: PackSkill[];
      notes?: LlmNoteProvider | LlmNoteProvider[];
    };
    try {
      out = reg.pack.create({
        ports: reg.ports ?? {},
        spec: config.spec ?? {},
        scope: reg.resolveScope?.() ?? scopeFallback(),
      });
    } catch (err) {
      if (reg.ports !== undefined) {
        throw err;
      }
      diagnostics.push({
        severity: 'warning',
        code: 'pack_port_missing',
        message: `${reg.pack.name}: create threw without ports (${err instanceof Error ? err.message : String(err)})`,
      });
      excluded.add(reg.pack.name);
      continue;
    }
    for (const skill of out.skills ?? []) {
      const owner = skillOwners.get(skill.name);
      if (owner === undefined) {
        skillOwners.set(skill.name, reg.pack.name);
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'skill_name_collision',
          message: `skill "${skill.name}" from pack "${reg.pack.name}" collides with pack "${owner}"; keeping first`,
        });
      }
    }
    const notes = normalizeNotes(out.notes);
    const entry: PackRunOutput = {
      reg,
      config,
      tools: out.tools ?? [],
      skills: out.skills ?? [],
      notes,
    };
    outputs.set(reg.pack.name, entry);
    enabled.push(entry);
  }
  excludedByMap.set(outputs, excluded);
  return { outputs, enabled, diagnostics, excluded };
}
export function selectPackOutputs(
  def: AgentDefinition,
  outputs: PackRunMap,
): {
  enabled: PackRunOutput[];
  diagnostics: PackDiagnostic[];
} {
  const diagnostics: PackDiagnostic[] = [];
  const enabled: PackRunOutput[] = [];
  const excluded = excludedByMap.get(outputs);
  for (const [name, assignment] of Object.entries(def.packs ?? {})) {
    if (assignment === undefined || assignment === null || assignment === false) {
      continue;
    }
    const out = outputs.get(name);
    if (out === undefined) {
      if (excluded?.has(name) === true) {
        diagnostics.push({
          severity: 'warning',
          code: 'pack_port_missing',
          message: `pack "${name}" is excluded from this run: create threw without ports`,
        });
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'pack_unknown',
          message: `pack "${name}" is not available for this run`,
        });
      }
      continue;
    }
    enabled.push(out);
  }
  return { enabled, diagnostics };
}
export function effectiveSkillRegistry(
  def: AgentDefinition,
  fsSkills: SkillRegistry | undefined,
  outputs: PackRunOutput[],
): SkillRegistry {
  const merged = combineSkillRegistries(
    fsSkills,
    outputs.flatMap((o) => o.skills),
  );
  return filterSkills(merged, def.skills ?? []);
}
