import { existsSync } from 'node:fs';
import { join } from 'node:path';
export type MarketplaceManifestLocation = {
  root: string;
  manifestPath: string;
};
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
