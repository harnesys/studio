import { type DiscoveredModel, discoverModels } from 'harnesys';
import type { LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { requireProvider } from './provider.helpers.ts';

export type DiscoverProviderModelsRequest = {
  workspaceId: string;
  id: string;
};

export type DiscoverProviderModelsInput = {
  execute(request: DiscoverProviderModelsRequest): Promise<DiscoveredModel[]>;
};

export class DiscoverProviderModelsUseCase implements DiscoverProviderModelsInput {
  constructor(private readonly providers: LlmProviderRepository) {}

  execute(request: DiscoverProviderModelsRequest): Promise<DiscoveredModel[]> {
    const provider = requireProvider(this.providers, request.workspaceId, request.id);

    return discoverModels({
      driver: provider.driver,
      apiUrl: provider.apiUrl ?? undefined,
      apiKey: provider.apiKey ?? undefined,
      headers: provider.headers,
    });
  }
}
