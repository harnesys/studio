import type { KnowledgeRootRecord, KnowledgeRootsPort } from '../../domain/knowledge-roots.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type UpsertKnowledgeRootRequest = {
  workspaceId: string;
  path: string;
  enabled?: boolean;
};

export type UpsertKnowledgeRootInput = {
  execute(request: UpsertKnowledgeRootRequest): Promise<KnowledgeRootRecord>;
};

export class UpsertKnowledgeRootUseCase implements UpsertKnowledgeRootInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  execute(request: UpsertKnowledgeRootRequest): Promise<KnowledgeRootRecord> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    const path = request.path.trim();
    if (!path) {
      return Promise.reject(new ValidationError('path required'));
    }
    return Promise.resolve(
      this.knowledge.upsertRoot({
        workspaceId: request.workspaceId,
        path,
        enabled: request.enabled,
      }),
    );
  }
}
