import type { EpisodicHit, EpisodicPort } from 'harnesys';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type SearchEpisodicRequest = {
  workspaceId: string;
  query: string;
  threadId?: string;
  limit?: number;
};

export type SearchEpisodicInput = {
  execute(request: SearchEpisodicRequest): Promise<EpisodicHit[]>;
};

export class SearchEpisodicUseCase implements SearchEpisodicInput {
  constructor(
    private readonly episodic: EpisodicPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  execute(request: SearchEpisodicRequest): Promise<EpisodicHit[]> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return this.episodic.search({
      workspaceId: request.workspaceId,
      query: request.query,
      threadId: request.threadId,
      limit: request.limit,
    });
  }
}
