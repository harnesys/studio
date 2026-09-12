export {
  findMarketplaceManifest,
  type MarketplaceManifestLocation,
} from './src/application/plugins/find-marketplace-manifest.ts';
export {
  type ParseClaudeMarketplaceOptions,
  parseClaudeMarketplace,
} from './src/application/plugins/parse-claude-marketplace.ts';
export { semverSatisfies } from './src/application/plugins/semver-lite.ts';
export type {
  CatalogEntry,
  CatalogInstallSource,
  CatalogRenames,
  ParsedMarketplace,
  RegistryKind,
} from './src/domain/plugin-catalog.ts';
