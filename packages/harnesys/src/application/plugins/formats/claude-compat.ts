import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type { ConfigOptionSpec, PluginIdentity } from '../../../domain/plugin-ir.ts';
import { validateClaudeManifest } from '../schema-loader.ts';
import {
  isAdditionalPropertiesError,
  isPlainObject,
  type ManifestResult,
  manifestFatal,
  manifestSchemaFatal,
  manifestSchemaUnknownField,
  manifestTypeError,
  manifestUnknownFieldWarning,
  optionalStringField,
  type PathOverrideKey,
  type PathOverrides,
  type PathOverrideValue,
  type PluginDependency,
  type PluginRootListing,
  pickManifestIdentity,
} from './manifest-result.ts';

const MANIFEST_LABEL = '.claude-plugin/plugin.json';

/** Поля открытого Claude-манифеста: свойства вендоренной схемы плюс поля, схеме неизвестные. */
const CLAUDE_MANIFEST_KEYS: ReadonlySet<string> = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'dependencies',
  'hooks',
  'commands',
  'agents',
  'skills',
  'outputStyles',
  'workflows',
  'themes',
  'channels',
  'mcpServers',
  'lspServers',
  'monitors',
  'settings',
  'userConfig',
  'defaultEnabled',
  'experimental',
]);

/** Ключи path-override (спека §1.3): skills дополняет дефолт, остальные заменяют или inline. */
const PATH_OVERRIDE_KEYS: readonly PathOverrideKey[] = [
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcpServers',
  'lspServers',
  'outputStyles',
  'workflows',
];

/** Полный разбор Claude-манифеста; надстройка над ним — `parseManifest`. */
export type ClaudeManifestFull = {
  identity: PluginIdentity;
  pathOverrides: PathOverrides;
  userConfig: ConfigOptionSpec[];
  dependencies: PluginDependency[];
  experimental: Record<string, unknown>;
  defaultEnabled?: boolean;
  diagnostics: PluginDiagnostic[];
};

/** Распознаёт Claude-плагин по корневой директории `.claude-plugin`; иначе null. */
export function detect(listing: PluginRootListing): 'claude-compat' | null {
  return listing.includes('.claude-plugin') ? 'claude-compat' : null;
}

/**
 * Разбирает открытый Claude-манифест. Неизвестные поля — warning `unknown_manifest_field`
 * (как `claude plugin validate`); неверный тип известного поля — фатальный `invalid_manifest`;
 * ошибки `additionalProperties` от вендоренной схемы понижаются до warning независимо
 * от содержимого схемы. Фатальный отказ = error-diagnostic, функция не бросает.
 */
export function parseClaudeManifestFull(raw: unknown): ClaudeManifestFull {
  if (!isPlainObject(raw)) {
    return {
      identity: pickManifestIdentity(raw),
      pathOverrides: {},
      userConfig: [],
      dependencies: [],
      experimental: {},
      diagnostics: [manifestFatal(MANIFEST_LABEL, 'must be a JSON object')],
    };
  }

  const diagnostics: PluginDiagnostic[] = [];

  for (const key of Object.keys(raw)) {
    if (!CLAUDE_MANIFEST_KEYS.has(key)) {
      diagnostics.push(manifestUnknownFieldWarning(MANIFEST_LABEL, key));
    }
  }

  for (const error of validateClaudeManifest(raw)) {
    diagnostics.push(
      isAdditionalPropertiesError(error)
        ? manifestSchemaUnknownField(error, MANIFEST_LABEL)
        : manifestSchemaFatal(error, MANIFEST_LABEL),
    );
  }

  const defaultEnabled = pickDefaultEnabled(raw, diagnostics);
  const full: ClaudeManifestFull = {
    identity: pickManifestIdentity(raw),
    pathOverrides: pickPathOverrides(raw, diagnostics),
    userConfig: pickUserConfig(raw.userConfig),
    dependencies: pickDependencies(raw.dependencies),
    experimental: pickExperimental(raw, diagnostics),
    diagnostics,
  };
  if (defaultEnabled !== undefined) {
    full.defaultEnabled = defaultEnabled;
  }
  return full;
}

/** Единый `ManifestResult` для потребителей B4; Claude-манифест не несёт extensions. */
export function parseManifest(raw: unknown): ManifestResult {
  const full = parseClaudeManifestFull(raw);
  const identity: PluginIdentity =
    full.defaultEnabled === undefined
      ? full.identity
      : { ...full.identity, defaultEnabled: full.defaultEnabled };
  return {
    identity,
    declaredSchema: optionalStringField(raw, '$schema'),
    pathOverrides: full.pathOverrides,
    userConfig: full.userConfig,
    dependencies: full.dependencies,
    extensions: {},
    diagnostics: full.diagnostics,
  };
}

/** Известные адаптеру поля со строгой формой значения: путь, список путей или inline-объект. */
function pickPathOverrides(
  raw: Record<string, unknown>,
  diagnostics: PluginDiagnostic[],
): PathOverrides {
  const overrides: PathOverrides = {};
  for (const key of PATH_OVERRIDE_KEYS) {
    const value = raw[key];
    if (value === undefined) {
      continue;
    }
    const override = asOverrideValue(value);
    if (override !== undefined) {
      overrides[key] = override;
      continue;
    }
    if (key === 'workflows') {
      // Поле схеме неизвестно: форму значения проверяет адаптер.
      diagnostics.push(
        manifestTypeError(MANIFEST_LABEL, key, 'a path, a list of paths, or an object'),
      );
    }
  }
  return overrides;
}

function asOverrideValue(value: unknown): PathOverrideValue | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  if (isPlainObject(value)) {
    return value;
  }
  return undefined;
}

function pickUserConfig(value: unknown): ConfigOptionSpec[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const options: ConfigOptionSpec[] = [];
  for (const [key, entry] of Object.entries(value)) {
    const option = asConfigOption(key, entry);
    if (option !== undefined) {
      options.push(option);
    }
  }
  return options;
}

/** Запись userConfig: type из закрытого списка, title/description строки (проверяет схема). */
function asConfigOption(key: string, value: unknown): ConfigOptionSpec | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const type = value.type;
  if (
    type !== 'string' &&
    type !== 'number' &&
    type !== 'boolean' &&
    type !== 'directory' &&
    type !== 'file'
  ) {
    return undefined;
  }
  if (typeof value.title !== 'string' || typeof value.description !== 'string') {
    return undefined;
  }
  const option: ConfigOptionSpec = {
    key,
    type,
    title: value.title,
    description: value.description,
  };
  if (typeof value.required === 'boolean') {
    option.required = value.required;
  }
  if (typeof value.sensitive === 'boolean') {
    option.sensitive = value.sensitive;
  }
  if (typeof value.multiple === 'boolean') {
    option.multiple = value.multiple;
  }
  if (typeof value.min === 'number') {
    option.min = value.min;
  }
  if (typeof value.max === 'number') {
    option.max = value.max;
  }
  const fallback = value.default;
  if (
    typeof fallback === 'string' ||
    typeof fallback === 'number' ||
    typeof fallback === 'boolean'
  ) {
    option.default = fallback;
  }
  return option;
}

/** Claude dependencies: голые имена или записи {name, version?, marketplace?}. */
function pickDependencies(value: unknown): PluginDependency[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const dependencies: PluginDependency[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      dependencies.push(item);
      continue;
    }
    if (!isPlainObject(item) || typeof item.name !== 'string') {
      continue;
    }
    const dependency: PluginDependency = { name: item.name };
    if (typeof item.version === 'string') {
      dependency.version = item.version;
    }
    if (typeof item.marketplace === 'string') {
      dependency.marketplace = item.marketplace;
    }
    dependencies.push(dependency);
  }
  return dependencies;
}

function pickExperimental(
  raw: Record<string, unknown>,
  diagnostics: PluginDiagnostic[],
): Record<string, unknown> {
  const value = raw.experimental;
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    // Поле схеме неизвестно: форму значения проверяет адаптер.
    diagnostics.push(manifestTypeError(MANIFEST_LABEL, 'experimental', 'an object'));
    return {};
  }
  return value;
}

function pickDefaultEnabled(
  raw: Record<string, unknown>,
  diagnostics: PluginDiagnostic[],
): boolean | undefined {
  const value = raw.defaultEnabled;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  // Поле схеме неизвестно: форму значения проверяет адаптер.
  diagnostics.push(manifestTypeError(MANIFEST_LABEL, 'defaultEnabled', 'a boolean'));
  return undefined;
}
