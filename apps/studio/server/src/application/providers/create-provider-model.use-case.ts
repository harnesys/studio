import type { ProviderModelPublic } from '@harnesys/studio-shared';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import { requireProvider, toModelPublic } from './provider.helpers.ts';

export type CreateProviderModelRequest = {
  workspaceId: string;
  providerId: string;
  name: string;
  kind?: string;
  metadata?: unknown;
};

export type CreateProviderModelInput = {
  execute(request: CreateProviderModelRequest): Promise<ProviderModelPublic>;
};

export class CreateProviderModelUseCase implements CreateProviderModelInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}

  async execute(request: CreateProviderModelRequest): Promise<ProviderModelPublic> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('model name cannot be empty');
    }
    const provider = requireProvider(this.providers, request.workspaceId, request.providerId);

    const now = new Date().toISOString();
    const inserted = this.models.insert({
      id: crypto.randomUUID(),
      providerId: provider.id,
      name,
      kind: request.kind?.trim() || 'chat',
      metadata: request.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });

    return await Promise.resolve(toModelPublic(inserted, provider.driver));
  }
}
