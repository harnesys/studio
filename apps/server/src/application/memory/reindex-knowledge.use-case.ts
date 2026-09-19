import type { KnowledgeIndexState, KnowledgeRootsPort } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type ReindexKnowledgeRequest = {
  workspaceId: string;
};
export type ReindexKnowledgeInput = {
  execute(request: ReindexKnowledgeRequest): Promise<KnowledgeIndexState>;
};
export class ReindexKnowledgeUseCase implements ReindexKnowledgeInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(request: ReindexKnowledgeRequest): Promise<KnowledgeIndexState> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return this.knowledge.startReindex(request.workspaceId);
  }
}
