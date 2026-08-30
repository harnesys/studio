import type { ProviderPublic } from '../../../shared/types.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import { toProviderPublic } from './provider.helpers.ts';

export type CreateProviderRequest = {
  name: string;
  driver: string;
  apiUrl?: string | null;
  apiKey?: string | null;
  headers?: Record<string, string>;
  enabled?: boolean;
};

export type CreateProviderInput = {
  execute(request: CreateProviderRequest): Promise<ProviderPublic>;
};

export class CreateProviderUseCase implements CreateProviderInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models?: LlmModelRepository,
  ) {}

  async execute(request: CreateProviderRequest): Promise<ProviderPublic> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('provider name cannot be empty');
    }
    const driver = request.driver?.trim();
    if (!driver) {
      throw new ValidationError('provider driver cannot be empty');
    }

    const now = new Date().toISOString();
    const inserted = this.providers.insert({
      id: crypto.randomUUID(),
      name,
      driver,
      apiUrl: request.apiUrl?.trim() || null,
      apiKey: request.apiKey ?? null,
      headers: request.headers ?? {},
      enabled: request.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });

    const models = this.models ? this.models.listByProvider(inserted.id) : [];
    return await Promise.resolve(toProviderPublic(inserted, models));
  }
}
