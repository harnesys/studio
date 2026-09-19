import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginDiagnostic, PluginName } from '@harnesys/studio-shared';
import { type CatalogEntry, semverSatisfies } from 'harnesys/plugins-catalog';
import type {
  PluginInstallFormat,
  PluginInstallRecord,
  PluginRepository,
} from '../../domain/plugin.port.ts';
import type { PluginRegistryRepository } from '../../domain/plugin-registry.port.ts';
import {
  findCatalogEntryWithRenames,
  readPluginManifestVersion,
} from './materialize-catalog-plugin.ts';
export type PluginDependencySpec = {
  name: string;
  version?: string;
  marketplace?: string;
};
export type DependencyResolution = {
  dependencies: PluginDependencySpec[];
  diagnostics: PluginDiagnostic[];
};
export function resolvePluginDependencies(
  record: PluginInstallRecord,
  registries: PluginRegistryRepository | undefined,
  plugins: PluginRepository,
): Promise<DependencyResolution> {
  const dependencies: PluginDependencySpec[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  const visited = new Set<PluginName>([record.name]);
  const queue = manifestDependencies(record.path, record.format).map((dep) => ({
    dep,
    path: [record.name],
  }));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const { dep, path } = queue[cursor];
    if (path.includes(dep.name)) {
      diagnostics.push({
        level: 'warning',
        code: 'dependency_cycle',
        message: `dependency cycle: ${[...path, dep.name].join(' -> ')}`,
      });
      continue;
    }
    if (visited.has(dep.name)) {
      continue;
    }
    visited.add(dep.name);
    const entry = findCatalogEntryFor(registries, dep, record);
    if (!entry) {
      diagnostics.push(unsatisfiedDiagnostic(dep, 'not found in plugin catalogs'));
      continue;
    }
    const installed = plugins.findByName(record.workspaceId, dep.name);
    const installedVersion = installed ? readPluginManifestVersion(installed.path) : undefined;
    if (!rangeSatisfied(dep.version, [installedVersion, entry.version])) {
      diagnostics.push(unsatisfiedDiagnostic(dep, `no version satisfies "${dep.version}"`));
      continue;
    }
    dependencies.push(dep);
    if (installed) {
      const edges = manifestDependencies(installed.path, installed.format).map((next) => ({
        dep: next,
        path: [...path, dep.name],
      }));
      queue.push(...edges);
    }
  }
  return Promise.resolve({ dependencies, diagnostics });
}
export function findDependantNames(
  plugins: PluginRepository,
  workspaceId: string,
  name: PluginName,
): PluginName[] {
  return plugins
    .list(workspaceId)
    .filter((record) => record.name !== name)
    .filter((record) =>
      manifestDependencies(record.path, record.format).some((dep) => dep.name === name),
    )
    .map((record) => record.name);
}
function findCatalogEntryFor(
  registries: PluginRegistryRepository | undefined,
  dep: PluginDependencySpec,
  record: PluginInstallRecord,
): CatalogEntry | undefined {
  if (!registries) {
    return undefined;
  }
  for (const registryId of candidateRegistryIds(registries, dep, record)) {
    const entry = findCatalogEntryWithRenames(registries, registryId, dep.name);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}
function candidateRegistryIds(
  registries: PluginRegistryRepository,
  dep: PluginDependencySpec,
  record: PluginInstallRecord,
): string[] {
  if (dep.marketplace !== undefined) {
    const marketplace = registries.findByName(dep.marketplace);
    return marketplace ? [marketplace.id] : [];
  }
  if (record.registryId !== undefined) {
    return [record.registryId];
  }
  return registries.list().map((registry) => registry.id);
}
function rangeSatisfied(range: string | undefined, candidates: (string | undefined)[]): boolean {
  if (range === undefined) {
    return true;
  }
  return candidates.some((version) => version !== undefined && semverSatisfies(version, range));
}
function unsatisfiedDiagnostic(dep: PluginDependencySpec, reason: string): PluginDiagnostic {
  return {
    level: 'warning',
    code: 'dependency_unsatisfied',
    message: `dependency "${dep.name}" ${reason}`,
  };
}
export function manifestDependencies(
  root: string,
  format: PluginInstallFormat,
): PluginDependencySpec[] {
  const manifest = readRawManifest(root, format);
  const declared: unknown = manifest?.dependencies;
  if (!Array.isArray(declared)) {
    return [];
  }
  return declared.flatMap(parseDependency);
}
function readRawManifest(
  root: string,
  format: PluginInstallFormat,
): Record<string, unknown> | undefined {
  const candidates =
    format === 'agent-plugins'
      ? [join(root, 'plugin.json')]
      : [join(root, '.claude-plugin', 'plugin.json'), join(root, 'plugin.json')];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const value: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      return isRecord(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseDependency(value: unknown): PluginDependencySpec[] {
  if (typeof value === 'string') {
    const name = value.trim();
    return name.length > 0 ? [{ name }] : [];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    return [];
  }
  const dep: PluginDependencySpec = { name: raw.name.trim() };
  if (typeof raw.version === 'string' && raw.version.trim().length > 0) {
    dep.version = raw.version.trim();
  }
  if (typeof raw.marketplace === 'string' && raw.marketplace.trim().length > 0) {
    dep.marketplace = raw.marketplace.trim();
  }
  return [dep];
}
