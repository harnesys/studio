import type { ProviderPublic } from '@harnesys/studio-shared';

export type ModelOption = {
  value: string;
  name: string;
  provider: string;
};

export type ModelGroup = {
  provider: string;
  models: ModelOption[];
};

export function modelGroups(providers: ProviderPublic[]): ModelGroup[] {
  return providers
    .map((provider) => ({
      provider: provider.name,
      models: provider.models.map((model) => ({
        value: model.id,
        name: model.name,
        provider: provider.name,
      })),
    }))
    .filter((group) => group.models.length > 0);
}

export function modelOptions(groups: ModelGroup[]): ModelOption[] {
  return groups.flatMap((group) => group.models);
}
