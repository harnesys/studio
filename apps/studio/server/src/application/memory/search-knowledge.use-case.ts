import type { KnowledgeHit, KnowledgePort } from 'harnesys';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type SearchKnowledgeRequest = {
  workspaceId: string;
  query: string;
  limit?: number;
};

export type SearchKnowledgeInput = {
  execute(request: SearchKnowledgeRequest): Promise<KnowledgeHit[]>;
};

export class SearchKnowledgeUseCase implements SearchKnowledgeInput {
  constructor(
    private readonly knowledge: KnowledgePort,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  execute(request: SearchKnowledgeRequest): Promise<KnowledgeHit[]> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return this.knowledge.search({
      workspaceId: request.workspaceId,
      query: request.query,
      limit: request.limit,
    });
  }
}
