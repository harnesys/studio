import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { requireModel, requireProvider } from './provider.helpers.ts';

export type DeleteProviderModelRequest = {
  providerId: string;
  modelId: string;
};

export type DeleteProviderModelInput = {
  execute(request: DeleteProviderModelRequest): Promise<void>;
};

export class DeleteProviderModelUseCase implements DeleteProviderModelInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}

  async execute(request: DeleteProviderModelRequest): Promise<void> {
    requireProvider(this.providers, request.providerId);
    requireModel(this.models, request.providerId, request.modelId);
    this.models.delete(request.modelId);
    await Promise.resolve();
  }
}
