import type { ProviderModelPublic } from '@harnesys/studio-shared';
import type {
  LlmModelPatch,
  LlmModelRepository,
  LlmProviderRepository,
} from '../../domain/llm-provider.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { requireProvider, toModelPublic } from './provider.helpers.ts';
export type UpdateProviderModelRequest = {
  workspaceId: string;
  providerId: string;
  modelId: string;
  name?: string;
  kind?: string;
  metadata?: unknown;
};
export type UpdateProviderModelInput = {
  execute(request: UpdateProviderModelRequest): Promise<ProviderModelPublic>;
};
export class UpdateProviderModelUseCase implements UpdateProviderModelInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}
  async execute(request: UpdateProviderModelRequest): Promise<ProviderModelPublic> {
    const provider = requireProvider(this.providers, request.workspaceId, request.providerId);
    const existing = this.models.findById(request.modelId);
    if (!existing || existing.providerId !== request.providerId) {
      throw new NotFoundError('model not found');
    }
    const patch: LlmModelPatch = {};
    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name) {
        throw new ValidationError('model name cannot be empty');
      }
      patch.name = name;
    }
    if (request.kind !== undefined) {
      patch.kind = request.kind;
    }
    if (request.metadata !== undefined) {
      patch.metadata = request.metadata;
    }
    const updated = this.models.update(request.modelId, patch);
    return await Promise.resolve(toModelPublic(updated, provider.driver));
  }
}
