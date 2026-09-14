/** Capability set: источники → грант → overrides → режим → legacy-мост → core-сервисы.
 *  Единственное решение о доступности (spec `docs/superpowers/specs/2026-09-15-capability-set-design.md`);
 *  чиста относительно `def` и `universe`. `pack.create()` вызывается тем же контрактом, что
 *  `buildPackRun` (порты/scope внутри регистраций), поэтому вызов вне рана оборачивается
 *  `runInHostToolScope` на стороне хоста. */

import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { HookBinding } from '../domain/hook.ts';
import type { PackAssignment, PackOverride, PackRegistration } from '../domain/pack.ts';
import type { PathEntrySpec } from '../domain/plugin-ir.ts';
import type { AgentRosterEntry } from '../ports/create-runtime.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition, ToolExposure } from '../ports/tools.ts';
import type { LlmNoteProvider } from './llm-notes.ts';
import type { PackRunMap, PackRunOutput } from './packs/pack-run.ts';
import { buildPackRun } from './packs/pack-run.ts';
import { resolveToolAlias } from './tool-aliases.ts';

/** Составная провенанс-строка: `'pack:<name>' | 'plugin:<name>' | 'mcp:<server>' | 'host'`. */
export type CapabilitySource = string;

export type RunToolEntry = {
  def: ToolDefinition;
  exposure: ToolExposure;
  source: CapabilitySource;
};

export type RunRegistry = Map<string, RunToolEntry>;

export type ExplainKind = 'tool' | 'skill' | 'mcp' | 'hook' | 'subagent' | 'note' | 'path';

export type ExplainStatus =
  | 'granted'
  | 'deferred'
  | 'disabled'
  | 'dropped-by-mode'
  | 'denied-by-universe'
  | 'overrode-host';

export type ExplainEntry = {
  item: string;
  kind: ExplainKind;
  source: CapabilitySource;
  status: ExplainStatus;
  reason: string;
};

export type ModeCapabilityFields = {
  id: string;
  packs?: Record<string, PackAssignment>;
  disabledTools?: string[];
  exposure?: Record<string, ToolExposure>;
};

export type CapabilityUniverse = {
  registrations: PackRegistration[];
  baseRegistry: Map<string, ToolDefinition>;
  roster: AgentRosterEntry[];
  fsSkills?: SkillRegistry;
  makeLoadTools: (registry: RunRegistry) => ToolDefinition;
  makeLoadSkill?: () => ToolDefinition;
  mode?: ModeCapabilityFields;
};

export type CapabilitySet = {
  registry: RunRegistry;
  packOutputs: PackRunMap;
  skills: string[];
  mcpServers: string[];
  hooks: HookBinding[];
  subagents: AgentRosterEntry[];
  notes: LlmNoteProvider[];
  pathEntries: PathEntrySpec[];
  explain: ExplainEntry[];
  fatal: string[];
};

/** Сервисы, грантимые только через `pack:core`; такие имена из baseRegistry — не грант хоста. */
export const CORE_SERVICE_TOOLS = ['load_tools', 'load_skill', 'Skill'];

const PACK_PREFIX = 'pack:';
const CORE_PACK = 'core';

type Assembly = {
  registry: RunRegistry;
  explain: ExplainEntry[];
  fatal: string[];
};

type PackLayer = {
  outputs: PackRunMap;
  enabled: PackRunOutput[];
  excluded: Set<string>;
  registered: Set<string>;
};

export function resolveCapabilitySet(
  def: AgentDefinition,
  universe: CapabilityUniverse,
): CapabilitySet {
  const asm: Assembly = { registry: new Map(), explain: [], fatal: [] };
  const layer = buildPackLayer(def, universe);
  grantHostTools(asm, def, universe);
  reportAssignments(asm, def, layer);
  grantPackTools(asm, layer);
  applySourceOverrides(asm, def, layer);
  subtractDisallowed(asm, def);
  applyMode(asm, def, universe.mode);
  applyLegacyAllowlist(asm, def);
  grantCoreServices(asm, def, universe);
  const collected = collectPackOutputs(asm, def, layer);
  const mcpServers = [...new Set(def.mcpServers ?? [])];
  explainMcpGrants(asm, mcpServers);
  const subagents = collectSubagents(asm, def, universe);
  return {
    registry: asm.registry,
    packOutputs: layer.outputs,
    skills: collected.skills,
    mcpServers,
    // plugin hooks/pathEntries приходят только с плагинами (регистраторы хоста, T6+);
    // у паковых выходов таких полей пока нет, поля готовы под будущее.
    hooks: [],
    subagents,
    notes: collected.notes,
    pathEntries: [],
    explain: asm.explain,
    fatal: asm.fatal,
  };
}

function buildPackLayer(def: AgentDefinition, universe: CapabilityUniverse): PackLayer {
  const { outputs, enabled, excluded } = buildPackRun(def, universe.registrations);
  return {
    outputs,
    enabled,
    excluded,
    registered: new Set(universe.registrations.map((r) => r.pack.name)),
  };
}

function grantHostTools(asm: Assembly, def: AgentDefinition, universe: CapabilityUniverse): void {
  const allowedServers = new Set(def.mcpServers ?? []);
  for (const [name, tool] of universe.baseRegistry) {
    if (CORE_SERVICE_TOOLS.includes(name)) {
      continue;
    }
    const server = tool.operations?.includes('mcp') === true ? tool.group : undefined;
    if (server !== undefined && !allowedServers.has(server)) {
      asm.explain.push({
        item: name,
        kind: 'tool',
        source: `mcp:${server}`,
        status: 'denied-by-universe',
        reason: 'server not in agent mcpServers',
      });
      continue;
    }
    const source: CapabilitySource = server !== undefined ? `mcp:${server}` : 'host';
    asm.registry.set(name, { def: tool, exposure: tool.exposure ?? 'direct', source });
    asm.explain.push({
      item: name,
      kind: 'tool',
      source,
      status: 'granted',
      reason: server !== undefined ? 'mcp server grant' : 'host baseRegistry',
    });
  }
}

function reportAssignments(asm: Assembly, def: AgentDefinition, layer: PackLayer): void {
  for (const [name, assignment] of Object.entries(def.packs ?? {})) {
    if (!isOn(assignment)) {
      continue;
    }
    if (!layer.registered.has(name)) {
      asm.fatal.push(`pack "${name}" is not registered by the host`);
      continue;
    }
    if (layer.outputs.has(name)) {
      continue;
    }
    asm.explain.push({
      item: name,
      kind: 'tool',
      source: `${PACK_PREFIX}${name}`,
      status: 'denied-by-universe',
      reason: layer.excluded.has(name)
        ? 'create threw without ports'
        : 'dropped by registry validation (ports/scope or spec)',
    });
    if ((overrideOf(assignment).disabledTools?.length ?? 0) > 0) {
      asm.fatal.push(`pack "${name}" carries disabledTools but the source is not active`);
    }
  }
}

function grantPackTools(asm: Assembly, layer: PackLayer): void {
  for (const out of layer.enabled) {
    const source: CapabilitySource = `${PACK_PREFIX}${out.reg.pack.name}`;
    for (const tool of out.tools) {
      const prev = asm.registry.get(tool.name);
      if (prev?.source.startsWith(PACK_PREFIX)) {
        asm.explain.push({
          item: tool.name,
          kind: 'tool',
          source,
          status: 'denied-by-universe',
          reason: `collides with ${prev.source}`,
        });
        continue;
      }
      asm.registry.set(tool.name, { def: tool, exposure: tool.exposure ?? 'direct', source });
      asm.explain.push({
        item: tool.name,
        kind: 'tool',
        source,
        status: prev !== undefined ? 'overrode-host' : 'granted',
        reason: prev !== undefined ? source : 'pack create',
      });
    }
  }
}

function applySourceOverrides(asm: Assembly, def: AgentDefinition, layer: PackLayer): void {
  for (const out of layer.enabled) {
    const ovr = overrideOf(def.packs?.[out.reg.pack.name]);
    subtractSourceDisabled(asm, out, ovr);
    applySourceExposure(asm, out, ovr);
  }
}

function subtractSourceDisabled(asm: Assembly, out: PackRunOutput, ovr: PackOverride): void {
  const source: CapabilitySource = `${PACK_PREFIX}${out.reg.pack.name}`;
  for (const name of ovr.disabledTools ?? []) {
    const entry = asm.registry.get(name);
    if (entry === undefined || entry.source !== source) {
      asm.fatal.push(`${source}: disabledTools "${name}" is not an output of this source`);
      continue;
    }
    asm.registry.delete(name);
    asm.explain.push({
      item: name,
      kind: 'tool',
      source,
      status: 'disabled',
      reason: `${source} disabledTools override`,
    });
  }
}

function applySourceExposure(asm: Assembly, out: PackRunOutput, ovr: PackOverride): void {
  const source: CapabilitySource = `${PACK_PREFIX}${out.reg.pack.name}`;
  for (const [name, exposure] of Object.entries(ovr.exposure ?? {})) {
    const entry = asm.registry.get(name);
    if (entry === undefined || entry.source !== source) {
      asm.fatal.push(`${source}: exposure override "${name}" is not an output of this source`);
      continue;
    }
    entry.exposure = exposure;
    asm.explain.push({
      item: name,
      kind: 'tool',
      source,
      status: exposure === 'deferred' ? 'deferred' : 'granted',
      reason: `${source} exposure override`,
    });
  }
}

function subtractDisallowed(asm: Assembly, def: AgentDefinition): void {
  const blocked = new Set((def.disallowedTools ?? []).map(resolveToolAlias));
  for (const [name, entry] of asm.registry) {
    if (!blocked.has(name)) {
      continue;
    }
    asm.registry.delete(name);
    asm.explain.push({
      item: name,
      kind: 'tool',
      source: entry.source,
      status: 'disabled',
      reason: 'agent disallowedTools',
    });
  }
}

function applyMode(
  asm: Assembly,
  def: AgentDefinition,
  mode: ModeCapabilityFields | undefined,
): void {
  if (mode === undefined) {
    return;
  }
  for (const [name, assignment] of Object.entries(mode.packs ?? {})) {
    if (isOn(assignment) && !isOn(def.packs?.[name])) {
      asm.fatal.push(`mode "${mode.id}" enables pack "${name}" that the agent does not grant`);
    }
  }
  markModePreload(asm, mode);
  subtractModeLists(asm, mode);
}

/** Замена `deferredPackNames`: пустая/отсутствующая `mode.packs` = полный preload (не «всё отложить»). */
function markModePreload(asm: Assembly, mode: ModeCapabilityFields): void {
  const preload = mode.packs;
  if (preload === undefined || Object.keys(preload).length === 0) {
    return;
  }
  for (const [name, entry] of asm.registry) {
    const pack = packNameOf(entry.source);
    if (pack === undefined || isOn(preload[pack]) || entry.exposure === 'deferred') {
      continue;
    }
    entry.exposure = 'deferred';
    asm.explain.push({
      item: name,
      kind: 'tool',
      source: entry.source,
      status: 'dropped-by-mode',
      reason: `mode:${mode.id} preload`,
    });
  }
}

function subtractModeLists(asm: Assembly, mode: ModeCapabilityFields): void {
  for (const name of (mode.disabledTools ?? []).map(resolveToolAlias)) {
    const entry = asm.registry.get(name);
    if (entry === undefined) {
      continue;
    }
    asm.registry.delete(name);
    asm.explain.push({
      item: name,
      kind: 'tool',
      source: entry.source,
      status: 'disabled',
      reason: `mode:${mode.id} disabledTools`,
    });
  }
  for (const [name, exposure] of Object.entries(mode.exposure ?? {})) {
    const entry = asm.registry.get(name);
    if (entry === undefined) {
      continue;
    }
    entry.exposure = exposure;
  }
}

/** Legacy-мост до T6: `def.tools` — пересечение финального реестра по allowlist. */
function applyLegacyAllowlist(asm: Assembly, def: AgentDefinition): void {
  if (def.tools === undefined) {
    return;
  }
  const requested = new Set((def.tools ?? []).map(resolveToolAlias));
  for (const [name, entry] of asm.registry) {
    if (requested.has(name)) {
      continue;
    }
    asm.registry.delete(name);
    asm.explain.push({
      item: name,
      kind: 'tool',
      source: entry.source,
      status: 'denied-by-universe',
      reason: 'legacy tools allowlist',
    });
  }
}

/** Core-сервисы после legacy-моста: как сегодня `create-runtime.ts` — служебные тулы поверх фильтра. */
function grantCoreServices(
  asm: Assembly,
  def: AgentDefinition,
  universe: CapabilityUniverse,
): void {
  if (!isOn(def.packs?.[CORE_PACK])) {
    return;
  }
  const source: CapabilitySource = `${PACK_PREFIX}${CORE_PACK}`;
  const services = [universe.makeLoadTools(asm.registry)];
  if (universe.fsSkills !== undefined && universe.makeLoadSkill !== undefined) {
    services.push(universe.makeLoadSkill());
  }
  for (const service of services) {
    asm.registry.set(service.name, {
      def: service,
      exposure: service.exposure ?? 'direct',
      source,
    });
    asm.explain.push({
      item: service.name,
      kind: 'tool',
      source,
      status: 'granted',
      reason: 'core services',
    });
  }
}

function collectPackOutputs(
  asm: Assembly,
  def: AgentDefinition,
  layer: PackLayer,
): { skills: string[]; notes: LlmNoteProvider[] } {
  const skills: string[] = [];
  const notes: LlmNoteProvider[] = [];
  const seen = new Set<string>();
  const allowedSkills = new Set(def.skills ?? []);
  for (const out of layer.enabled) {
    const source: CapabilitySource = `${PACK_PREFIX}${out.reg.pack.name}`;
    for (const skill of out.skills) {
      if (seen.has(skill.name)) {
        asm.explain.push({
          item: skill.name,
          kind: 'skill',
          source,
          status: 'denied-by-universe',
          reason: 'skill name collides with an earlier pack output',
        });
        continue;
      }
      seen.add(skill.name);
      if (!allowedSkills.has(skill.name)) {
        asm.explain.push({
          item: skill.name,
          kind: 'skill',
          source,
          status: 'denied-by-universe',
          reason: 'not in agent skills allowlist',
        });
        continue;
      }
      skills.push(skill.name);
      asm.explain.push({
        item: skill.name,
        kind: 'skill',
        source,
        status: 'granted',
        reason: 'pack output',
      });
    }
    for (const note of out.notes) {
      notes.push(note);
      const item = `${out.reg.pack.name}#note${notes.length}`;
      asm.explain.push({ item, kind: 'note', source, status: 'granted', reason: 'pack output' });
    }
  }
  return { skills, notes };
}

function explainMcpGrants(asm: Assembly, mcpServers: string[]): void {
  for (const server of mcpServers) {
    asm.explain.push({
      item: server,
      kind: 'mcp',
      source: `mcp:${server}`,
      status: 'granted',
      reason: 'agent mcpServers',
    });
  }
}

function collectSubagents(
  asm: Assembly,
  def: AgentDefinition,
  universe: CapabilityUniverse,
): AgentRosterEntry[] {
  const subagents: AgentRosterEntry[] = [];
  for (const entry of universe.roster) {
    const plugin = entry.plugin;
    if (plugin !== undefined && def.enabledPlugins?.[plugin] !== true) {
      asm.explain.push({
        item: entry.name,
        kind: 'subagent',
        source: `plugin:${plugin}`,
        status: 'disabled',
        reason: 'plugin not enabled for agent',
      });
      continue;
    }
    const source: CapabilitySource = plugin === undefined ? 'host' : `plugin:${plugin}`;
    subagents.push(entry);
    asm.explain.push({
      item: entry.name,
      kind: 'subagent',
      source,
      status: 'granted',
      reason: 'host roster',
    });
  }
  return subagents;
}

function isOn(assignment: PackAssignment | undefined): boolean {
  return assignment !== undefined && assignment !== null && assignment !== false;
}

function overrideOf(assignment: PackAssignment | undefined): PackOverride {
  if (typeof assignment === 'object' && assignment !== null) {
    return assignment;
  }
  return {};
}

function packNameOf(source: CapabilitySource): string | undefined {
  return source.startsWith(PACK_PREFIX) ? source.slice(PACK_PREFIX.length) : undefined;
}
