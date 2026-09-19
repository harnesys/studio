import type { KnowledgeIndexState, KnowledgeRootsPort } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type CancelKnowledgeIndexRequest = {
  workspaceId: string;
};
export type CancelKnowledgeIndexInput = {
  execute(request: CancelKnowledgeIndexRequest): Promise<KnowledgeIndexState>;
};
export class CancelKnowledgeIndexUseCase implements CancelKnowledgeIndexInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(request: CancelKnowledgeIndexRequest): Promise<KnowledgeIndexState> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve(this.knowledge.cancelIndex(request.workspaceId));
  }
}
