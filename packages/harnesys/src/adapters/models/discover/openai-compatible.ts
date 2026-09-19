import { OPENAI_COMPATIBLE_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { DiscoverError } from '../binding.ts';
import { fetchListedModels } from './fetch-list.ts';
import { parseOpenAIList } from './openai.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export { OPENAI_COMPATIBLE_DEFAULT_URL };
export async function listOpenAICompatibleModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  if (!input.apiUrl?.trim()) {
    throw new DiscoverError('openai-compatible requires apiUrl');
  }
  return await fetchListedModels({
    url: modelsUrl(input, input.apiUrl),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseOpenAIList,
  });
}
