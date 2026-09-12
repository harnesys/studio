import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type { ConfigOptionSpec, PluginAuthor, PluginIdentity } from '../../../domain/plugin-ir.ts';

/** Листинг корня плагина: имена записей верхнего уровня. */
export type PluginRootListing = string[];

/** Ключ path-override: компонент, чей путь или inline-определение задаёт манифест. */
export type PathOverrideKey =
  | 'skills'
  | 'commands'
  | 'agents'
  | 'hooks'
  | 'mcpServers'
  | 'lspServers'
  | 'outputStyles'
  | 'workflows';

/** Значение path-override: путь, список путей или inline-определение. */
export type PathOverrideValue = string | string[] | Record<string, unknown>;

/** Path-override'ы компонентов из манифеста. */
export type PathOverrides = Partial<Record<PathOverrideKey, PathOverrideValue>>;

/** Зависимость плагина: голое имя или запись с версией и маркетплейсом. */
export type PluginDependency = string | { name: string; version?: string; marketplace?: string };

/** Результат разбора манифеста адаптером формата; фатальный отказ = error-diagnostic. */
export type ManifestResult = {
  identity: PluginIdentity;
  declaredSchema?: string;
  pathOverrides: PathOverrides;
  userConfig: ConfigOptionSpec[];
  dependencies: PluginDependency[];
  extensions: Record<string, Record<string, unknown>>;
  diagnostics: PluginDiagnostic[];
};

/** Ajv формулирует нарушение additionalProperties этой фразой при любом уровне вложенности. */
const ADDITIONAL_PROPERTIES_MESSAGE = 'must NOT have additional properties';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Строковое поле манифеста или undefined, если поле отсутствует или не строка. */
export function optionalStringField(raw: unknown, key: string): string | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const value = raw[key];
  return typeof value === 'string' ? value : undefined;
}

/** Метаданные плагина: общие для AP и Claude поля манифеста; неизвестное имя остаётся пустым. */
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

/** Предупреждение о неизвестном поле манифеста: поле игнорируется (AP §5.2 report-and-ignore). */
export function manifestUnknownFieldWarning(manifestLabel: string, key: string): PluginDiagnostic {
  return {
    level: 'warning',
    code: 'unknown_manifest_field',
    message: `unknown ${manifestLabel} field "${key}" ignored`,
    path: key,
  };
}

/** Фатальная ошибка типа известного поля манифеста. */
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

/** Фатальный отказ манифеста без привязки к полю. */
export function manifestFatal(manifestLabel: string, message: string): PluginDiagnostic {
  return {
    level: 'error',
    code: 'invalid_manifest',
    message: `${manifestLabel} ${message}`,
  };
}

/** Ошибка `additionalProperties` от Ajv: понижается до warning независимо от содержимого схемы. */
export function isAdditionalPropertiesError(error: string): boolean {
  return error.includes(ADDITIONAL_PROPERTIES_MESSAGE);
}

/**
 * Ошибка schema-валидатора в формате `instancePath: message`, классифицированная
 * как фатальная `invalid_manifest`; указатель `/author/name` нормализуется в `author.name`.
 */
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

/** Ошибка `additionalProperties`, пониженная до warning `unknown_manifest_field`
 * независимо от содержимого схемы; путь — указатель без ведущего слэша. */
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
