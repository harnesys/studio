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

export const TOGETHER_DEFAULT_URL = 'https://api.together.xyz/v1';

export function listTogetherModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, TOGETHER_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseTogetherList,
  });
}

export function parseTogetherList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapTogetherModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapTogetherModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const pricing = asRecord(record.pricing);
  const kind = togetherKind(asString(record.type), name);
  const contextLength = asNumber(record.context_length);
  return {
    name,
    kind,
    context_length: contextLength,
    pricing: pricingOf({
      prompt: pricePerTokenFromPerMillion(asNumber(pricing?.input)),
      completion: pricePerTokenFromPerMillion(
        asNumber(pricing?.output) ?? (kind === 'embed' ? 0 : undefined),
      ),
    }),
    top_provider: topProviderOf(contextLength),
    raw: item,
  };
}

function togetherKind(
  type: string | undefined,
  name: string,
): 'chat' | 'embed' | 'image' | 'audio' | undefined {
  if (type === 'embedding' || /embed/i.test(name)) {
    return 'embed';
  }
  if (type === 'image' || type === 'video') {
    return 'image';
  }
  if (type === 'audio' || type === 'transcription') {
    return 'audio';
  }
  if (type === 'chat' || type === 'language' || !type) {
    return 'chat';
  }
  return undefined;
}
