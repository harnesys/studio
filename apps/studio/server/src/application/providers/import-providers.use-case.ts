import type { ImportProvidersSummary, ProviderExportEntry } from '@harnesys/studio-shared';
import type {
  LlmModelRepository,
  LlmProvider,
  LlmProviderRepository,
} from '../../domain/llm-provider.port.ts';

export type ImportProvidersRequest = {
  workspaceId: string;
  providers: ProviderExportEntry[];
};

export type ImportProvidersInput = {
  execute(request: ImportProvidersRequest): Promise<ImportProvidersSummary>;
};

export class ImportProvidersUseCase implements ImportProvidersInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}

  execute(request: ImportProvidersRequest): Promise<ImportProvidersSummary> {
    const summary: ImportProvidersSummary = {
      providersCreated: 0,
      providersUpdated: 0,
      modelsCreated: 0,
      modelsUpdated: 0,
    };

    for (const entry of request.providers) {
      const existing = this.providers.findByName(request.workspaceId, entry.name);
      const provider = existing
        ? this.mergeProvider(request.workspaceId, existing.id, entry)
        : this.createProvider(request.workspaceId, entry);
      if (existing) {
        summary.providersUpdated += 1;
      } else {
        summary.providersCreated += 1;
      }

      for (const model of entry.models) {
        const existingModel = this.models.findByProviderAndName(provider.id, model.name);
        if (existingModel) {
          this.models.update(existingModel.id, { kind: model.kind, metadata: model.metadata });
          summary.modelsUpdated += 1;
        } else {
          this.models.insert({
            id: crypto.randomUUID(),
            providerId: provider.id,
            name: model.name,
            kind: model.kind,
            metadata: model.metadata ?? {},
            createdAt: provider.createdAt,
            updatedAt: provider.updatedAt,
          });
          summary.modelsCreated += 1;
        }
      }
    }

    return Promise.resolve(summary);
  }

  private mergeProvider(workspaceId: string, id: string, entry: ProviderExportEntry): LlmProvider {
    return this.providers.update(workspaceId, id, {
      driver: entry.driver,
      apiUrl: entry.apiUrl ?? null,
      apiKey: entry.apiKey ?? null,
      headers: entry.headers ?? {},
      enabled: entry.enabled,
    });
  }

  private createProvider(workspaceId: string, entry: ProviderExportEntry): LlmProvider {
    const now = new Date().toISOString();
    return this.providers.insert({
      id: crypto.randomUUID(),
      workspaceId,
      name: entry.name,
      driver: entry.driver,
      apiUrl: entry.apiUrl ?? null,
      apiKey: entry.apiKey ?? null,
      headers: entry.headers ?? {},
      enabled: entry.enabled,
      createdAt: now,
      updatedAt: now,
    });
  }
}
