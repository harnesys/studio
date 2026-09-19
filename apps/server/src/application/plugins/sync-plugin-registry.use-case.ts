import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type CatalogEntry,
  findMarketplaceManifest,
  parseClaudeMarketplace,
  type RegistryKind,
} from 'harnesys/plugins-catalog';
import {
  clonePlugin,
  isMarketplaceJsonUrl,
  removePluginPath,
  resolveGitSource,
  slugFromSource,
  updatePluginCheckout,
} from '../../adapters/plugin-git.adapter.ts';
import { marketplaceInstallPath } from '../../adapters/store/studio-layout.ts';
import { DEFAULT_PLUGIN_REGISTRY_SOURCE } from '../../config/constants.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import type {
  PluginRegistryRecord,
  PluginRegistryRepository,
} from '../../domain/plugin-registry.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { decorateCatalogEntries } from './catalog-entry-status.ts';
export type SyncPluginRegistryInput = {
  execute(registryId: string): Promise<PluginRegistryRecord>;
};
export class SyncPluginRegistryUseCase implements SyncPluginRegistryInput {
  constructor(
    private readonly registries: PluginRegistryRepository,
    private readonly home: string,
  ) {}
  async execute(registryId: string): Promise<PluginRegistryRecord> {
    const current = this.registries.findById(registryId);
    if (!current) {
      throw new NotFoundError(`registry ${registryId} not found`);
    }
    try {
      const synced = await syncCheckout(current, this.home);
      const location = findMarketplaceManifest(synced.path);
      if (!location) {
        throw new ValidationError(
          'marketplace.json not found (.claude-plugin/marketplace.json or marketplace.json)',
        );
      }
      const rawText = await Bun.file(location.manifestPath).text();
      const parsed = parseClaudeMarketplace(JSON.parse(rawText) as unknown, {
        rootHint: location.root,
      });
      const entries = parsed.entries.map((entry) => ({
        ...entry,
        registryId: current.id,
      }));
      this.registries.replaceCatalog(current.id, entries);
      const now = new Date().toISOString();
      return this.registries.upsert({
        ...current,
        name: parsed.name || current.name,
        path: synced.path,
        ...(synced.revision ? { revision: synced.revision } : {}),
        lastSyncAt: now,
        lastError: undefined,
        updatedAt: now,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      this.registries.upsert({
        ...current,
        lastError: message,
        updatedAt: now,
      });
      throw err;
    }
  }
}
export type AddPluginRegistryRequest = {
  source: string;
  kind?: RegistryKind;
};
export type AddPluginRegistryInput = {
  execute(request: AddPluginRegistryRequest): Promise<PluginRegistryRecord>;
};
export class AddPluginRegistryUseCase implements AddPluginRegistryInput {
  constructor(
    private readonly registries: PluginRegistryRepository,
    private readonly home: string,
    private readonly sync: SyncPluginRegistryInput,
  ) {}
  async execute(request: AddPluginRegistryRequest): Promise<PluginRegistryRecord> {
    const source = request.source.trim();
    if (source.length === 0) {
      throw new ValidationError('source is required');
    }
    const kind: RegistryKind = request.kind ?? 'claude-marketplace';
    const id = slugFromSource(source);
    if (this.registries.findById(id) || this.registries.findByName(id)) {
      throw new ValidationError(`registry already exists: ${id}`);
    }
    const path = marketplaceInstallPath(this.home, id);
    const now = new Date().toISOString();
    const record = this.registries.upsert({
      id,
      name: id,
      kind,
      source,
      path,
      createdAt: now,
      updatedAt: now,
    });
    try {
      return await this.sync.execute(record.id);
    } catch (err) {
      this.registries.delete(record.id);
      await removePluginPath(path).catch(() => undefined);
      throw err;
    }
  }
}
export type EnsureDefaultPluginRegistriesInput = {
  execute(): Promise<void>;
};
export class EnsureDefaultPluginRegistriesUseCase implements EnsureDefaultPluginRegistriesInput {
  constructor(
    private readonly registries: PluginRegistryRepository,
    private readonly add: AddPluginRegistryInput,
    private readonly sync: SyncPluginRegistryInput,
  ) {}
  async execute(): Promise<void> {
    const existing = this.registries.list();
    if (existing.length === 0) {
      await this.add.execute({ source: DEFAULT_PLUGIN_REGISTRY_SOURCE });
      return;
    }
    for (const registry of existing) {
      if (!registry.lastSyncAt) {
        await this.sync.execute(registry.id).catch(() => undefined);
      }
    }
  }
}
export type RemovePluginRegistryInput = {
  execute(registryId: string): Promise<void>;
};
export class RemovePluginRegistryUseCase implements RemovePluginRegistryInput {
  constructor(private readonly registries: PluginRegistryRepository) {}
  async execute(registryId: string): Promise<void> {
    const current = this.registries.findById(registryId);
    if (!current) {
      throw new NotFoundError(`registry ${registryId} not found`);
    }
    this.registries.delete(registryId);
    await removePluginPath(current.path).catch(() => undefined);
  }
}
export type ListPluginRegistriesInput = {
  execute(): Promise<PluginRegistryRecord[]>;
};
export class ListPluginRegistriesUseCase implements ListPluginRegistriesInput {
  constructor(
    private readonly registries: PluginRegistryRepository,
    private readonly ensureDefault: EnsureDefaultPluginRegistriesInput,
  ) {}
  async execute(): Promise<PluginRegistryRecord[]> {
    await this.ensureDefault.execute();
    return this.registries.list();
  }
}
export type ListPluginCatalogInput = {
  execute(filter?: { registryId?: string; q?: string }): Promise<CatalogEntry[]>;
};
export class ListPluginCatalogUseCase implements ListPluginCatalogInput {
  constructor(
    private readonly registries: PluginRegistryRepository,
    private readonly ensureDefault: EnsureDefaultPluginRegistriesInput,
    private readonly plugins: PluginRepository,
  ) {}
  async execute(filter: { registryId?: string; q?: string } = {}) {
    await this.ensureDefault.execute();
    return decorateCatalogEntries(await this.registries.listCatalog(filter), this.plugins);
  }
}
async function syncCheckout(
  registry: PluginRegistryRecord,
  home: string,
): Promise<{
  path: string;
  revision?: string;
}> {
  const dest = registry.path || marketplaceInstallPath(home, registry.id);
  if (isMarketplaceJsonUrl(registry.source)) {
    await mkdir(dirname(join(dest, 'marketplace.json')), { recursive: true });
    const response = await fetch(registry.source);
    if (!response.ok) {
      throw new Error(`failed to download marketplace.json (${response.status})`);
    }
    const text = await response.text();
    await writeFile(join(dest, 'marketplace.json'), text, 'utf8');
    return { path: dest };
  }
  const resolved = resolveGitSource(registry.source);
  if (existsSync(join(dest, '.git'))) {
    const updated = await updatePluginCheckout({ path: dest });
    return { path: dest, revision: updated.revision };
  }
  if (existsSync(dest)) {
    await removePluginPath(dest);
  }
  const cloned = await clonePlugin({ source: resolved, dest });
  return { path: dest, revision: cloned.revision };
}
