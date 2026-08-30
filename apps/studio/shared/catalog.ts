export const DRIVERS = [
  'openai',
  'openai-compatible',
  'anthropic',
  'openrouter',
  'google',
  'groq',
  'mistral',
  'xai',
  'together',
  'kimi',
  'zai',
  'ollama',
  'ollama-cloud',
  'nvidia',
  'cerebras',
  'minimax',
  'xiaomi',
  'qwen',
] as const;

export type Driver = (typeof DRIVERS)[number];

export type DriverEndpoint = {
  id: string;
  label: string;
  apiUrl: string;
  group?: string;
};

export type CatalogDriver = {
  id: Driver;
  defaultUrl: string;
  endpoints: DriverEndpoint[];
};

export type StudioCatalog = {
  drivers: CatalogDriver[];
};

export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type Effort = (typeof EFFORTS)[number];

export type ModelKind = 'chat' | 'embed' | 'image' | 'audio';

export const MODALITIES = ['text', 'audio', 'image', 'video', 'file'] as const;
export type Modality = (typeof MODALITIES)[number];

export const MODEL_FEATURES = ['tools', 'structured', 'streaming', 'reasoning', 'cache'] as const;
export type ModelFeature = (typeof MODEL_FEATURES)[number];

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
  input_modalities?: Modality[];
  output_modalities?: Modality[];
  tokenizer?: string;
  instruct_type?: string | null;
};

export type ModelTopProvider = {
  context_length?: number;
  max_completion_tokens?: number;
  is_moderated?: boolean;
};

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
  effort?: Effort[];
};

export type ModelRecord = ModelFields & {
  name: string;
  origin?: ModelOrigin;
  host?: ModelFields;
};

export type DiscoveredModel = ModelFields & {
  name: string;
  deprecated?: boolean;
  raw?: unknown;
};

export const INCOMPLETE_FIELDS = ['context_length', 'pricing'] as const;
export type IncompleteField = (typeof INCOMPLETE_FIELDS)[number];

export type ModelHints = {
  missing: IncompleteField[];
  verified: boolean;
  efforts: Effort[];
  contextWindow?: number;
  unitCost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
};

export type StudioModel = ModelRecord & {
  id: string;
};

export type StudioModelView = StudioModel & ModelHints;
export type DiscoveredModelView = DiscoveredModel & ModelHints;

export function isDriver(value: string): value is Driver {
  return (DRIVERS as readonly string[]).includes(value);
}

export function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}
