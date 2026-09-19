import type { AgentMode } from '@harnesys/studio-shared';
import type {
  CapabilityUniverse,
  ModeCapabilityFields,
  PackAssignment,
  RunRegistry,
  RuntimeHandle,
} from 'harnesys';
import {
  aliasTool,
  CORE_SERVICE_TOOLS,
  createLoadSkillTool,
  createLoadToolsTool,
  projectToolRegistry,
} from 'harnesys';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { Workspace } from '../../domain/workspace.port.ts';
export type CapabilityUniverseDeps = {
  hx: RuntimeHandle;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
};
const coreServiceNames = new Set<string>(CORE_SERVICE_TOOLS);
export function buildCapabilityUniverse(
  workspace: Workspace,
  deps: CapabilityUniverseDeps,
): CapabilityUniverse {
  const registrations = [...deps.workspaceHarnesys.effectiveRegistrations(workspace)];
  const baseRegistry = new Map(
    [...deps.hx.tools.registry()].filter(([name]) => !coreServiceNames.has(name)),
  );
  const skills = deps.workspaceHarnesys.skillsFor(workspace.id);
  const universe: CapabilityUniverse = {
    registrations,
    baseRegistry,
    roster: [],
    fsSkills: skills,
    makeLoadTools: (registry: RunRegistry) => createLoadToolsTool(projectToolRegistry(registry)),
  };
  if (skills !== undefined) {
    universe.makeLoadSkill = () => {
      const loadSkill = createLoadSkillTool(skills);
      return [loadSkill, aliasTool(loadSkill, 'Skill')];
    };
  }
  return universe;
}
export function toModeFields(mode: AgentMode): ModeCapabilityFields {
  const fields: ModeCapabilityFields = { id: mode.id };
  const packMap = mode.packs;
  if (packMap !== undefined) {
    const on: Record<string, PackAssignment> = {};
    for (const [name, assignment] of Object.entries(packMap)) {
      if (assignment === undefined || assignment === null || assignment === false) {
        continue;
      }
      on[name] = assignment;
    }
    fields.packs = on;
  }
  if (mode.disabledTools !== undefined) {
    fields.disabledTools = mode.disabledTools;
  }
  if (mode.exposure !== undefined) {
    fields.exposure = mode.exposure;
  }
  return fields;
}
