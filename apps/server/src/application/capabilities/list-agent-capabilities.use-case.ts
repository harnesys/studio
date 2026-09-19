/** Инспектор effective set агента (spec 2026-09-15 §4): explain + реестр с
 *  провенансом + видимые сабагенты. Без режимного сужения (вне рана нет активного
 *  режима). `pluginName:agentName` резолвится через каталог-порт той же конвенцией,
 *  что перечислители (`:` → warm IR cache после `get(workspace)`). */

import type { AgentCapabilitiesView } from '@harnesys/studio-shared';
import type {
  CapabilitySource,
  ExplainEntry,
  ExplainKind,
  PluginComponent,
  PluginKind,
  SkillSummary,
} from 'harnesys';
import { resolveCapabilitySet } from 'harnesys';
import { runInHostToolScope } from '../../adapters/host-tool-scope.ts';
import { dbAgentDefinition } from '../../adapters/workspace-agent-definitions.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { buildCapabilityUniverse } from './universe.ts';

export type ListAgentCapabilitiesRequest = {
  /** Пуст + id с `:` (plugin-агент): workspace обязателен запросом. */
  workspaceId?: string;
  agentId: string;
};

export type ListAgentCapabilitiesInput = {
  execute(request: ListAgentCapabilitiesRequest): Promise<AgentCapabilitiesView>;
};

export type ListAgentCapabilitiesDeps = {
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
};

export class ListAgentCapabilitiesUseCase implements ListAgentCapabilitiesInput {
  constructor(private readonly deps: ListAgentCapabilitiesDeps) {}

  async execute(request: ListAgentCapabilitiesRequest): Promise<AgentCapabilitiesView> {
    const row = this.deps.agents.findById(request.agentId);
    const workspaceId = request.workspaceId ?? row?.workspaceId;
    if (!workspaceId) {
      throw new NotFoundError('agent not found');
    }
    const workspace = this.deps.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    // Прогрев: runtime собирает skills/skills-IR cache, без него `:`-id не резолвится.
    const hx = await this.deps.workspaceHarnesys.get(workspace);
    const def =
      row && row.workspaceId === workspaceId
        ? dbAgentDefinition(row, {})
        : this.deps.workspaceHarnesys.resolveAgentDefinition(request.agentId);
    if (!def) {
      throw new NotFoundError('agent not found');
    }
    const universe = buildCapabilityUniverse(workspace, {
      hx,
      workspaceHarnesys: this.deps.workspaceHarnesys,
    });
    const set = runInHostToolScope({ workspaceId, agentId: def.id, threadId: 'capabilities' }, () =>
      resolveCapabilitySet(def, {
        ...universe,
        roster: this.deps.workspaceHarnesys.listScopedRoster(def),
      }),
    );
    const looseListed: SkillSummary[] =
      universe.fsSkills === undefined ? [] : await universe.fsSkills.list();
    const pluginRows = await this.deps.workspaceHarnesys.loadEnabledPlugins(workspaceId);
    return {
      explain: [
        ...set.explain,
        ...explainLooseSkills(def.skills ?? [], set.explain, looseListed),
        ...explainPlugins(def, pluginRows),
        ...explainAgentHooks(def.hooks ?? []),
      ],
      registry: [...set.registry].map(([name, entry]) => ({
        name,
        exposure: entry.exposure,
        source: entry.source,
      })),
      subagents: set.subagents,
    };
  }
}

/** Loose fs/plugin-registry skills: имена без explain-строки резолвера получают
 *  host-строку (fs-реестр) либо отказ «no source». Резолвер их не видит: они не
 *  выходы паков (plugin-скилы назовёт строкой ниже `explainPlugins`). */
function explainLooseSkills(
  wanted: string[],
  entries: ExplainEntry[],
  listed: SkillSummary[],
): ExplainEntry[] {
  if (wanted.length === 0) {
    return [];
  }
  const covered = new Set(
    entries.filter((entry) => entry.kind === 'skill').map((entry) => entry.item),
  );
  const known = new Set(listed.map((skill) => skill.name));
  const rows: ExplainEntry[] = [];
  for (const name of wanted) {
    if (covered.has(name)) {
      continue;
    }
    rows.push(
      known.has(name)
        ? {
            item: name,
            kind: 'skill',
            source: 'host',
            status: 'granted',
            reason: 'workspace skill registry',
          }
        : {
            item: name,
            kind: 'skill',
            source: 'host',
            status: 'denied-by-universe',
            reason: 'no source provides this skill',
          },
    );
  }
  return rows;
}

/** Plugin-компоненты включённых плагинов (skill/hook/mcp-server): карточка плагина
 *  в UI иначе показывает fallback-hint. grant-статус уже пересчитан в gated IR. */
function explainPlugins(
  def: { enabledPlugins?: Record<string, boolean> },
  plugins: { record: { name: string }; ir: { components: PluginComponent[] } }[],
): ExplainEntry[] {
  const rows: ExplainEntry[] = [];
  for (const loaded of plugins) {
    if (def.enabledPlugins?.[loaded.record.name] !== true) {
      continue;
    }
    const source: CapabilitySource = `plugin:${loaded.record.name}`;
    for (const component of loaded.ir.components) {
      const kind = componentKind(component.kind);
      if (kind === undefined) {
        continue;
      }
      const item = componentItem(component);
      if (item === undefined) {
        continue;
      }
      rows.push(
        component.status === 'native'
          ? { item, kind, source, status: 'granted', reason: 'plugin component' }
          : {
              item,
              kind,
              source,
              status: 'denied-by-universe',
              reason: `plugin component ${component.status}`,
            },
      );
    }
  }
  return rows;
}

function componentKind(kind: PluginKind): ExplainKind | undefined {
  if (kind === 'skill') {
    return 'skill';
  }
  if (kind === 'hook') {
    return 'hook';
  }
  return kind === 'mcp-server' ? 'mcp' : undefined;
}

function componentItem(component: PluginComponent): string | undefined {
  if (component.kind === 'skill') {
    return (component.spec as { name?: string }).name;
  }
  if (component.kind === 'hook') {
    const binding = (component.spec as { binding?: { event?: string; id?: string } }).binding;
    return binding?.id ?? binding?.event;
  }
  if (component.kind === 'mcp-server') {
    return (component.spec as { serverId?: string }).serverId;
  }
  return undefined;
}

/** Агентные хуки (`def.hooks`): резолвер их не перечисляет (выход паков пуст). */
function explainAgentHooks(hooks: { event: string; handler: { type: string } }[]): ExplainEntry[] {
  return hooks.map((hook) => ({
    item: `${hook.event}→${hook.handler.type}`,
    kind: 'hook' as const,
    source: 'agent',
    status: 'granted' as const,
    reason: 'agent hooks binding',
  }));
}
