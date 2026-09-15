/** Кадр `CapabilityUniverse` для composition-root Studio (spec 2026-09-15 §4):
 *  один источник для ран-таргета и каталожных перечислителей. `roster` заполняет
 *  вызывающий (`listScopedRoster` родителя) — ему нужен parent-def; здесь пустой
 *  список-заглушка до спреда. `pack.create()` внутри резолвера идёт вне рана,
 *  поэтому вызывающий оборачивает resolve в `runInHostToolScope` (тот же контракт,
 *  что у `closed-world-materialization`). */
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
    universe.makeLoadSkill = () => aliasTool(createLoadSkillTool(skills), 'Skill');
  }
  return universe;
}

/** `AgentMode` → поля резолвера режима. `disabledTools`/`exposure` у modes ещё нет
 *  (T7 заведёт); нормализатор packs transitional — см. `normalizeModePackMap`. */
export function toModeFields(
  mode: AgentMode,
  toPackMap: (value: string[] | undefined) => Record<string, PackAssignment> | undefined,
): ModeCapabilityFields {
  return { id: mode.id, packs: toPackMap(mode.packs) };
}
