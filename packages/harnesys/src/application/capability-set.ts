/** Capability set: источники → грант → overrides → режим → песочница → core-сервисы.
 *  Единственное решение о доступности (spec `docs/superpowers/specs/2026-09-15-capability-set-design.md`);
 *  чиста относительно `def` и `universe`. `pack.create()` вызывается тем же контрактом, что
 *  `buildPackRun` (порты/scope внутри регистраций), поэтому вызов вне рана оборачивается
 *  `runInHostToolScope` на стороне хоста. Словарь провенанса и explain-журнал — в `capability-explain.ts`. */

import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { HookBinding } from '../domain/hook.ts';
import type { PackAssignment, PackOverride, PackRegistration } from '../domain/pack.ts';
import type { PathEntrySpec } from '../domain/plugin-ir.ts';
import type { AgentRosterEntry } from '../ports/create-runtime.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition, ToolExposure } from '../ports/tools.ts';
import type {
  CapabilitySource,
  ExplainEntry,
  ExplainLog,
  RunRegistry,
} from './capability-explain.ts';
import {
  createExplainLog,
  isOn,
  overrideOf,
  PACK_PREFIX,
  packNameOf,
} from './capability-explain.ts';
import { collectPackOutputs, collectSubagents, explainMcpGrants } from './capability-outputs.ts';
import type { LlmNoteProvider } from './llm-notes.ts';
import type { PackRunMap, PackRunOutput } from './packs/pack-run.ts';
import { buildPackRun } from './packs/pack-run.ts';
import { resolveToolAlias } from './tool-aliases.ts';

export type {
  CapabilitySource,
  ExplainEntry,
  ExplainKind,
  ExplainStatus,
  RunRegistry,
  RunToolEntry,
} from './capability-explain.ts';
export { projectToolRegistry } from './capability-explain.ts';

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
  makeLoadSkill?: () => ToolDefinition[];
  mode?: ModeCapabilityFields;
  /** Слой ребёнка спавна (`sandboxUniverse`): вычесть тулы группы `agents`. */
  sandbox?: boolean;
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

/** Кадр вселенной ребёнка спавна: то же наполнение плюс флаг слоя песочницы (spec §7.4). */
export function sandboxUniverse(universe: CapabilityUniverse): CapabilityUniverse {
  return { ...universe, sandbox: true };
}

const CORE_PACK = 'core';

type Assembly = {
  registry: RunRegistry;
  ex: ExplainLog;
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
  const ex = createExplainLog();
  const asm: Assembly = { registry: new Map(), ex, fatal: [] };
  const layer = buildPackLayer(def, universe);
  grantHostTools(asm, def, universe);
  reportAssignments(asm, def, layer);
  grantPackTools(asm, layer);
  applySourceOverrides(asm, def, layer);
  subtractDisallowed(asm, def);
  applyMode(asm, def, universe.mode);
  applySandbox(asm, universe);
  grantCoreServices(asm, def, universe);
  const collected = collectPackOutputs(asm.ex, def, layer.enabled);
  const mcpServers = [...new Set(def.mcpServers ?? [])];
  explainMcpGrants(asm.ex, mcpServers);
  const subagents = collectSubagents(asm.ex, def, universe.roster);
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
    explain: ex.entries,
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
      asm.ex.deniedByUniverse(name, 'tool', `mcp:${server}`, 'server not in agent mcpServers');
      continue;
    }
    const source: CapabilitySource = server !== undefined ? `mcp:${server}` : 'host';
    asm.registry.set(name, { def: tool, exposure: tool.exposure ?? 'direct', source });
    const reason = server !== undefined ? 'mcp server grant' : 'host baseRegistry';
    asm.ex.granted(name, 'tool', source, reason);
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
    const reason = layer.excluded.has(name)
      ? 'create threw without ports'
      : 'dropped by registry validation (ports/scope or spec)';
    asm.ex.deniedByUniverse(name, 'tool', `${PACK_PREFIX}${name}`, reason);
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
        asm.ex.deniedByUniverse(tool.name, 'tool', source, `collides with ${prev.source}`);
        continue;
      }
      asm.registry.set(tool.name, { def: tool, exposure: tool.exposure ?? 'direct', source });
      if (prev !== undefined) {
        asm.ex.overrodeHost(tool.name, 'tool', source, source);
      } else {
        asm.ex.granted(tool.name, 'tool', source, 'pack create');
      }
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
    asm.ex.disabled(name, 'tool', source, `${source} disabledTools override`);
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
    const reason = `${source} exposure override`;
    if (exposure === 'deferred') {
      asm.ex.deferred(name, 'tool', source, reason);
    } else {
      asm.ex.granted(name, 'tool', source, reason);
    }
  }
}

function subtractDisallowed(asm: Assembly, def: AgentDefinition): void {
  const blocked = new Set((def.disallowedTools ?? []).map(resolveToolAlias));
  for (const [name, entry] of asm.registry) {
    if (!blocked.has(name)) {
      continue;
    }
    asm.registry.delete(name);
    asm.ex.disabled(name, 'tool', entry.source, 'agent disallowedTools');
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

/** Пустая/отсутствующая `mode.packs` = полный preload (ничего не откладывается);
 *  при непустой карте тулы паков вне неё переходят в `deferred`. */
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
    asm.ex.droppedByMode(name, 'tool', entry.source, `mode:${mode.id} preload`);
  }
}

function subtractModeLists(asm: Assembly, mode: ModeCapabilityFields): void {
  for (const name of (mode.disabledTools ?? []).map(resolveToolAlias)) {
    const entry = asm.registry.get(name);
    if (entry === undefined) {
      continue;
    }
    asm.registry.delete(name);
    asm.ex.disabled(name, 'tool', entry.source, `mode:${mode.id} disabledTools`);
  }
  for (const [name, exposure] of Object.entries(mode.exposure ?? {})) {
    const entry = asm.registry.get(name);
    if (entry === undefined) {
      continue;
    }
    entry.exposure = exposure;
  }
}

/** Песочница ребёнка (spec §7.4): вложенный спавн запрещён — тулы пака `agents` вырезаются.
 *  Тот же набор удалений, что до T6 считал движок в `graph-spawn.ts` (`def.group === 'agents'`). */
function applySandbox(asm: Assembly, universe: CapabilityUniverse): void {
  if (universe.sandbox !== true) {
    return;
  }
  for (const [name, entry] of asm.registry) {
    if (entry.def.group !== 'agents') {
      continue;
    }
    asm.registry.delete(name);
    asm.ex.deniedByUniverse(name, 'tool', entry.source, 'spawn sandbox');
  }
}

/** Core-сервисы последним слоем: служебные тулы поверх всех сужений, грант — только через `core`. */
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
    services.push(...universe.makeLoadSkill());
  }
  for (const service of services) {
    asm.registry.set(service.name, {
      def: service,
      exposure: service.exposure ?? 'direct',
      source,
    });
    asm.ex.granted(service.name, 'tool', source, 'core services');
  }
}
