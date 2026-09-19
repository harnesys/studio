import type { KnowledgeRootsPort, KnowledgeStats } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type GetKnowledgeStatsRequest = {
  workspaceId: string;
};
export type GetKnowledgeStatsInput = {
  execute(request: GetKnowledgeStatsRequest): Promise<KnowledgeStats>;
};
export class GetKnowledgeStatsUseCase implements GetKnowledgeStatsInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(request: GetKnowledgeStatsRequest): Promise<KnowledgeStats> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve({
      chunkCount: this.knowledge.countChunks(request.workspaceId),
      filesByStatus: this.knowledge.countFilesByStatus(request.workspaceId),
    });
  }
}
