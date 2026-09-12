import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import { validateApManifest } from '../schema-loader.ts';
import {
  isAdditionalPropertiesError,
  isPlainObject,
  type ManifestResult,
  manifestFatal,
  manifestSchemaFatal,
  manifestUnknownFieldWarning,
  optionalStringField,
  type PluginRootListing,
  pickManifestIdentity,
} from './manifest-result.ts';

/** Канонический $schema идентификатор манифеста Agent Plugins 1.0.0. */
export const AGENT_PLUGINS_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

/** Поля закрытого AP-манифеста; всё остальное игнорируется с диагностикой (AP §5.2). */
const AP_MANIFEST_KEYS: ReadonlySet<string> = new Set([
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

const MANIFEST_LABEL = 'plugin.json';

/** Распознаёт AP-плагин по корневому `plugin.json`; иначе null. */
export function detect(listing: PluginRootListing): 'agent-plugins' | null {
  return listing.includes(MANIFEST_LABEL) ? 'agent-plugins' : null;
}

/**
 * Разбирает закрытый AP-манифест: `validateApManifest` + ручной отбор полей.
 * Неизвестные top-level поля дают warning `unknown_manifest_field` и игнорируются
 * (AP §5.2 report-and-ignore, не фатал); фатальный отказ = error-diagnostic.
 * Манифест закрытый: `pathOverrides`, `userConfig`, `dependencies` всегда пусты (§5.2).
 */
export function parseManifest(raw: unknown): ManifestResult {
  if (!isPlainObject(raw)) {
    return {
      identity: { name: '' },
      pathOverrides: {},
      userConfig: [],
      dependencies: [],
      extensions: {},
      diagnostics: [manifestFatal(MANIFEST_LABEL, 'must be a JSON object')],
    };
  }

  const diagnostics: PluginDiagnostic[] = [];
  const declaredSchema = optionalStringField(raw, '$schema');

  if (declaredSchema !== undefined && declaredSchema !== AGENT_PLUGINS_SCHEMA_ID) {
    diagnostics.push({
      level: 'error',
      code: 'unsupported_schema_version',
      message: `unsupported ${MANIFEST_LABEL} $schema "${declaredSchema}", expected "${AGENT_PLUGINS_SCHEMA_ID}"`,
      path: '$schema',
    });
    return {
      identity: pickManifestIdentity(raw),
      declaredSchema,
      pathOverrides: {},
      userConfig: [],
      dependencies: [],
      extensions: {},
      diagnostics,
    };
  }

  for (const key of Object.keys(raw)) {
    if (!AP_MANIFEST_KEYS.has(key)) {
      diagnostics.push(manifestUnknownFieldWarning(MANIFEST_LABEL, key));
    }
  }

  // Нарушения additionalProperties соответствуют уже учтённым неизвестным полям
  // (top-level) или вложенным неизвестным полям, которые отбор молча игнорирует.
  for (const error of validateApManifest(raw)) {
    if (!isAdditionalPropertiesError(error)) {
      diagnostics.push(manifestSchemaFatal(error, MANIFEST_LABEL));
    }
  }

  return {
    identity: pickManifestIdentity(raw),
    declaredSchema,
    pathOverrides: {},
    userConfig: [],
    dependencies: [],
    extensions: pickExtensions(raw.extensions),
    diagnostics,
  };
}

/** AP §8: reverse-domain namespace'ы, значения — объекты; прочее отфильтровывается. */
function pickExtensions(value: unknown): Record<string, Record<string, unknown>> {
  if (!isPlainObject(value)) {
    return {};
  }
  const extensions: Record<string, Record<string, unknown>> = {};
  for (const [namespace, entry] of Object.entries(value)) {
    if (isPlainObject(entry)) {
      extensions[namespace] = entry;
    }
  }
  return extensions;
}
