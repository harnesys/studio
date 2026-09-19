import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';

// Static JSON imports: the bundler embeds the schemas into compiled binaries.
// A runtime readFileSync next to import.meta.dir breaks under `$bunfs` —
// compiled builds only embed what is imported.
import apMcpSchemaJson from './schemas/ap-mcp-1.0.0.schema.json';
import apPluginSchemaJson from './schemas/ap-plugin-1.0.0.schema.json';
import claudeManifestSchemaJson from './schemas/claude-plugin-manifest.schema.json';

type SchemaName = 'apPlugin' | 'apMcp' | 'claudeManifest';

export type LoadedSchemas = Record<SchemaName, Record<string, unknown>>;

const SCHEMAS: LoadedSchemas = {
  apPlugin: apPluginSchemaJson as Record<string, unknown>,
  apMcp: apMcpSchemaJson as Record<string, unknown>,
  claudeManifest: claudeManifestSchemaJson as Record<string, unknown>,
};

export function loadSchemas(): LoadedSchemas {
  return { ...SCHEMAS };
}

// AP-схемы декларируют draft 2020-12, claude-схема — draft-07: один Ajv
// инстанс не поднимает обе метасхемы, поэтому два, по одной на draft.
// verbose нужен, чтобы у oneOf-ошибок были children — иначе диагностика
// разрастается всеми ветками сразу.
const ajv2020 = new Ajv2020({ strict: false, allErrors: true, verbose: true, logger: false });
const ajvDraft07 = new Ajv({ strict: false, allErrors: true, verbose: true, logger: false });

const validators = new Map<SchemaName, ValidateFunction>();

function validator(name: SchemaName): ValidateFunction {
  const existing = validators.get(name);
  if (existing !== undefined) {
    return existing;
  }
  const schemas = loadSchemas();
  const ajv = name === 'claudeManifest' ? ajvDraft07 : ajv2020;
  const validate = ajv.compile(schemas[name] as never);
  validators.set(name, validate);
  return validate;
}

const MAX_ERROR_LINES = 6;

/**
 * oneOf/anyOf с allErrors печатает ошибки всех неподшедших веток: на один
 * битый сервер — десятки строк («required command» и «required url» сразу).
 * Ajv 8 на этих схемах не отдаёт children/keywordLocation, поэтому остаётся
 * только сжать вывод: дедуп по строке, реплика-родитель «match exactly one»
 * не несёт информации и выкидывается, верх списка — MAX_ERROR_LINES.
 */
function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (errors === null || errors === undefined) {
    return [];
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  let hidden = 0;
  for (const error of errors) {
    if (error.keyword === 'oneOf' || error.keyword === 'anyOf') {
      continue;
    }
    const line = `${error.instancePath || '/'}: ${error.message ?? 'is invalid'}`;
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    if (lines.length < MAX_ERROR_LINES) {
      lines.push(line);
    } else {
      hidden++;
    }
  }
  if (hidden > 0) {
    lines.push(`… and ${hidden} more`);
  }
  return lines;
}

function check(name: SchemaName, value: unknown): string[] {
  const validate = validator(name);
  return validate(value) ? [] : formatErrors(validate.errors);
}

export function validateApManifest(value: unknown): string[] {
  return check('apPlugin', value);
}

export function validateApMcp(value: unknown): string[] {
  return check('apMcp', value);
}

export function validateClaudeManifest(value: unknown): string[] {
  return check('claudeManifest', value);
}
