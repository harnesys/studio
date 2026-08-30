import type {
  KnowledgeRootsPort,
  KnowledgeSettings,
  UpsertKnowledgeSettingsRequest,
} from '../../domain/knowledge-roots.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type PutKnowledgeSettingsRequest = UpsertKnowledgeSettingsRequest & {
  workspaceId: string;
};

export type PutKnowledgeSettingsInput = {
  execute(request: PutKnowledgeSettingsRequest): Promise<KnowledgeSettings>;
};

export type PutKnowledgeSettingsHooks = {
  onWatchChanged?: (workspaceId: string, watchEnabled: boolean) => void;
};

export class PutKnowledgeSettingsUseCase implements PutKnowledgeSettingsInput {
  constructor(
    private readonly knowledge: KnowledgeRootsPort,
    private readonly workspaces: WorkspaceRepository,
    private readonly hooks: PutKnowledgeSettingsHooks = {},
  ) {}

  execute(request: PutKnowledgeSettingsRequest): Promise<KnowledgeSettings> {
    if (!this.workspaces.findById(request.workspaceId)) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    const before = this.knowledge.getSettings(request.workspaceId);
    validateSettingsPatch(request, before);
    const next = this.knowledge.putSettings(request.workspaceId, request);
    if (before.watchEnabled !== next.watchEnabled) {
      this.hooks.onWatchChanged?.(request.workspaceId, next.watchEnabled);
    }
    return Promise.resolve(next);
  }
}

function validateSettingsPatch(
  request: PutKnowledgeSettingsRequest,
  current: KnowledgeSettings,
): void {
  if (request.backend !== undefined && request.backend !== 'fts' && request.backend !== 'vector') {
    throw new ValidationError('backend must be "fts" or "vector"');
  }
  const provider =
    request.embedProvider === undefined ? current.embedProvider : request.embedProvider;
  const model = request.embedModel === undefined ? current.embedModel : request.embedModel;
  const providerSet = provider != null && provider.trim() !== '';
  const modelSet = model != null && model.trim() !== '';
  if (providerSet !== modelSet) {
    throw new ValidationError('embedProvider and embedModel must both be set or both be null');
  }
  const backend = request.backend ?? current.backend;
  if (backend === 'vector' && (!providerSet || !modelSet)) {
    throw new ValidationError(
      'vector backend requires embedProvider and embedModel; set both explicitly',
    );
  }
}
