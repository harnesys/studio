import type { Driver, ProviderExportBundle, ProviderExportEntry } from '../../../shared/types.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';

export type ExportProvidersInput = {
  execute(): Promise<ProviderExportBundle>;
};

export class ExportProvidersUseCase implements ExportProvidersInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}

  execute(): Promise<ProviderExportBundle> {
    const providers = this.providers.list().map((provider): ProviderExportEntry => {
      return {
        name: provider.name,
        driver: provider.driver as Driver,
        apiUrl: provider.apiUrl ?? undefined,
        apiKey: provider.apiKey ?? undefined,
        headers: provider.headers,
        enabled: provider.enabled,
        models: this.models.listByProvider(provider.id).map((model) => {
          return {
            name: model.name,
            kind: model.kind,
            metadata: model.metadata,
          };
        }),
      };
    });
    return Promise.resolve({
      version: 1,
      exportedAt: new Date().toISOString(),
      providers,
    });
  }
}
