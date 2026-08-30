import type {
  Modality,
  ModelArchitecture,
  ModelFields,
  ModelKind,
  ModelOrigin,
  ModelPricing,
  ModelRecord,
  ModelTopProvider,
} from '../../../shared/types.ts';
import { MODALITIES } from '../../../shared/types.ts';
import { ValidationError } from '../../domain/studio.error.ts';

export function readModel(body: unknown): ModelRecord {
  const origin = optionalOrigin(body) ?? 'remote';
  const fields = readFields(body);
  if (origin === 'local') {
    return {
      name: requiredString(body, 'name'),
      origin,
      host: fields,
    };
  }
  return {
    name: requiredString(body, 'name'),
    ...fields,
    origin,
  };
}

function readFields(body: unknown): ModelFields {
  return {
    id: optionalString(body, 'id'),
    description: optionalString(body, 'description'),
    kind: optionalKind(body),
    context_length: optionalNumber(body, 'context_length'),
    architecture: optionalArchitecture(body),
    pricing: optionalPricing(body),
    top_provider: optionalTopProvider(body),
    supported_parameters: optionalStringList(body, 'supported_parameters'),
  };
}

function optionalOrigin(body: unknown): ModelOrigin | undefined {
  if (!body || typeof body !== 'object' || !('origin' in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).origin;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === 'local' || value === 'remote') {
    return value;
  }
  throw new ValidationError('unknown origin');
}

export function assignModel(model: ModelRecord, body: unknown): void {
  if (!body || typeof body !== 'object') {
    return;
  }
  const rec = body as Record<string, unknown>;
  if (typeof rec.name === 'string' && rec.name.trim()) {
    model.name = rec.name.trim();
  }
  const host: ModelFields = { ...model.host };
  if ('context_length' in rec) {
    writeHost(host, 'context_length', optionalNumber(body, 'context_length'));
  }
  if ('kind' in rec) {
    writeHost(host, 'kind', optionalKind(body));
  }
  if ('architecture' in rec) {
    writeHost(host, 'architecture', optionalArchitecture(body));
  }
  if ('pricing' in rec) {
    writeHost(host, 'pricing', optionalPricing(body));
  }
  if ('top_provider' in rec) {
    writeHost(host, 'top_provider', optionalTopProvider(body));
  }
  if ('supported_parameters' in rec) {
    writeHost(host, 'supported_parameters', optionalStringList(body, 'supported_parameters'));
  }
  model.host = hasHost(host) ? host : undefined;
}

function writeHost<K extends keyof ModelFields>(
  host: ModelFields,
  key: K,
  value: ModelFields[K] | undefined,
): void {
  if (value === undefined) {
    delete host[key];
    return;
  }
  host[key] = value;
}

function hasHost(host: ModelFields): boolean {
  return (
    host.kind !== undefined ||
    host.context_length !== undefined ||
    host.architecture !== undefined ||
    host.pricing !== undefined ||
    host.top_provider !== undefined ||
    host.supported_parameters !== undefined
  );
}

function requiredString(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') {
    throw new ValidationError(`${key} required`);
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${key} required`);
  }
  return value.trim();
}

function optionalString(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function optionalNumber(body: unknown, key: string): number | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  return readAmount((body as Record<string, unknown>)[key], key);
}

function readAmount(value: unknown, key: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new ValidationError(`${key} must be number`);
}

function optionalKind(body: unknown): ModelKind | undefined {
  if (!body || typeof body !== 'object' || !('kind' in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).kind;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === 'chat' || value === 'embed' || value === 'image' || value === 'audio') {
    return value;
  }
  throw new ValidationError('unknown kind');
}

function optionalArchitecture(body: unknown): ModelArchitecture | undefined {
  if (!body || typeof body !== 'object' || !('architecture' in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).architecture;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== 'object') {
    throw new ValidationError('architecture must be object');
  }
  const rec = value as Record<string, unknown>;
  return {
    modality: typeof rec.modality === 'string' ? rec.modality : undefined,
    input_modalities: readModalityList(rec.input_modalities, 'architecture.input_modalities'),
    output_modalities: readModalityList(rec.output_modalities, 'architecture.output_modalities'),
    tokenizer: typeof rec.tokenizer === 'string' ? rec.tokenizer : undefined,
    instruct_type: typeof rec.instruct_type === 'string' ? rec.instruct_type : null,
  };
}

function optionalStringList(body: unknown, key: string): string[] | undefined {
  if (!body || typeof body !== 'object' || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`${key} must be string[]`);
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readModalityList(value: unknown, key: string): Modality[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`${key} must be string[]`);
  }
  return value.map((item, index) => {
    if (!isModality(item)) {
      throw new ValidationError(`unknown modality at ${key}[${index}]`);
    }
    return item;
  });
}

function isModality(value: unknown): value is Modality {
  return typeof value === 'string' && (MODALITIES as readonly string[]).includes(value);
}

function optionalTopProvider(body: unknown): ModelTopProvider | undefined {
  if (!body || typeof body !== 'object' || !('top_provider' in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).top_provider;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== 'object') {
    throw new ValidationError('top_provider must be object');
  }
  const rec = value as Record<string, unknown>;
  return {
    context_length: optionalNumber(rec, 'context_length'),
    max_completion_tokens: optionalNumber(rec, 'max_completion_tokens'),
    is_moderated: typeof rec.is_moderated === 'boolean' ? rec.is_moderated : undefined,
  };
}

function optionalPricing(body: unknown): ModelPricing | undefined {
  if (!body || typeof body !== 'object' || !('pricing' in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).pricing;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== 'object') {
    throw new ValidationError('pricing must be object');
  }
  const rec = value as Record<string, unknown>;
  const prompt = optionalString(rec, 'prompt');
  const completion = optionalString(rec, 'completion');
  if (prompt === undefined || completion === undefined) {
    throw new ValidationError('pricing.prompt and pricing.completion required');
  }
  return {
    prompt,
    completion,
    image: optionalString(rec, 'image'),
    request: optionalString(rec, 'request'),
    input_cache_read: optionalString(rec, 'input_cache_read'),
    input_cache_write: optionalString(rec, 'input_cache_write'),
  };
}
