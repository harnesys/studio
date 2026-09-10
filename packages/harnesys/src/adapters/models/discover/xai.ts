import { XAI_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { XAI_DEFAULT_URL };

export function listXaiModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, XAI_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseXaiList,
  });
}

export function parseXaiList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapXaiModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapXaiModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }

  const contextLength = asNumber(record.context_length);
  const hasReasoning = /reasoning|grok-3|grok-4/i.test(name);

  return {
    name,
    kind: 'chat',
    context_length: contextLength,
    top_provider: topProviderOf(contextLength),
    effort: hasReasoning ? ['low', 'medium', 'high', 'xhigh'] : undefined,
    raw: item,
  };
}
