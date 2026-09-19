import type { ModelArchitecture, ModelPricing, ModelTopProvider } from '../../../ports/models.ts';
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}
export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}
export function itemsOf(json: unknown, key = 'data'): unknown[] {
  if (Array.isArray(json)) {
    return json;
  }
  const record = asRecord(json);
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}
export function formatPriceString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? value.trim() : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}
export function pricePerTokenFromPerMillion(perMillion: number | undefined): string | undefined {
  if (perMillion === undefined || !Number.isFinite(perMillion)) {
    return undefined;
  }
  return String(perMillion / 1000000);
}
export function pricingOf(parts: {
  prompt?: string | number;
  completion?: string | number;
  input_cache_read?: string | number;
  input_cache_write?: string | number;
  image?: string | number;
  request?: string | number;
}): ModelPricing | undefined {
  const prompt = formatPriceString(parts.prompt);
  const completion = formatPriceString(parts.completion);
  if (prompt === undefined || completion === undefined) {
    return undefined;
  }
  return {
    prompt,
    completion,
    input_cache_read: formatPriceString(parts.input_cache_read),
    input_cache_write: formatPriceString(parts.input_cache_write),
    image: formatPriceString(parts.image),
    request: formatPriceString(parts.request),
  };
}
export function architectureOf(input?: string[], output?: string[]): ModelArchitecture | undefined {
  if (!input && !output) {
    return undefined;
  }
  return {
    input_modalities: input ?? [],
    output_modalities: output ?? [],
  };
}
export function topProviderOf(
  context_length?: number,
  max_completion_tokens?: number,
): ModelTopProvider | undefined {
  if (context_length === undefined && max_completion_tokens === undefined) {
    return undefined;
  }
  return {
    context_length,
    max_completion_tokens,
  };
}
