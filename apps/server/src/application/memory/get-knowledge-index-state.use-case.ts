import type { KnowledgeIndexState, KnowledgeRootsPort } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type GetKnowledgeIndexStateRequest = {
  workspaceId: string;
};
export type GetKnowledgeIndexStateInput = {
  execute(request: GetKnowledgeIndexStateRequest): Promise<KnowledgeIndexState>;
};
export class GetKnowledgeIndexStateUseCase implements GetKnowledgeIndexStateInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(request: GetKnowledgeIndexStateRequest): Promise<KnowledgeIndexState> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve(this.knowledge.getIndexState(request.workspaceId));
  }
}
