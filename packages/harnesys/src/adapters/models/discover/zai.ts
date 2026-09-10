import { ZAI_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { ZAI_DEFAULT_URL };

export function listZaiModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, ZAI_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseZaiList,
  });
}

export function parseZaiList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapZaiModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapZaiModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = zaiKind(name);
  const hasReasoning = kind === 'chat' && /glm-5|glm-4\.[5-9]|thinking/i.test(name);
  const contextLength = asNumber(record.context_length) ?? asNumber(record.max_tokens);
  const maxOutput = asNumber(record.max_output_tokens) ?? asNumber(record.max_completion_tokens);

  return {
    name,
    kind,
    context_length: contextLength,
    top_provider: topProviderOf(contextLength, maxOutput),
    effort: hasReasoning ? ['none', 'low', 'medium', 'high'] : undefined,
    raw: item,
  };
}

function zaiKind(name: string): 'chat' | 'embed' | 'image' {
  if (/embed/i.test(name)) {
    return 'embed';
  }
  if (/cogview|image/i.test(name) && !/vision/i.test(name)) {
    return 'image';
  }
  return 'chat';
}
