import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type MarketplaceManifestLocation = {
  /** Directory that relative plugin paths resolve against. */
  root: string;
  /** Absolute path to marketplace.json. */
  manifestPath: string;
};

/**
 * Locate Claude/ZCode marketplace.json under a checkout or downloaded tree.
 * Prefers `.claude-plugin/marketplace.json`, then root `marketplace.json`.
 */
export function findMarketplaceManifest(
  checkoutRoot: string,
): MarketplaceManifestLocation | undefined {
  const claude = join(checkoutRoot, '.claude-plugin', 'marketplace.json');
  if (existsSync(claude)) {
    return { root: checkoutRoot, manifestPath: claude };
  }
  const root = join(checkoutRoot, 'marketplace.json');
  if (existsSync(root)) {
    return { root: checkoutRoot, manifestPath: root };
  }
  return undefined;
}
