import { QWEN_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { QWEN_DEFAULT_URL };

export function listQwenModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, QWEN_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseQwenList,
  });
}

export function parseQwenList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapQwenModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapQwenModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = qwenKind(name);
  const hasReasoning = kind === 'chat' && /think|reason|qwq|qwen3/i.test(name);
  const contextLength = asNumber(record.context_length) ?? asNumber(record.context_window);
  const maxOutput = asNumber(record.max_output_tokens) ?? asNumber(record.max_completion_tokens);

  return {
    name,
    kind,
    context_length: contextLength,
    top_provider: topProviderOf(contextLength, maxOutput),
    effort: hasReasoning ? ['none', 'low', 'medium', 'xhigh'] : undefined,
    raw: item,
  };
}

function qwenKind(name: string): 'chat' | 'embed' | 'audio' | 'image' {
  if (/embed/i.test(name)) {
    return 'embed';
  }
  if (/tts|asr|audio|qwen3-live/i.test(name) && !/vl|omni/i.test(name)) {
    return 'audio';
  }
  if (/(^|-)(image|wanx)/i.test(name)) {
    return 'image';
  }
  return 'chat';
}
