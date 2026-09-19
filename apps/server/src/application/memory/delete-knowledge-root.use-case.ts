import type { KnowledgeRootsPort } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type DeleteKnowledgeRootRequest = {
  workspaceId: string;
  path: string;
};
export type DeleteKnowledgeRootInput = {
  execute(request: DeleteKnowledgeRootRequest): Promise<void>;
};
export class DeleteKnowledgeRootUseCase implements DeleteKnowledgeRootInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(request: DeleteKnowledgeRootRequest): Promise<void> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    const path = request.path.trim();
    if (!path) {
      return Promise.reject(new ValidationError('path required'));
    }
    this.knowledge.deleteRoot(request.workspaceId, path);
    return Promise.resolve();
  }
}
