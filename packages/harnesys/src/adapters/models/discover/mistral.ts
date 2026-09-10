import { MISTRAL_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { MISTRAL_DEFAULT_URL };

export function listMistralModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, MISTRAL_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseMistralList,
  });
}

export function parseMistralList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapMistralModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapMistralModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const capabilities = asRecord(record.capabilities) ?? {};
  const kind = mistralKind(name, capabilities);
  const contextLength = asNumber(record.max_context_length);

  return {
    name,
    kind,
    context_length: contextLength,
    top_provider: topProviderOf(contextLength),
    deprecated: record.deprecation != null && record.deprecation !== false,
    raw: item,
  };
}

function mistralKind(
  name: string,
  capabilities: Record<string, unknown>,
): 'chat' | 'embed' | undefined {
  if (/embed/i.test(name)) {
    return 'embed';
  }
  if (capabilities.completion_chat === false && /moderat/i.test(name)) {
    return undefined;
  }
  return 'chat';
}
