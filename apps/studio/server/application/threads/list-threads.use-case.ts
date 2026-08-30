import type { ThreadSummary } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { readFields } from './thread.helpers.ts';

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
  ) {}

  execute(request?: ListThreadsRequest): Promise<ThreadSummary[]> {
    const workspaceId = request?.workspaceId ?? this.workspaces.list()[0]?.id;
    if (!workspaceId) {
      return Promise.resolve([]);
    }
    const ws = this.workspaces.findById(workspaceId);
    if (!ws) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      this.threads.listByWorkspace(workspaceId).map((t) => {
        const agent = this.agents.findById(t.agentId);
        return {
          id: t.id,
          title: t.title,
          agentId: t.agentId,
          agentName: agent?.name ?? '',
          workspaceId: t.workspaceId,
          kind: t.kind,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          ...readFields(t),
        };
      }),
    );
  }
}
