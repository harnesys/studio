import type { ProviderPublic } from '@harnesys/studio-shared';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { toProviderPublic } from './provider.helpers.ts';

export type ListProvidersRequest = {
  workspaceId: string;
};

export type ListProvidersInput = {
  execute(request: ListProvidersRequest): Promise<ProviderPublic[]>;
};

export class ListProvidersUseCase implements ListProvidersInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}

  execute(request: ListProvidersRequest): Promise<ProviderPublic[]> {
    const allProviders = this.providers.list(request.workspaceId);
    return Promise.resolve(
      allProviders.map((provider) => {
        const models = this.models.listByProvider(provider.id);
        return toProviderPublic(provider, models);
      }),
    );
  }
}
