import { OLLAMA_CLOUD_DEFAULT_URL, OLLAMA_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asRecord, asString, asStringList, itemsOf, pricingOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { OLLAMA_CLOUD_DEFAULT_URL, OLLAMA_DEFAULT_URL };
export function listOllamaModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, OLLAMA_DEFAULT_URL, '/api/tags'),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOllamaTags,
  });
}
export function listOllamaCloudModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, OLLAMA_CLOUD_DEFAULT_URL, '/api/tags'),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOllamaTags,
  });
}
export function parseOllamaTags(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json, 'models')) {
    const record = asRecord(item);
    const name = asString(record?.name) ?? asString(record?.model);
    if (!record || !name) {
      continue;
    }
    const capabilities = asStringList(record.capabilities);
    found.push({
      name,
      kind: capabilities.includes('embedding') ? 'embed' : 'chat',
      pricing: pricingOf({ prompt: '0', completion: '0' }),
      raw: item,
    });
  }
  return found;
}
