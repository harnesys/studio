import type { ProviderPublic } from '@harnesys/studio-shared';
export function findModelLabel(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): string {
  if (!modelId) {
    return '';
  }
  for (const provider of providers) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      return `${provider.name}/${model.name}`;
    }
  }
  return '';
}
