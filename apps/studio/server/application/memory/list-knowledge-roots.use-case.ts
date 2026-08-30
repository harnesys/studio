import type { KnowledgeRootRecord, KnowledgeRootsPort } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type ListKnowledgeRootsRequest = {
  workspaceId: string;
};

export type ListKnowledgeRootsInput = {
  execute(request: ListKnowledgeRootsRequest): Promise<KnowledgeRootRecord[]>;
};

export class ListKnowledgeRootsUseCase implements ListKnowledgeRootsInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  execute(request: ListKnowledgeRootsRequest): Promise<KnowledgeRootRecord[]> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve(this.knowledge.listRoots(request.workspaceId));
  }
}
