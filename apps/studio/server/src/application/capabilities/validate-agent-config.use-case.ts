/** Write-path валидация capability-конфига (spec 2026-09-15 §7 + ruling T7).
 *  Вызывается из create/update use-case'ов до записи; ошибки — `ValidationError`
 *  (HTTP → 400, tool-path → `{error}` через `runGuard`). `pack.create()` идёт вне
 *  рана, поэтому чтения выходов паков обёрнуты в `runInHostToolScope`.
 *
 *  Механика core (ruling): отсутствие ключа = хост-флаг, авто-provision
 *  `{"core":{}}` (тот же merge, что выполнит миграция T8); явный `false`/`null` =
 *  отказ от обязательного флага → 400 `core is mandatory`. Остальные правила §7 —
 *  строгий отказ с первого дня. */

import type { AgentMode, PackConfig } from '@harnesys/studio-shared';
import type { AgentDefinition, AgentPacks, PackAssignment, PackRegistration } from 'harnesys';
import { normalizePackAssignment, packTools } from 'harnesys';
import { runInHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { effectivePluginNames } from './effective-plugins.ts';

export type WorkspaceHarnesysSource =
  | WorkspaceHarnesysRegistry
  | { current: WorkspaceHarnesysRegistry | null };

export type ValidateAgentConfigDeps = {
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  /** Tool-path строится раньше реестра: late-ref той же формы, что `pluginAgentsRef`. */
  workspaceHarnesys: WorkspaceHarnesysSource;
};

export type ValidateAgentConfigRequest = {
  workspaceId: string;
  /** Себя (update) или кандидат: только для host-scope; валидацию не меняет. */
  agentId?: string;
  /** Создатель делегата; задан — включаются проверки child ⊆ creator-effective. */
  parentId?: string | null;
  capabilities: Record<string, PackConfig | null>;
  enabledPlugins?: Record<string, boolean>;
  skills?: string[];
  mcpServers?: string[];
  modes?: AgentMode[];
};

export type ValidateAgentConfigResult = {
  /** Кандидат с provisioned `core` (остальное как пришло). */
  capabilities: Record<string, PackConfig | null>;
  /** Режимы с provisioned `core` в map-форме; пустой preload не трогаем. */
  modes: AgentMode[] | undefined;
};

export type ValidateAgentConfigInput = {
  execute(request: ValidateAgentConfigRequest): Promise<ValidateAgentConfigResult>;
};

export class ValidateAgentConfigUseCase implements ValidateAgentConfigInput {
  constructor(private readonly deps: ValidateAgentConfigDeps) {}

  async execute(request: ValidateAgentConfigRequest): Promise<ValidateAgentConfigResult> {
    const registry = derefRegistry(this.deps.workspaceHarnesys);
    const workspace = this.deps.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const registrations = [...registry.effectiveRegistrations(workspace)];
    const registered = new Set(registrations.map((reg) => reg.pack.name));

    for (const name of Object.keys(toEnabledPacks(request.capabilities))) {
      if (!registered.has(name)) {
        throw new ValidationError(`unknown pack: ${name}`);
      }
    }
    // Provision раньше чтения выходов: `core` входит в грант и в наборы,
    // иначе режим с одним `core` ложно признавался шире агента.
    const capabilities = provisionCore(request.capabilities);
    const packs = toEnabledPacks(capabilities);

    const scopeAgentId = request.agentId ?? request.parentId ?? 'validate';
    const outputs = readPackOutputs(
      { workspaceId: request.workspaceId, agentId: scopeAgentId },
      packs,
      registrations,
    );
    assertOverridesValid(packs, outputs.byPack);

    const wantedPlugins = enabledNames(request.enabledPlugins);
    const installedNames =
      wantedPlugins.length > 0 || request.parentId
        ? await installedPluginNames(registry, request.workspaceId)
        : [];
    assertPluginsKnown(wantedPlugins, installedNames);
    if (request.parentId) {
      assertChildSubset({
        deps: this.deps,
        request,
        packs,
        wantedPlugins,
        installedNames,
      });
    }
    const modes = assertModesValid(request.modes, packs, outputs.union);

    return { capabilities, modes };
  }
}

/** Зеркало `isOn` из `capability-explain.ts` (библиотека его не экспортирует). */
function isPackOn(assignment: PackAssignment | null | undefined): boolean {
  return assignment !== undefined && assignment !== null && assignment !== false;
}

/** Включённые паки кандидата (`false`/`null`/отсутствие = выкл, эталон `registry.ts`). */
function toEnabledPacks(capabilities: Record<string, PackConfig | null>): AgentPacks {
  const packs: AgentPacks = {};
  for (const [name, value] of Object.entries(capabilities)) {
    if (value === null) {
      continue;
    }
    const raw: unknown = value;
    if (raw === undefined || raw === false) {
      continue;
    }
    packs[name] = normalizePackAssignment(value);
  }
  return packs;
}

/** Ruling core: явный off → 400; отсутствие → provision `{}` (merge миграции T8). */
function provisionCore(
  capabilities: Record<string, PackConfig | null>,
): Record<string, PackConfig | null> {
  const raw: unknown = capabilities.core;
  if (raw === false || raw === null) {
    throw new ValidationError('core is mandatory');
  }
  if (raw === undefined) {
    return { ...capabilities, core: {} };
  }
  return capabilities;
}

type PackOutputs = {
  byPack: Map<string, Set<string>>;
  union: Set<string>;
};

function readPackOutputs(
  scope: { workspaceId: string; agentId: string },
  packs: AgentPacks,
  registrations: PackRegistration[],
): PackOutputs {
  const candidate: AgentDefinition = {
    id: scope.agentId,
    prompts: { main: { instructions: '' } },
    graph: { nodes: {}, edges: [] },
    packs,
  };
  const byPack = new Map<string, Set<string>>();
  const union = new Set<string>();
  for (const name of Object.keys(packs)) {
    const single: AgentPacks = {};
    const assignment = packs[name];
    if (assignment !== undefined) {
      single[name] = assignment;
    }
    const names = runInHostToolScope({ ...scope, threadId: 'validate' }, () =>
      packTools({ ...candidate, packs: single }, registrations).map((tool) => tool.name),
    );
    byPack.set(name, new Set(names));
    for (const tool of names) {
      union.add(tool);
    }
  }
  return { byPack, union };
}

/** `disabledTools`/`exposure` вычитают только выход своего источника (spec §3). */
function assertOverridesValid(packs: AgentPacks, byPack: Map<string, Set<string>>): void {
  for (const [name, assignment] of Object.entries(packs)) {
    const outputs = byPack.get(name) ?? new Set<string>();
    const override = normalizePackAssignment(assignment);
    for (const tool of override.disabledTools ?? []) {
      if (!outputs.has(tool)) {
        throw new ValidationError(
          `pack "${name}": disabledTools "${tool}" is not an output of this source`,
        );
      }
    }
    for (const tool of Object.keys(override.exposure ?? {})) {
      if (!outputs.has(tool)) {
        throw new ValidationError(
          `pack "${name}": exposure override "${tool}" is not an output of this source`,
        );
      }
    }
  }
}

function enabledNames(flags: Record<string, boolean> | undefined): string[] {
  return Object.entries(flags ?? {})
    .filter(([, on]) => on === true)
    .map(([name]) => name);
}

async function installedPluginNames(
  registry: WorkspaceHarnesysRegistry,
  workspaceId: string,
): Promise<string[]> {
  return (await registry.loadEnabledPlugins(workspaceId)).map((entry) => entry.record.name);
}

function assertPluginsKnown(wanted: string[], installed: string[]): void {
  const known = new Set(installed);
  for (const name of wanted) {
    if (!known.has(name)) {
      throw new ValidationError(`unknown plugin: ${name}`);
    }
  }
}

/** Делегат: источники ребёнка ⊆ effective-набора создателя (spec §7.2), без clamping. */
function assertChildSubset(args: {
  deps: ValidateAgentConfigDeps;
  request: ValidateAgentConfigRequest;
  packs: AgentPacks;
  wantedPlugins: string[];
  installedNames: string[];
}): void {
  const { deps, request, packs, wantedPlugins, installedNames } = args;
  const parent = deps.agents.findById(request.parentId ?? '');
  if (!parent || parent.workspaceId !== request.workspaceId) {
    throw new ValidationError('parent agent not found');
  }
  const parentPacks = new Set(
    Object.entries(parent.capabilities)
      .filter(([, value]) => {
        const raw: unknown = value;
        return raw !== undefined && raw !== null && raw !== false;
      })
      .map(([name]) => name),
  );
  for (const name of Object.keys(packs)) {
    if (!parentPacks.has(name)) {
      throw new ValidationError(`недоступно создателю: pack:${name}`);
    }
  }
  const parentEffective = effectivePluginNames(installedNames, parent.enabledPlugins);
  for (const name of wantedPlugins) {
    if (!parentEffective.has(name)) {
      throw new ValidationError(`недоступно создателю: plugin:${name}`);
    }
  }
  for (const skill of request.skills ?? []) {
    if (!parent.skills.includes(skill)) {
      throw new ValidationError(`недоступно создателю: skill:${skill}`);
    }
  }
  for (const server of request.mcpServers ?? []) {
    if (!parent.mcpServers.includes(server)) {
      throw new ValidationError(`недоступно создателю: mcp:${server}`);
    }
  }
}

/** Режим — сужение агента: packs ⊆ гранта, overrides ⊆ выхода источников (spec §7.5). */
function assertModesValid(
  modes: AgentMode[] | undefined,
  packs: AgentPacks,
  union: Set<string>,
): AgentMode[] | undefined {
  if (modes === undefined) {
    return undefined;
  }
  let changed = false;
  const next = modes.map((mode) => {
    const packMap = mode.packs;
    if (packMap !== undefined && Object.keys(packMap).length > 0) {
      const modeCore: unknown = packMap.core;
      if (modeCore === false || modeCore === null) {
        throw new ValidationError('core is mandatory');
      }
      for (const [name, assignment] of Object.entries(packMap)) {
        if (isPackOn(assignment) && packs[name] === undefined) {
          throw new ValidationError(
            `mode "${mode.id}" enables pack "${name}" that the agent does not grant`,
          );
        }
      }
    }
    for (const tool of mode.disabledTools ?? []) {
      if (!union.has(tool)) {
        throw new ValidationError(
          `mode "${mode.id}": disabledTools "${tool}" is not an output of the agent sources`,
        );
      }
    }
    for (const tool of Object.keys(mode.exposure ?? {})) {
      if (!union.has(tool)) {
        throw new ValidationError(
          `mode "${mode.id}": exposure override "${tool}" is not an output of the agent sources`,
        );
      }
    }
    if (packMap === undefined || Object.keys(packMap).length === 0) {
      return mode;
    }
    const coreRaw: unknown = packMap.core;
    if (coreRaw !== undefined) {
      return mode;
    }
    changed = true;
    return { ...mode, packs: { ...packMap, core: {} } };
  });
  return changed ? next : modes;
}

function derefRegistry(source: WorkspaceHarnesysSource): WorkspaceHarnesysRegistry {
  if ('current' in source) {
    if (source.current) {
      return source.current;
    }
    throw new ValidationError('host not ready');
  }
  return source;
}
