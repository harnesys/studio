import { OPENAI_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asRecord, asString, itemsOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { OPENAI_DEFAULT_URL };

export function listOpenAIModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, OPENAI_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOpenAIList,
  });
}

export function parseOpenAIList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const record = asRecord(item);
    const name = asString(record?.id);
    if (name) {
      found.push({ name, effort: openaiModelEfforts(name), raw: item });
    }
  }
  return found;
}

const OPENAI_REASONING = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function openaiModelEfforts(name: string): string[] | undefined {
  if (/^o[1-4]|^gpt-5|oss/i.test(name)) {
    return OPENAI_REASONING;
  }
  return undefined;
}
