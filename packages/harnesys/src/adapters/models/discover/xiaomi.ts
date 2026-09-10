import { XIAOMI_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { XIAOMI_DEFAULT_URL };

export function listXiaomiModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, XIAOMI_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseXiaomiList,
  });
}

export function parseXiaomiList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapXiaomiModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapXiaomiModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = xiaomiKind(name);
  const contextLength = asNumber(record.context_length) ?? asNumber(record.context_window);
  const maxOutput = asNumber(record.max_output_tokens) ?? asNumber(record.max_completion_tokens);

  return {
    name,
    kind,
    context_length: contextLength,
    top_provider: topProviderOf(contextLength, maxOutput),
    effort: kind === 'chat' ? ['none', 'low', 'medium', 'high'] : undefined,
    raw: item,
  };
}

function xiaomiKind(name: string): 'chat' | 'embed' | 'audio' {
  if (/embed/i.test(name)) {
    return 'embed';
  }
  if (/tts|asr|speech/i.test(name)) {
    return 'audio';
  }
  return 'chat';
}
