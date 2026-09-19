import type { DiscoveredModel, DiscoverInput } from '../../ports/models.ts';
import { DiscoverError } from './binding.ts';
import { discoverAdapter } from './discover/registry.ts';

export { DiscoverError };
export function discoverModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return discoverAdapter(input.driver).list(input);
}
