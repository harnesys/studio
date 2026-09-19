import { GROQ_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { GROQ_DEFAULT_URL };
export function listGroqModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, GROQ_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseGroqList,
  });
}
export function parseGroqList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const record = asRecord(item);
    const name = asString(record?.id);
    if (!record || !name) {
      continue;
    }
    const contextLength = asNumber(record.context_window);
    const maxOutput = asNumber(record.max_completion_tokens);
    found.push({
      name,
      kind: groqKind(name),
      context_length: contextLength,
      top_provider:
        contextLength !== undefined || maxOutput !== undefined
          ? { context_length: contextLength, max_completion_tokens: maxOutput }
          : undefined,
      raw: item,
    });
  }
  return found;
}
function groqKind(name: string): 'chat' | 'embed' | 'audio' | undefined {
  if (/whisper|tts|audio/i.test(name)) {
    return 'audio';
  }
  if (/embed/i.test(name)) {
    return 'embed';
  }
  return 'chat';
}
