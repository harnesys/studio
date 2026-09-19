import { CEREBRAS_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import {
  asNumber,
  asRecord,
  asString,
  itemsOf,
  pricePerTokenFromPerMillion,
  pricingOf,
  topProviderOf,
} from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { CEREBRAS_DEFAULT_URL };
export function listCerebrasModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, CEREBRAS_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseCerebrasList,
  });
}
export function parseCerebrasList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapCerebrasModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}
function mapCerebrasModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const limits = asRecord(record.limits) ?? {};
  const pricing = asRecord(record.pricing) ?? {};
  const contextLength = asNumber(limits.max_context_length) ?? asNumber(record.context_length);
  const maxOutput = asNumber(limits.max_completion_tokens) ?? asNumber(record.max_output_length);
  return {
    name,
    kind: /embed/i.test(name) ? 'embed' : 'chat',
    context_length: contextLength,
    pricing: pricingOf({
      prompt: pricePerTokenFromPerMillion(asNumber(pricing.input)),
      completion: pricePerTokenFromPerMillion(asNumber(pricing.output)),
    }),
    top_provider: topProviderOf(contextLength, maxOutput),
    deprecated: record.deprecated === true,
    raw: item,
  };
}
