export {
  findMarketplaceManifest,
  type MarketplaceManifestLocation,
} from './src/application/plugins/find-marketplace-manifest.ts';
export {
  type ParseClaudeMarketplaceOptions,
  parseClaudeMarketplace,
} from './src/application/plugins/parse-claude-marketplace.ts';
export type {
  CatalogEntry,
  CatalogInstallSource,
  ParsedMarketplace,
  RegistryKind,
} from './src/domain/plugin-catalog.ts';
