/** Идентичность агента: тонкая обёртка `resolveCapabilitySet` (spec 2026-09-15 §5).
 *  Осталась для oneshot/create-runtime и миграционных потребителей без capabilitySet-таргета;
 *  Studio-раны идут через `RunTarget.capabilitySet` и эту сборку не зовут.
 *  Служебные тулы (`load_tools`/`load_skill`/`Skill`) — только через core-грант резолвера. */
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PackRegistration } from '../domain/pack.ts';
import type { Logger } from '../ports/logger.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { CapabilityUniverse, RunRegistry } from './capability-set.ts';
import { resolveCapabilitySet } from './capability-set.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import { createLoadSkillTool } from './skills/create-load-skill-tool.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { aliasTool } from './tools/tool-alias.ts';

export type AgentIdentity = {
  toolRegistry: Map<string, ToolDefinition>;
  packOutputs: PackRunMap;
};

export type ResolveAgentIdentityCtx = {
  baseRegistry: Map<string, ToolDefinition>;
  registrations: PackRegistration[];
  fsSkills?: SkillRegistry;
  logger?: Logger;
};

export function resolveAgentIdentity(
  def: AgentDefinition,
  ctx: ResolveAgentIdentityCtx,
): AgentIdentity {
  const universe: CapabilityUniverse = {
    registrations: ctx.registrations,
    baseRegistry: ctx.baseRegistry,
    roster: [],
    fsSkills: ctx.fsSkills,
    makeLoadTools: (registry: RunRegistry) => createLoadToolsTool(flatRegistry(registry)),
  };
  if (ctx.fsSkills !== undefined) {
    const skills = ctx.fsSkills;
    universe.makeLoadSkill = () => {
      const loadSkill = createLoadSkillTool(skills);
      return [loadSkill, aliasTool(loadSkill, 'Skill')];
    };
  }
  const set = resolveCapabilitySet(def, universe);
  if (set.fatal.length > 0) {
    ctx.logger?.warn(`[capabilities] ${set.fatal.join('; ')}`);
  }
  return { toolRegistry: flatRegistry(set.registry), packOutputs: set.packOutputs };
}

function flatRegistry(registry: RunRegistry): Map<string, ToolDefinition> {
  return new Map(
    [...registry].map(([name, entry]) => [name, { ...entry.def, exposure: entry.exposure }]),
  );
}
