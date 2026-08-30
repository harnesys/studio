import type { DiscoveredModel, DiscoverInput } from '../../ports/models.ts';
import { DRIVERS } from '../../ports/models.ts';
import { DiscoverError } from './binding.ts';

export { DiscoverError };

// biome-ignore lint/suspicious/useAwait: stub keeps async for API compatibility
export async function discoverModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  if (!(DRIVERS as readonly string[]).includes(input.driver)) {
    throw new DiscoverError(`unknown driver ${input.driver}`);
  }
  return [];
}
