import type { ProviderPublic } from '@harnesys/studio-shared';

export type EmbedModelOption = {
  value: string;
  name: string;
  provider: string;
};

export type EmbedModelGroup = {
  provider: string;
  models: EmbedModelOption[];
};

export const EMBED_NONE = '__none__';

export function embedModelGroups(providers: ProviderPublic[]): EmbedModelGroup[] {
  return providers
    .map((provider) => ({
      provider: provider.name,
      models: provider.models
        .filter((model) => model.kind === 'embed')
        .map((model) => ({
          value: model.id,
          name: model.name,
          provider: provider.name,
        })),
    }))
    .filter((group) => group.models.length > 0);
}

export function findEmbedModelId(
  providers: ProviderPublic[],
  embedProvider: string | null,
  embedModel: string | null,
): string | null {
  if (!embedProvider || !embedModel) {
    return null;
  }
  const provider = providers.find((item) => item.name === embedProvider);
  const model = provider?.models.find((item) => item.name === embedModel && item.kind === 'embed');
  return model?.id ?? null;
}

export function resolveEmbedSelection(
  providers: ProviderPublic[],
  modelId: string | null,
): { embedProvider: string | null; embedModel: string | null } {
  if (!modelId || modelId === EMBED_NONE) {
    return { embedProvider: null, embedModel: null };
  }
  for (const provider of providers) {
    const model = provider.models.find((item) => item.id === modelId);
    if (model) {
      return { embedProvider: provider.name, embedModel: model.name };
    }
  }
  return { embedProvider: null, embedModel: null };
}
