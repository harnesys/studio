import type { KnowledgeRootsPort, KnowledgeSettings } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type GetKnowledgeSettingsRequest = {
  workspaceId: string;
};

export type GetKnowledgeSettingsInput = {
  execute(request: GetKnowledgeSettingsRequest): Promise<KnowledgeSettings>;
};

export class GetKnowledgeSettingsUseCase implements GetKnowledgeSettingsInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  execute(request: GetKnowledgeSettingsRequest): Promise<KnowledgeSettings> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve(this.knowledge.getSettings(request.workspaceId));
  }
}
