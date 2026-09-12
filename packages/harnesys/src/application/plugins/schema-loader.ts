import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';

const SCHEMA_FILES = {
  apPlugin: 'ap-plugin-1.0.0.schema.json',
  apMcp: 'ap-mcp-1.0.0.schema.json',
  claudeManifest: 'claude-plugin-manifest.schema.json',
} as const;

type SchemaName = keyof typeof SCHEMA_FILES;

export type LoadedSchemas = {
  apPlugin: Record<string, unknown>;
  apMcp: Record<string, unknown>;
  claudeManifest: Record<string, unknown>;
};

const cache = new Map<string, Record<string, unknown>>();

function readSchema(file: string): Record<string, unknown> {
  const path = join(import.meta.dir, 'schemas', file);
  const cached = cache.get(path);
  if (cached !== undefined) {
    return cached;
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`plugin schema is not an object: ${path}`);
  }
  const schema: Record<string, unknown> = parsed as Record<string, unknown>;
  cache.set(path, schema);
  return schema;
}

export function loadSchemas(): LoadedSchemas {
  return {
    apPlugin: readSchema(SCHEMA_FILES.apPlugin),
    apMcp: readSchema(SCHEMA_FILES.apMcp),
    claudeManifest: readSchema(SCHEMA_FILES.claudeManifest),
  };
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
