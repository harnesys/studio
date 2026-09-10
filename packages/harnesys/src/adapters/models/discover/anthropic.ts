import { ANTHROPIC_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asRecord, asString, itemsOf } from './parse.ts';
import { modelsUrl } from './request.ts';

export { ANTHROPIC_DEFAULT_URL };

export function listAnthropicModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, ANTHROPIC_DEFAULT_URL),
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': input.apiKey,
      ...input.headers,
    },
    fetch: input.fetch,
    parse: parseAnthropicList,
  });
}

export function parseAnthropicList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const record = asRecord(item);
    const name = asString(record?.id);
    if (name) {
      found.push({ name, effort: anthropicModelEfforts(name), raw: item });
    }
  }
  return found;
}

const NONE_LOW_MEDIUM_HIGH = ['none', 'low', 'medium', 'high'];

function anthropicModelEfforts(name: string): string[] | undefined {
  if (/haiku/i.test(name)) {
    return undefined;
  }
  return NONE_LOW_MEDIUM_HIGH;
}
