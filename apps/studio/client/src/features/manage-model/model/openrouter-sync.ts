import type {
  DiscoveredModel,
  Effort,
  Modality,
  ModelArchitecture,
  ModelPricing,
  ModelTopProvider,
} from '@harnesys/studio-shared';
import { EFFORTS, isEffort, withChatGenerationParameters } from '@harnesys/studio-shared';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=all';

let cachedCatalogPromise: Promise<DiscoveredModel[]> | null = null;

export async function fetchOpenRouterCatalog(): Promise<DiscoveredModel[]> {
  if (!cachedCatalogPromise) {
    cachedCatalogPromise = (async () => {
      const response = await fetch(OPENROUTER_MODELS_URL);
      if (!response.ok) {
        throw new Error(`OpenRouter returned HTTP ${response.status}`);
      }
      const json = await response.json();
      return parseOpenRouterCatalog(json);
    })().catch((error) => {
      cachedCatalogPromise = null;
      throw error;
    });
  }
  return await cachedCatalogPromise;
}

export async function syncModelFromOpenRouter(
  modelName: string,
): Promise<OpenRouterMatch | undefined> {
  const catalog = await fetchOpenRouterCatalog();
  return findMatchingOpenRouterModel(catalog, modelName);
}

export type OpenRouterMatch = {
  model: DiscoveredModel;
  /** True when several catalog entries fit the query or only a prefix matched. */
  ambiguous: boolean;
};

export function findMatchingOpenRouterModel(
  catalog: DiscoveredModel[],
  query: string,
): OpenRouterMatch | undefined {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) {
    return undefined;
  }

  // 1. Exact full name match (e.g. "openai/gpt-4o" === "openai/gpt-4o")
  const exact = catalog.find((item) => item.name.toLowerCase() === normalizedQuery);
  if (exact) {
    return { model: exact, ambiguous: false };
  }

  // 2. Query matches the model part after vendor slash (e.g. "gpt-4o" matches "openai/gpt-4o")
  const querySuffix = suffixOf(normalizedQuery);
  const suffixMatches = catalog.filter((item) => suffixOf(item.name.toLowerCase()) === querySuffix);
  if (suffixMatches.length === 1) {
    return { model: suffixMatches[0], ambiguous: false };
  }
  if (suffixMatches.length > 1) {
    // Prefer base version over variants like :free or :exact
    const baseMatch = suffixMatches.find((item) => !item.name.includes(':'));
    return { model: baseMatch ?? suffixMatches[0], ambiguous: true };
  }

  // 3. Match without date/snapshot suffix (e.g. "claude-3-7-sonnet-20250219" matches "anthropic/claude-3-7-sonnet")
  const strippedQuery = stripDateAndVariant(querySuffix);
  for (const item of catalog) {
    const itemStripped = stripDateAndVariant(suffixOf(item.name.toLowerCase()));
    if (itemStripped === strippedQuery) {
      return { model: item, ambiguous: true };
    }
  }

  // 4. Starts with / prefix match
  for (const item of catalog) {
    const itemSuffix = suffixOf(item.name.toLowerCase());
    if (itemSuffix.startsWith(strippedQuery) || strippedQuery.startsWith(itemSuffix)) {
      return { model: item, ambiguous: true };
    }
  }

  return undefined;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function suffixOf(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash >= 0 ? name.slice(slash + 1) : name;
}

function stripDateAndVariant(name: string): string {
  return name
    .replace(/:\w+$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

function parseOpenRouterCatalog(json: unknown): DiscoveredModel[] {
  if (!json || typeof json !== 'object' || !('data' in json) || !Array.isArray(json.data)) {
    return [];
  }
  const result: DiscoveredModel[] = [];
  for (const item of json.data) {
    const mapped = mapOpenRouterItem(item);
    if (mapped) {
      result.push(mapped);
    }
  }
  return result;
}

function mapOpenRouterItem(record: unknown): DiscoveredModel | undefined {
  if (!record || typeof record !== 'object') {
    return undefined;
  }
  const item = record as Record<string, unknown>;
  const name = typeof item.id === 'string' ? item.id : undefined;
  if (!name) {
    return undefined;
  }

  const architecture =
    item.architecture && typeof item.architecture === 'object'
      ? (item.architecture as Record<string, unknown>)
      : undefined;
  const pricing =
    item.pricing && typeof item.pricing === 'object'
      ? (item.pricing as Record<string, unknown>)
      : undefined;
  const topProvider =
    item.top_provider && typeof item.top_provider === 'object'
      ? (item.top_provider as Record<string, unknown>)
      : undefined;

  const rawParams = Array.isArray(item.supported_parameters) ? item.supported_parameters : [];
  const params = rawParams.filter((p): p is string => typeof p === 'string');

  const inputModalities = extractModalities(architecture?.input_modalities);
  const outputModalities = extractModalities(architecture?.output_modalities);

  const contextLength =
    asPositiveNumber(item.context_length) ?? asPositiveNumber(topProvider?.context_length);
  const maxOutput = asPositiveNumber(topProvider?.max_completion_tokens);

  const promptPrice = formatPriceString(pricing?.prompt);
  const completionPrice = formatPriceString(pricing?.completion);
  const cacheReadPrice = formatPriceString(pricing?.input_cache_read);
  const cacheWritePrice = formatPriceString(pricing?.input_cache_write);

  let modelPricing: ModelPricing | undefined;
  if (promptPrice !== undefined && completionPrice !== undefined) {
    modelPricing = {
      prompt: promptPrice,
      completion: completionPrice,
      input_cache_read: cacheReadPrice,
      input_cache_write: cacheWritePrice,
    };
  }

  const reasoningInfo = readReasoningInfo(item.reasoning);
  const hasReasoningParams =
    params.includes('reasoning') ||
    params.includes('reasoning_effort') ||
    params.includes('include_reasoning') ||
    reasoningInfo !== undefined;

  const effort = hasReasoningParams ? resolveEffortLevels(name, reasoningInfo) : undefined;
  const modelArchitecture: ModelArchitecture | undefined =
    inputModalities.length > 0 || outputModalities.length > 0
      ? { input_modalities: inputModalities, output_modalities: outputModalities }
      : undefined;

  const modelTopProvider: ModelTopProvider | undefined =
    contextLength !== undefined || maxOutput !== undefined
      ? { context_length: contextLength, max_completion_tokens: maxOutput }
      : undefined;

  const description = typeof item.description === 'string' ? item.description : undefined;

  return {
    name,
    description,
    context_length: contextLength,
    architecture: modelArchitecture,
    pricing: modelPricing,
    top_provider: modelTopProvider,
    supported_parameters: withChatGenerationParameters(params.length > 0 ? params : undefined),
    effort,
    defaultEffort: reasoningInfo?.defaultEffort,
    reasoningMandatory: reasoningInfo?.mandatory,
  };
}

const NONE_LOW_MEDIUM_HIGH: Effort[] = ['none', 'low', 'medium', 'high'];
const LOW_MEDIUM_HIGH: Effort[] = ['low', 'medium', 'high'];
const OPENAI_EFFORT: Effort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const QWEN_EFFORT: Effort[] = ['none', 'low', 'medium', 'xhigh'];
const MISTRAL_EFFORT: Effort[] = ['none', 'high'];

type ReasoningInfo = {
  efforts: Effort[] | undefined;
  defaultEffort: Effort | undefined;
  mandatory: boolean | undefined;
};

/**
 * Vendor `reasoning` object from `GET /api/v1/models`. `supported_efforts`
 * is the only per-model source of gradations; an empty list means on/off
 * reasoning without effort control.
 */
function readReasoningInfo(raw: unknown): ReasoningInfo | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const supported = Array.isArray(record.supported_efforts)
    ? record.supported_efforts.filter(isEffortValue)
    : undefined;
  const efforts = supported === undefined ? undefined : sortEfforts(unique(supported));
  const defaultRaw = typeof record.default_effort === 'string' ? record.default_effort : undefined;
  const defaultEffort =
    defaultRaw !== undefined && isEffortValue(defaultRaw) ? defaultRaw : undefined;
  const mandatory = typeof record.mandatory === 'boolean' ? record.mandatory : undefined;
  return { efforts, defaultEffort, mandatory };
}

function isEffortValue(value: unknown): value is Effort {
  return typeof value === 'string' && isEffort(value);
}

function unique(values: Effort[]): Effort[] {
  return [...new Set(values)];
}

function sortEfforts(values: Effort[]): Effort[] {
  const order = new Map(EFFORTS.map((item, index) => [item, index]));
  return [...values].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/**
 * Vendor levels win. An explicit empty `supported_efforts` means no gradation
 * (effort control hidden), not the prefix guess. The prefix table is only a
 * fallback when OpenRouter carries no `reasoning` object.
 */
function resolveEffortLevels(
  modelId: string,
  info: ReasoningInfo | undefined,
): Effort[] | undefined {
  if (info !== undefined) {
    if (info.efforts === undefined) {
      return fallbackEffortLevels(modelId);
    }
    if (info.efforts.length === 0) {
      return undefined;
    }
    return info.mandatory === true ? info.efforts.filter((item) => item !== 'none') : info.efforts;
  }
  return fallbackEffortLevels(modelId);
}

function fallbackEffortLevels(modelId: string): Effort[] {
  const prefix = modelId.split('/')[0] ?? '';
  switch (prefix) {
    case 'openai':
      return OPENAI_EFFORT;
    case 'x-ai':
      return LOW_MEDIUM_HIGH;
    case 'mistralai':
      return MISTRAL_EFFORT;
    case 'qwen':
      return QWEN_EFFORT;
    case 'moonshotai':
      return ['low', 'high', 'max'];
    case 'nvidia':
      return LOW_MEDIUM_HIGH;
    default:
      return NONE_LOW_MEDIUM_HIGH;
  }
}

function extractModalities(raw: unknown): Modality[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const valid: Modality[] = ['text', 'image', 'audio', 'video', 'file'];
  return raw.filter((item): item is Modality => valid.includes(item as Modality));
}

function formatPriceString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? value.trim() : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  const num = asNumber(value);
  return num !== undefined && num > 0 ? num : undefined;
}
