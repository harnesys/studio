import type { PluginAuthor, PluginExtensions, PluginManifest } from '../../domain/plugin.ts';
import { assertPluginName } from './plugin-name.ts';

export const AGENT_PLUGINS_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
]);

const AUTHOR_KEYS = new Set(['name', 'email', 'url']);

export type ParsePluginManifestResult = {
  manifest: PluginManifest;
  ignoredFields: string[];
};

export class PluginManifestError extends Error {
  readonly path?: string;

  constructor(message: string, path?: string) {
    super(message);
    this.name = 'PluginManifestError';
    this.path = path;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(raw: Record<string, unknown>, key: string): string | undefined {
  if (!(key in raw)) {
    return undefined;
  }
  const value = raw[key];
  if (typeof value !== 'string') {
    throw new PluginManifestError(`plugin.json field "${key}" must be a string`, key);
  }
  return value;
}

function parseAuthor(value: unknown): PluginAuthor {
  if (!isPlainObject(value)) {
    throw new PluginManifestError('plugin.json field "author" must be an object', 'author');
  }
  for (const key of Object.keys(value)) {
    if (!AUTHOR_KEYS.has(key)) {
      throw new PluginManifestError(
        `plugin.json field "author" has unknown property "${key}"`,
        `author.${key}`,
      );
    }
    if (typeof value[key] !== 'string') {
      throw new PluginManifestError(
        `plugin.json field "author.${key}" must be a string`,
        `author.${key}`,
      );
    }
  }
  const author: PluginAuthor = {};
  if (typeof value.name === 'string') {
    author.name = value.name;
  }
  if (typeof value.email === 'string') {
    author.email = value.email;
  }
  if (typeof value.url === 'string') {
    author.url = value.url;
  }
  return author;
}

function parseKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new PluginManifestError('plugin.json field "keywords" must be an array', 'keywords');
  }
  const keywords: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== 'string') {
      throw new PluginManifestError(
        `plugin.json field "keywords[${i}]" must be a string`,
        `keywords[${i}]`,
      );
    }
    keywords.push(item);
  }
  return keywords;
}

function parseExtensions(value: unknown): PluginExtensions | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const extensions: PluginExtensions = {};
  for (const [ns, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) {
      throw new PluginManifestError(
        `plugin.json field "extensions.${ns}" must be an object`,
        `extensions.${ns}`,
      );
    }
    extensions[ns] = entry;
  }
  return extensions;
}

export function parsePluginManifestJson(raw: unknown): ParsePluginManifestResult {
  if (!isPlainObject(raw)) {
    throw new PluginManifestError('plugin.json must be a JSON object');
  }

  const ignoredFields: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      ignoredFields.push(key);
    }
  }

  const schema = raw.$schema;
  if (schema !== AGENT_PLUGINS_SCHEMA_ID) {
    throw new PluginManifestError(
      `plugin.json field "$schema" must be "${AGENT_PLUGINS_SCHEMA_ID}"`,
      '$schema',
    );
  }

  const name = raw.name;
  if (typeof name !== 'string') {
    throw new PluginManifestError('plugin.json field "name" must be a string', 'name');
  }
  try {
    assertPluginName(name);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new PluginManifestError(message, 'name');
  }

  const version = optionalString(raw, 'version');
  const description = optionalString(raw, 'description');
  const homepage = optionalString(raw, 'homepage');
  const repository = optionalString(raw, 'repository');
  const license = optionalString(raw, 'license');

  let author: PluginAuthor | undefined;
  if ('author' in raw) {
    author = parseAuthor(raw.author);
  }

  let keywords: string[] | undefined;
  if ('keywords' in raw) {
    keywords = parseKeywords(raw.keywords);
  }

  let extensions: PluginExtensions = {};
  if ('extensions' in raw) {
    const parsed = parseExtensions(raw.extensions);
    if (parsed === null) {
      ignoredFields.push('extensions');
    } else {
      extensions = parsed;
    }
  }

  const manifest: PluginManifest = {
    schemaVersion: '1.0.0',
    name,
    extensions,
  };
  if (version !== undefined) {
    manifest.version = version;
  }
  if (description !== undefined) {
    manifest.description = description;
  }
  if (author !== undefined) {
    manifest.author = author;
  }
  if (homepage !== undefined) {
    manifest.homepage = homepage;
  }
  if (repository !== undefined) {
    manifest.repository = repository;
  }
  if (license !== undefined) {
    manifest.license = license;
  }
  if (keywords !== undefined) {
    manifest.keywords = keywords;
  }

  return { manifest, ignoredFields };
}
