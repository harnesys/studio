import { MINIMAX_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { MINIMAX_DEFAULT_URL };

export function listMinimaxModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, MINIMAX_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseMinimaxList,
  });
}

export function parseMinimaxList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapMinimaxModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapMinimaxModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = minimaxKind(name);
  const hasReasoning = kind === 'chat' && /m2|m3/i.test(name);
  const contextLength = asNumber(record.context_length) ?? asNumber(record.context_window);
  const maxOutput = asNumber(record.max_tokens) ?? asNumber(record.max_completion_tokens);

  return {
    name,
    kind,
    context_length: contextLength,
    top_provider: topProviderOf(contextLength, maxOutput),
    effort: hasReasoning ? ['none', 'low', 'medium', 'high'] : undefined,
    raw: item,
  };
}

function minimaxKind(name: string): 'chat' | 'embed' | 'audio' | 'image' {
  if (/embed|embo/i.test(name)) {
    return 'embed';
  }
  if (/speech|tts|voice/i.test(name)) {
    return 'audio';
  }
  if (/image|video/i.test(name)) {
    return 'image';
  }
  return 'chat';
}
