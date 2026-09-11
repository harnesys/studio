import type {
  CatalogEntry,
  CatalogInstallSource,
  ParsedMarketplace,
} from '../../domain/plugin-catalog.ts';

export type ParseClaudeMarketplaceOptions = {
  /** Absolute or logical marketplace root used only for diagnostics; not written into entries. */
  rootHint?: string;
};

/**
 * Parse Claude/ZCode `marketplace.json` into normalized catalog entries.
 * Relative sources stay relative; Studio resolves them against the marketplace checkout.
 */
export function parseClaudeMarketplace(
  raw: unknown,
  options: ParseClaudeMarketplaceOptions = {},
): ParsedMarketplace {
  if (!isRecord(raw)) {
    throw new Error('marketplace.json must be a JSON object');
  }
  const name = asNonEmptyString(raw.name);
  if (!name) {
    throw new Error('marketplace.json missing name');
  }
  const pluginRoot = resolvePluginRoot(raw);
  const plugins = Array.isArray(raw.plugins) ? raw.plugins : [];
  const entries: Omit<CatalogEntry, 'registryId'>[] = [];
  for (const item of plugins) {
    const entry = mapPluginEntry(item, pluginRoot, options.rootHint);
    if (entry) {
      entries.push(entry);
    }
  }
  const description = asNonEmptyString(raw.description);
  return {
    name,
    ...(description ? { description } : {}),
    entries,
  };
}

function resolvePluginRoot(raw: Record<string, unknown>): string | undefined {
  const top = asNonEmptyString(raw.pluginRoot);
  if (top) {
    return normalizeRelativePath(top);
  }
  const metadata = raw.metadata;
  if (isRecord(metadata)) {
    const nested = asNonEmptyString(metadata.pluginRoot);
    if (nested) {
      return normalizeRelativePath(nested);
    }
  }
  return undefined;
}

function mapPluginEntry(
  item: unknown,
  pluginRoot: string | undefined,
  _rootHint?: string,
): Omit<CatalogEntry, 'registryId'> | undefined {
  if (!isRecord(item)) {
    return undefined;
  }
  const pluginName = asNonEmptyString(item.name);
  if (!pluginName) {
    return undefined;
  }
  const displayName = asNonEmptyString(item.displayName);
  const description = asNonEmptyString(item.description);
  const category = asNonEmptyString(item.category);
  const version = asNonEmptyString(item.version);
  const homepage = asNonEmptyString(item.homepage);
  const tags = asStringArray(item.tags) ?? asStringArray(item.keywords);

  const mapped = mapSource(item.source, pluginRoot);
  const base: Omit<CatalogEntry, 'registryId'> = {
    pluginName,
    installable: mapped.ok,
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
    ...(version ? { version } : {}),
    ...(homepage ? { homepage } : {}),
    ...(tags ? { tags } : {}),
  };
  if (!mapped.ok) {
    return { ...base, unsupportedReason: mapped.reason };
  }
  return { ...base, installSource: mapped.source };
}

type MapSourceResult = { ok: true; source: CatalogInstallSource } | { ok: false; reason: string };

function mapSource(source: unknown, pluginRoot: string | undefined): MapSourceResult {
  if (typeof source === 'string') {
    const path = resolveRelativeSource(source, pluginRoot);
    if (!path) {
      return { ok: false, reason: `invalid relative source: ${source}` };
    }
    return { ok: true, source: { type: 'relative', path } };
  }
  if (!isRecord(source)) {
    return { ok: false, reason: 'missing source' };
  }
  const kind = asNonEmptyString(source.source);
  if (!kind) {
    return { ok: false, reason: 'source object missing source kind' };
  }

  if (kind === 'github') {
    const repo = asNonEmptyString(source.repo);
    if (!repo) {
      return { ok: false, reason: 'github source missing repo' };
    }
    const path = asNonEmptyString(source.path);
    const ref = asNonEmptyString(source.ref);
    const sha = asNonEmptyString(source.sha);
    if (path) {
      return {
        ok: true,
        source: {
          type: 'git-subdir',
          url: `https://github.com/${repo}.git`,
          path: normalizeRelativePath(path),
          ...(ref ? { ref } : {}),
          ...(sha ? { sha } : {}),
        },
      };
    }
    return {
      ok: true,
      source: {
        type: 'github',
        repo,
        ...(ref ? { ref } : {}),
        ...(sha ? { sha } : {}),
      },
    };
  }

  if (kind === 'url' || kind === 'git') {
    const url = asNonEmptyString(source.url);
    if (!url) {
      return { ok: false, reason: `${kind} source missing url` };
    }
    const path = asNonEmptyString(source.path);
    const ref = asNonEmptyString(source.ref);
    const sha = asNonEmptyString(source.sha);
    if (path) {
      return {
        ok: true,
        source: {
          type: 'git-subdir',
          url,
          path: normalizeRelativePath(path),
          ...(ref ? { ref } : {}),
          ...(sha ? { sha } : {}),
        },
      };
    }
    return {
      ok: true,
      source: {
        type: 'url',
        url,
        ...(ref ? { ref } : {}),
        ...(sha ? { sha } : {}),
      },
    };
  }

  if (kind === 'git-subdir') {
    const url = asNonEmptyString(source.url);
    const path = asNonEmptyString(source.path);
    if (!url || !path) {
      return { ok: false, reason: 'git-subdir source needs url and path' };
    }
    const ref = asNonEmptyString(source.ref);
    const sha = asNonEmptyString(source.sha);
    return {
      ok: true,
      source: {
        type: 'git-subdir',
        url,
        path: normalizeRelativePath(path),
        ...(ref ? { ref } : {}),
        ...(sha ? { sha } : {}),
      },
    };
  }

  return { ok: false, reason: `unsupported source type: ${kind}` };
}

function resolveRelativeSource(source: string, pluginRoot: string | undefined): string | undefined {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return normalizeRelativePath(trimmed);
  }
  if (!trimmed.includes('/') && pluginRoot) {
    return normalizeRelativePath(`${pluginRoot}/${trimmed}`);
  }
  if (!trimmed.includes('/')) {
    return normalizeRelativePath(trimmed);
  }
  return normalizeRelativePath(trimmed.startsWith('.') ? trimmed : `./${trimmed}`);
}

function normalizeRelativePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/');
  const withoutDot = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  return withoutDot.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );
  return items.length > 0 ? items.map((item) => item.trim()) : undefined;
}
