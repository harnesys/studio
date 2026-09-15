/** Инспектор effective set агента (spec 2026-09-15 §4): explain + реестр с
 *  провенансом + видимые сабагенты. Без режимного сужения (вне рана нет активного
 *  режима). `pluginName:agentName` резолвится через каталог-порт той же конвенцией,
 *  что перечислители (`:` → warm IR cache после `get(workspace)`). */

import type { AgentCapabilitiesView } from '@harnesys/studio-shared';
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
    return {
      explain: set.explain,
      registry: [...set.registry].map(([name, entry]) => ({
        name,
        exposure: entry.exposure,
        source: entry.source,
      })),
      subagents: set.subagents,
    };
  }
}
