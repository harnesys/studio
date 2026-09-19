import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeRootsPort,
} from '../../domain/knowledge-roots.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type ListKnowledgeFilesRequest = {
  workspaceId: string;
  status?: KnowledgeFileStatus;
};
export type ListKnowledgeFilesInput = {
  execute(request: ListKnowledgeFilesRequest): Promise<KnowledgeFileRecord[]>;
};
export class ListKnowledgeFilesUseCase implements ListKnowledgeFilesInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(request: ListKnowledgeFilesRequest): Promise<KnowledgeFileRecord[]> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve(this.knowledge.listFiles(request.workspaceId, request.status));
  }
}
