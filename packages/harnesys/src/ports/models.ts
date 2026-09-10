import { DRIVERS } from '../constants.ts';

export { DRIVERS };
export type Driver = (typeof DRIVERS)[number];

export type ModelOrigin = 'local' | 'remote';

export type ModelPricing = {
  prompt: string;
  completion: string;
  image?: string;
  request?: string;
  input_cache_read?: string;
  input_cache_write?: string;
};

export type ModelArchitecture = {
  modality?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  tokenizer?: string;
  instruct_type?: string | null;
};

export type ModelTopProvider = {
  context_length?: number;
  max_completion_tokens?: number;
  is_moderated?: boolean;
};

export type ModelKind = 'chat' | 'embed' | 'image' | 'audio';

export type ModelFields = {
  id?: string;
  name?: string;
  description?: string;
  kind?: ModelKind;
  context_length?: number;
  architecture?: ModelArchitecture;
  pricing?: ModelPricing;
  top_provider?: ModelTopProvider;
  supported_parameters?: string[];
  effort?: string[];
};

export type ModelRecord = ModelFields & {
  name: string;
  origin?: ModelOrigin;
  host?: ModelFields;
};

export type ResolvedModel = ModelFields & {
  name: string;
  origin?: ModelOrigin;
};

export type ProviderConfig = {
  name: string;
  driver: string;
  apiKey?: string;
  apiUrl?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  models: ModelRecord[];
};

export type ModelBinding = {
  name: string;
  driver: Driver;
  apiUrl?: string;
  headers?: Record<string, string>;
  apiKey?: string;
  enabled: boolean;
  model: ResolvedModel;
};

export type DiscoveredModel = ModelFields & {
  name: string;
  deprecated?: boolean;
  raw?: unknown;
};

export type FetchLike = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DiscoverInput = {
  driver: string;
  apiKey?: string;
  apiUrl?: string;
  headers?: Record<string, string>;
  fetch?: FetchLike;
};

export type ModelsPort = {
  get: (provider: string, name: string) => Promise<ModelBinding>;
};

export type ModelsApi = ModelsPort & {
  discover: (input: DiscoverInput) => Promise<DiscoveredModel[]>;
};

export function normalizeProvider(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    enabled: provider.enabled !== false,
    models: provider.models.map((m) => ({ ...m })),
  };
}

export function resolveModel(record: ModelRecord): ResolvedModel {
  const { host, ...rest } = record;
  return {
    ...(host ?? {}),
    ...rest,
    name: record.name,
    origin: record.origin,
  };
}
