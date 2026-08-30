import type { ProviderPublic } from '../../../shared/types.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { toProviderPublic } from './provider.helpers.ts';

export type ListProvidersInput = {
  execute(): Promise<ProviderPublic[]>;
};

export class ListProvidersUseCase implements ListProvidersInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}

  execute(): Promise<ProviderPublic[]> {
    const allProviders = this.providers.list();
    return Promise.resolve(
      allProviders.map((provider) => {
        const models = this.models.listByProvider(provider.id);
        return toProviderPublic(provider, models);
      }),
    );
  }
}
