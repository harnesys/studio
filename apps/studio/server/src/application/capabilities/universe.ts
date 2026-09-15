/** Кадр `CapabilityUniverse` для composition-root Studio (spec 2026-09-15 §4):
 *  один источник для ран-таргета и каталожных перечислителей. `roster` заполняет
 *  вызывающий (`listScopedRoster` родителя) — ему нужен parent-def; здесь пустой
 *  список-заглушка до спреда. `pack.create()` внутри резолвера идёт вне рана,
 *  поэтому вызывающий оборачивает resolve в `runInHostToolScope`. */
import type { AgentMode } from '@harnesys/studio-shared';
import type {
  CapabilityUniverse,
  ModeCapabilityFields,
  PackAssignment,
  RunRegistry,
  RuntimeHandle,
} from 'harnesys';
import { aliasTool, CORE_SERVICE_TOOLS, createLoadSkillTool, createLoadToolsTool } from 'harnesys';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { Workspace } from '../../domain/workspace.port.ts';

export type CapabilityUniverseDeps = {
  /** Warm runtime handle for this workspace (`workspaceHarnesys.get` already awaited). */
  hx: RuntimeHandle;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
};

const coreServiceNames = new Set<string>(CORE_SERVICE_TOOLS);

export function buildCapabilityUniverse(
  workspace: Workspace,
  deps: CapabilityUniverseDeps,
): CapabilityUniverse {
  const registrations = [...deps.workspaceHarnesys.effectiveRegistrations(workspace)];
  // Host-assembled grant: код хоста + auto-MCP; pack-тулы живут в регистрациях,
  // а сервисы core (`load_tools`/`load_skill`/`Skill`) из реестра вырезаются —
  // их грантит только резолвер при включённом `core`.
  const baseRegistry = new Map(
    [...deps.hx.tools.registry()].filter(([name]) => !coreServiceNames.has(name)),
  );
  // handle отдаёт только list()-витрину; load_skill из гранта исполняется поверх
  // настоящего compose-реестра (FS + plugin скилы workspace). Без реестра и
  // `load_skill`/`Skill` в core-гранте не появляется (условие резолвера).
  const skills = deps.workspaceHarnesys.skillsFor(workspace.id);
  const universe: CapabilityUniverse = {
    registrations,
    baseRegistry,
    roster: [],
    fsSkills: skills,
    makeLoadTools: (registry: RunRegistry) =>
      createLoadToolsTool(new Map([...registry].map(([name, entry]) => [name, entry.def]))),
  };
  if (skills !== undefined) {
    // Ядро грантит обе формы: `load_skill` и CC-алиас `Skill` (spec §2; зеркалит
    // авто-регистрацию `create-runtime.ts:101-107` — один и тот же исполняемый реестр).
    universe.makeLoadSkill = () => {
      const loadSkill = createLoadSkillTool(skills);
      return [loadSkill, aliasTool(loadSkill, 'Skill')];
    };
  }
  return universe;
}

/** `AgentMode` → поля резолвера режима. Off-записи (`null`/`false`) в фид
 *  резолвера не попадают: для `isOn`-семантики отсутствие ≡ выкл, поведение
 *  то же, что пас-through с null внутри. */
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
