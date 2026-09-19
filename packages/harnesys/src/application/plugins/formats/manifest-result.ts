import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type { ConfigOptionSpec, PluginAuthor, PluginIdentity } from '../../../domain/plugin-ir.ts';
export type PluginRootListing = string[];
export type PathOverrideKey =
  | 'skills'
  | 'commands'
  | 'agents'
  | 'hooks'
  | 'mcpServers'
  | 'lspServers'
  | 'outputStyles'
  | 'workflows';
export type PathOverrideValue = string | string[] | Record<string, unknown>;
export type PathOverrides = Partial<Record<PathOverrideKey, PathOverrideValue>>;
export type PluginDependency =
  | string
  | {
      name: string;
      version?: string;
      marketplace?: string;
    };
export type ManifestResult = {
  identity: PluginIdentity;
  declaredSchema?: string;
  pathOverrides: PathOverrides;
  userConfig: ConfigOptionSpec[];
  dependencies: PluginDependency[];
  extensions: Record<string, Record<string, unknown>>;
  diagnostics: PluginDiagnostic[];
};
const ADDITIONAL_PROPERTIES_MESSAGE = 'must NOT have additional properties';
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function optionalStringField(raw: unknown, key: string): string | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const value = raw[key];
  return typeof value === 'string' ? value : undefined;
}
export function pickManifestIdentity(raw: unknown): PluginIdentity {
  if (!isPlainObject(raw)) {
    return { name: '' };
  }
  const identity: PluginIdentity = {
    name: typeof raw.name === 'string' ? raw.name : '',
  };
  const version = optionalStringField(raw, 'version');
  if (version !== undefined) {
    identity.version = version;
  }
  const description = optionalStringField(raw, 'description');
  if (description !== undefined) {
    identity.description = description;
  }
  const homepage = optionalStringField(raw, 'homepage');
  if (homepage !== undefined) {
    identity.homepage = homepage;
  }
  const repository = optionalStringField(raw, 'repository');
  if (repository !== undefined) {
    identity.repository = repository;
  }
  const license = optionalStringField(raw, 'license');
  if (license !== undefined) {
    identity.license = license;
  }
  if (isPlainObject(raw.author)) {
    identity.author = pickManifestAuthor(raw.author);
  }
  if (Array.isArray(raw.keywords)) {
    identity.keywords = raw.keywords.filter((item): item is string => typeof item === 'string');
  }
  return identity;
}
function pickManifestAuthor(raw: Record<string, unknown>): PluginAuthor {
  const author: PluginAuthor = {};
  const name = optionalStringField(raw, 'name');
  if (name !== undefined) {
    author.name = name;
  }
  const email = optionalStringField(raw, 'email');
  if (email !== undefined) {
    author.email = email;
  }
  const url = optionalStringField(raw, 'url');
  if (url !== undefined) {
    author.url = url;
  }
  return author;
}
export function manifestUnknownFieldWarning(manifestLabel: string, key: string): PluginDiagnostic {
  return {
    level: 'warning',
    code: 'unknown_manifest_field',
    message: `unknown ${manifestLabel} field "${key}" ignored`,
    path: key,
  };
}
export function manifestTypeError(
  manifestLabel: string,
  key: string,
  expected: string,
): PluginDiagnostic {
  return {
    level: 'error',
    code: 'invalid_manifest',
    message: `${manifestLabel} field "${key}" must be ${expected}`,
    path: key,
  };
}
export function manifestFatal(manifestLabel: string, message: string): PluginDiagnostic {
  return {
    level: 'error',
    code: 'invalid_manifest',
    message: `${manifestLabel} ${message}`,
  };
}
export function isAdditionalPropertiesError(error: string): boolean {
  return error.includes(ADDITIONAL_PROPERTIES_MESSAGE);
}
export function manifestSchemaFatal(error: string, manifestLabel: string): PluginDiagnostic {
  const separator = error.indexOf(': ');
  const pointer = separator === -1 ? '/' : error.slice(0, separator);
  const message = separator === -1 ? error : error.slice(separator + 2);
  const diagnostic: PluginDiagnostic = {
    level: 'error',
    code: 'invalid_manifest',
    message: `${manifestLabel}: ${message}`,
  };
  if (pointer.length > 1) {
    diagnostic.path = pointer.slice(1);
  }
  return diagnostic;
}
export function manifestSchemaUnknownField(error: string, manifestLabel: string): PluginDiagnostic {
  const separator = error.indexOf(': ');
  const pointer = separator === -1 ? '/' : error.slice(0, separator);
  const message = separator === -1 ? error : error.slice(separator + 2);
  const diagnostic: PluginDiagnostic = {
    level: 'warning',
    code: 'unknown_manifest_field',
    message: `${manifestLabel}: unknown field ignored (${message})`,
  };
  if (pointer.length > 1) {
    diagnostic.path = pointer.slice(1);
  }
  return diagnostic;
}
