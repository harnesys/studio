import type { ProviderPublic } from '@harnesys/studio-shared';
import type {
  LlmModelRepository,
  LlmProviderPatch,
  LlmProviderRepository,
} from '../../domain/llm-provider.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import { requireProvider, toProviderPublic } from './provider.helpers.ts';

export type UpdateProviderRequest = {
  id: string;
  name?: string;
  driver?: string;
  apiUrl?: string | null;
  apiKey?: string | null;
  headers?: Record<string, string>;
  enabled?: boolean;
};

export type UpdateProviderInput = {
  execute(request: UpdateProviderRequest): Promise<ProviderPublic>;
};

export class UpdateProviderUseCase implements UpdateProviderInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}

  async execute(request: UpdateProviderRequest): Promise<ProviderPublic> {
    requireProvider(this.providers, request.id);

    const patch: LlmProviderPatch = {};

    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name) {
        throw new ValidationError('provider name cannot be empty');
      }
      patch.name = name;
    }

    if (request.driver !== undefined) {
      const driver = request.driver.trim();
      if (!driver) {
        throw new ValidationError('provider driver cannot be empty');
      }
      patch.driver = driver;
    }

    if (request.apiUrl !== undefined) {
      patch.apiUrl = request.apiUrl?.trim() || null;
    }

    if (request.apiKey !== undefined) {
      patch.apiKey = request.apiKey;
    }

    if (request.headers !== undefined) {
      patch.headers = request.headers;
    }

    if (request.enabled !== undefined) {
      patch.enabled = request.enabled;
    }

    const updated = this.providers.update(request.id, patch);
    const models = this.models.listByProvider(updated.id);
    return await Promise.resolve(toProviderPublic(updated, models));
  }
}
