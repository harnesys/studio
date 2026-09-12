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
import { createLoadSkillTool } from '../skills/create-load-skill-tool.ts';
import { filterSkills } from '../skills/skills-catalog.ts';
import { aliasTool } from '../tools/tool-alias.ts';
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

/** Names excluded during the build owning a run map (create threw without
 *  ports). Sidecar: the map itself stays a plain name → output index. */
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

/** Call each enabled pack `create` exactly once; narrow catch keeps the
 *  port-missing case a warning while real create failures propagate. */
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

/** Subset a memoized run map for an agent def (run start, handoff, child).
 *  Packs the def enables but the map lacks are reported, not created. */
export function selectPackOutputs(
  def: AgentDefinition,
  outputs: PackRunMap,
): { enabled: PackRunOutput[]; diagnostics: PackDiagnostic[] } {
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

export function attachPackTools(
  runRegistry: Map<string, ToolDefinition>,
  enabled: PackRunOutput[],
  deferredPacks?: readonly string[],
  logger?: Logger,
): void {
  const deferred = deferredPacks === undefined ? undefined : new Set(deferredPacks);
  for (const out of enabled) {
    const markDeferred = deferred?.has(out.reg.pack.name) === true;
    for (const t of out.tools) {
      if (runRegistry.has(t.name)) {
        printPackDiagnostics(
          [
            {
              severity: 'warning',
              code: 'pack_tool_collision',
              message: `pack "${out.reg.pack.name}" tool "${t.name}" collides with an existing tool and was dropped`,
            },
          ],
          logger,
        );
        continue;
      }
      runRegistry.set(t.name, markDeferred ? { ...t, exposure: 'deferred' } : t);
    }
  }
}

export type AttachPackRunInput = {
  def: AgentDefinition;
  registrations: PackRegistration[];
  runRegistry: Map<string, ToolDefinition>;
  fsSkills?: SkillRegistry;
  scopeFallback?: () => CapabilityScope;
  deferredPacks?: readonly string[];
  logger?: Logger;
};

/** Build memoized pack outputs for a run, register their tools, and register
 *  one `load_skill` tool over the FS + pack skills catalog. Returns the map. */
export function attachPackRun(input: AttachPackRunInput): PackRunMap {
  const { outputs, enabled, diagnostics } = buildPackRun(
    input.def,
    input.registrations,
    input.scopeFallback ?? fallbackScope,
  );
  printPackDiagnostics(diagnostics, input.logger);
  attachPackTools(input.runRegistry, enabled, input.deferredPacks, input.logger);
  registerPackSkillTool(input.runRegistry, enabled, input.def, input.fsSkills);
  return outputs;
}

/** FS + pack skills merged, narrowed to the agent allowlist (`def.skills`). */
export function effectiveSkillRegistry(
  def: AgentDefinition,
  fsSkills: SkillRegistry | undefined,
  outputs: PackRunOutput[],
): SkillRegistry {
  const merged = combineSkillRegistries(
    fsSkills,
    outputs.flatMap((o) => o.skills),
  );
  return def.skills !== undefined ? filterSkills(merged, def.skills) : merged;
}

function registerPackSkillTool(
  runRegistry: Map<string, ToolDefinition>,
  enabled: PackRunOutput[],
  def: AgentDefinition,
  fsSkills?: SkillRegistry,
): void {
  const effective = effectiveSkillRegistry(def, fsSkills, enabled);
  if (fsSkills !== undefined || enabled.some((o) => o.skills.length > 0)) {
    const loadSkill = createLoadSkillTool(effective);
    runRegistry.set('load_skill', loadSkill);
    // Claude-style plugins address the loader as `Skill`; symlink when free.
    if (!runRegistry.has('Skill')) {
      runRegistry.set('Skill', aliasTool(loadSkill, 'Skill'));
    }
  }
}

export type ReusePackRunInput = {
  def: AgentDefinition;
  /** Cached map from the owning run's first segment; `create` is not called. */
  cached: PackRunMap;
  runRegistry: Map<string, ToolDefinition>;
  fsSkills?: SkillRegistry;
  deferredPacks?: readonly string[];
  logger?: Logger;
};

/** Attach tools + `load_skill` for a later segment from the cached run map.
 *  Subsets via `selectPackOutputs`; never calls pack `create`. */
export function reusePackRun(input: ReusePackRunInput): PackRunMap {
  const { enabled, diagnostics } = selectPackOutputs(input.def, input.cached);
  printPackDiagnostics(diagnostics, input.logger);
  attachPackTools(input.runRegistry, enabled, input.deferredPacks, input.logger);
  registerPackSkillTool(input.runRegistry, enabled, input.def, input.fsSkills);
  return input.cached;
}
