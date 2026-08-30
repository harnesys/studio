import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export const OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1';

export function listOpenRouterModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  const url = new URL(modelsUrl(input, OPENROUTER_DEFAULT_URL));
  url.searchParams.set('output_modalities', 'all');
  return fetchListedModels({
    url: url.toString(),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOpenRouterList,
  });
}

export function parseOpenRouterList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapOpenRouterModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapOpenRouterModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }

  const pricing = asRecord(record.pricing);
  const topProvider = asRecord(record.top_provider);
  const contextLength = asNumber(record.context_length) ?? asNumber(topProvider?.context_length);
  const maxOutput = asNumber(topProvider?.max_completion_tokens);

  return {
    name,
    kind: 'chat',
    context_length: contextLength,
    pricing: pricing
      ? {
          prompt: String(pricing.prompt ?? '0'),
          completion: String(pricing.completion ?? '0'),
        }
      : undefined,
    top_provider:
      contextLength !== undefined || maxOutput !== undefined
        ? { context_length: contextLength, max_completion_tokens: maxOutput }
        : undefined,
    deprecated: Boolean(asString(record.expiration_date)),
    raw: item,
  };
}
