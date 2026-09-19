import type { Driver, ModelBinding, ModelRecord, ProviderConfig } from '../../ports/models.ts';
import { DRIVERS } from '../../ports/models.ts';
export class ModelLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelLookupError';
  }
}
export class DiscoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoverError';
  }
}
export function isDriver(value: string): value is Driver {
  return (DRIVERS as readonly string[]).includes(value);
}
export function bindingOf(provider: ProviderConfig, modelName: string): ModelBinding {
  if (!isDriver(provider.driver)) {
    throw new ModelLookupError(`unknown driver ${provider.driver}`);
  }
  if (provider.enabled === false) {
    throw new ModelLookupError(`provider ${provider.name} is disabled`);
  }
  const record = provider.models.find((item) => item.name === modelName);
  if (!record) {
    throw new ModelLookupError(`model ${modelName} not found`);
  }
  return toBinding(provider, record);
}
export function toBinding(provider: ProviderConfig, record: ModelRecord): ModelBinding {
  if (!isDriver(provider.driver)) {
    throw new ModelLookupError(`unknown driver ${provider.driver}`);
  }
  return {
    name: provider.name,
    driver: provider.driver as Driver,
    apiUrl: provider.apiUrl,
    headers: provider.headers,
    apiKey: provider.apiKey,
    enabled: provider.enabled !== false,
    model: {
      ...record,
      name: record.name,
    },
  };
}
