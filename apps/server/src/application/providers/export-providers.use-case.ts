import type { Driver, ProviderExportBundle, ProviderExportEntry } from '@harnesys/studio-shared';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
export type ExportProvidersRequest = {
  workspaceId: string;
};
export type ExportProvidersInput = {
  execute(request: ExportProvidersRequest): Promise<ProviderExportBundle>;
};
export class ExportProvidersUseCase implements ExportProvidersInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}
  execute(request: ExportProvidersRequest): Promise<ProviderExportBundle> {
    const providers = this.providers
      .list(request.workspaceId)
      .map((provider): ProviderExportEntry => {
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
