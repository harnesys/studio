import type { ThreadSummary } from '@harnesys/studio-shared';
import type { RunLifecycleStore } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { activeRunOf } from './active-run-record.ts';
import { pinnedFields, readFields, runModeFields } from './thread.helpers.ts';

export type ListThreadsRequest = {
  workspaceId?: string;
};

export type ListThreadsInput = {
  execute(request?: ListThreadsRequest): Promise<ThreadSummary[]>;
};

export class ListThreadsUseCase implements ListThreadsInput {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
    private readonly lifecycle?: RunLifecycleStore,
  ) {}

  async execute(request?: ListThreadsRequest): Promise<ThreadSummary[]> {
    const workspaceId = request?.workspaceId ?? this.workspaces.list()[0]?.id;
    if (!workspaceId) {
      return [];
    }
    const ws = this.workspaces.findById(workspaceId);
    if (!ws) {
      return [];
    }
    const rows = this.threads.listByWorkspace(workspaceId);
    return await Promise.all(
      rows.map(async (t) => {
        const agent = this.agents.findById(t.agentId);
        const active = this.lifecycle ? await this.lifecycle.activeByThread(t.id) : null;
        return {
          id: t.id,
          title: t.title,
          agentId: t.agentId,
          originAgentId: t.originAgentId,
          agentName: agent?.name ?? '',
          workspaceId: t.workspaceId,
          kind: t.kind,
          parentThreadId: t.parentThreadId ?? null,
          forkAt: t.forkAt ?? null,
          inheritedEventCount: 0,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          ...readFields(t),
          ...pinnedFields(t),
          ...runModeFields(t),
          activeRun: activeRunOf(active),
        };
      }),
    );
  }
}
