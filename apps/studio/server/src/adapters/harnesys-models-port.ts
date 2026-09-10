import type { ModelBinding, ModelRecord, ModelsPort } from 'harnesys';
import { isDriver, ModelLookupError } from 'harnesys';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';

export function createHarnesysModelsPort(
  providers: LlmProviderRepository,
  models: LlmModelRepository,
): ModelsPort {
  return {
    get: (providerName: string, modelName: string): Promise<ModelBinding> => {
      const provider = providers.findByName(providerName);
      if (!provider) {
        return Promise.reject(new ModelLookupError(`provider ${providerName} not found`));
      }
      if (!provider.enabled) {
        return Promise.reject(new ModelLookupError(`provider ${providerName} is disabled`));
      }
      if (!isDriver(provider.driver)) {
        return Promise.reject(new ModelLookupError(`unknown driver ${provider.driver}`));
      }
      const model = models.findByProviderAndName(provider.id, modelName);
      if (!model) {
        return Promise.reject(
          new ModelLookupError(`model ${modelName} not found in provider ${providerName}`),
        );
      }
      const metadata =
        typeof model.metadata === 'object' && model.metadata !== null ? model.metadata : {};
      const record = { ...metadata, name: model.name } as ModelRecord;
      return Promise.resolve({
        name: provider.name,
        driver: provider.driver,
        apiUrl: provider.apiUrl ?? undefined,
        headers: provider.headers,
        apiKey: provider.apiKey ?? undefined,
        enabled: provider.enabled,
        model: { ...record, name: record.name },
      });
    },
  };
}
