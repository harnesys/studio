import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export const MOONSHOTAI_DEFAULT_URL = 'https://api.moonshot.ai/v1';

export function listMoonshotAIModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, MOONSHOTAI_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseMoonshotAIList,
  });
}

export function parseMoonshotAIList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapMoonshotAIModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapMoonshotAIModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = moonshotaiKind(name);
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

function moonshotaiKind(name: string): 'chat' | 'embed' {
  if (/embed/i.test(name)) {
    return 'embed';
  }
  return 'chat';
}
