import type { DiscoveredModel, FetchLike } from '../../../ports/models.ts';
import { DiscoverError } from '../binding.ts';

const UNLISTABLE = new Set([404, 405, 501]);

export type FetchListInput = {
  url: string;
  headers: Record<string, string | undefined>;
  fetch?: FetchLike;
  parse: (json: unknown) => DiscoveredModel[];
};

export async function fetchListedModels(input: FetchListInput): Promise<DiscoveredModel[]> {
  const fetchFn = input.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers)) {
    if (value !== undefined) {
      headers[key] = value;
    }
  }

  let response: Response;
  try {
    response = await fetchFn(input.url, { headers });
  } catch (error) {
    throw new DiscoverError(error instanceof Error ? error.message : 'discover failed');
  }

  if (!response.ok) {
    if (UNLISTABLE.has(response.status)) {
      return [];
    }
    throw new DiscoverError(`discover failed: ${response.status}`);
  }

  try {
    const json: unknown = await response.json();
    return input.parse(json);
  } catch (error) {
    if (error instanceof DiscoverError) {
      throw error;
    }
    throw new DiscoverError(error instanceof Error ? error.message : 'discover failed');
  }
}
