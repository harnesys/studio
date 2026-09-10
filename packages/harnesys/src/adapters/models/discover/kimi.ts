import { KIMI_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { KIMI_DEFAULT_URL };

export function listKimiModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, KIMI_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseKimiList,
  });
}

export function parseKimiList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapKimiModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapKimiModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = kimiKind(name);
  const hasReasoning = record.supports_reasoning === true;
  const contextLength = asNumber(record.context_length);

  return {
    name,
    kind,
    context_length: contextLength,
    top_provider: topProviderOf(contextLength),
    effort: hasReasoning ? ['low', 'high', 'max'] : undefined,
    raw: item,
  };
}

function kimiKind(name: string): 'chat' | 'embed' {
  if (/embed/i.test(name)) {
    return 'embed';
  }
  return 'chat';
}
