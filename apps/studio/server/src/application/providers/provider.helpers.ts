import {
  type Driver,
  isEffort,
  type ModelRecord,
  type ProviderModelPublic,
  type ProviderPublic,
} from '@harnesys/studio-shared';
import { resolveModel } from 'harnesys';
import type { LlmModel, LlmProvider } from '../../domain/llm-provider.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';

export function requireProvider(
  providers: { findById(id: string): LlmProvider | undefined },
  providerId: string,
): LlmProvider {
  const provider = providers.findById(providerId);
  if (!provider) {
    throw new NotFoundError('provider not found');
  }
  return provider;
}

export function requireModel(
  models: { findById(id: string): LlmModel | undefined },
  providerId: string,
  modelId: string,
): LlmModel {
  const model = models.findById(modelId);
  if (!model || model.providerId !== providerId) {
    throw new NotFoundError('model not found');
  }
  return model;
}

export function toModelPublic(model: LlmModel, _driver: string): ProviderModelPublic {
  const record = toModelRecord(model);
  const resolved = resolveModel(record);
  const chatLike = model.kind === 'chat' || model.kind === '';
  const efforts = (resolved.effort ?? []).filter(isEffort);
  return {
    ...record,
    id: model.id,
    name: model.name,
    kind: model.kind,
    metadata: model.metadata,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    missing: [],
    verified: false,
    efforts,
    contextWindow: resolved.context_length,
    pricing: resolved.pricing,
    supported_parameters: chatLike
      ? [...(resolved.supported_parameters ?? [])]
      : resolved.supported_parameters,
  };
}

export function toProviderPublic(provider: LlmProvider, models: LlmModel[]): ProviderPublic {
  return {
    id: provider.id,
    name: provider.name,
    driver: provider.driver as Driver,
    apiUrl: provider.apiUrl ?? undefined,
    hasKey: Boolean(provider.apiKey),
    headers: provider.headers,
    enabled: provider.enabled,
    models: models.map((model) => toModelPublic(model, provider.driver)),
  };
}

function toModelRecord(model: LlmModel): ModelRecord {
  const metadata =
    typeof model.metadata === 'object' && model.metadata !== null ? model.metadata : {};
  return { ...metadata, name: model.name } as ModelRecord;
}
