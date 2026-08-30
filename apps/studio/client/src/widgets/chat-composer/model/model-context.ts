import type { ModelPricing, ProviderPublic, SessionEvent, TokenUsage } from '@studio/shared';
import { type MessageUsage } from '@/entities/session';

import { findModel } from './model-input';

/** One MessageUsage per LLM generation. Stubbed — SessionEvent doesn't carry step metadata. */
export function generationUsages(_events: SessionEvent[]): MessageUsage[] {
  return [];
}

/** Usages after the last human entry (current turn). Stubbed — SessionEvent doesn't carry step metadata. */
export function turnGenerationUsages(_events: SessionEvent[]): MessageUsage[] {
  return [];
}

export function modelContextWindow(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
  fallback?: number,
): number {
  const record = findModel(modelId, providers);
  const window =
    record?.contextWindow ??
    record?.host?.context_length ??
    record?.host?.top_provider?.context_length ??
    record?.context_length ??
    record?.top_provider?.context_length;
  if (window && window > 0) {
    return window;
  }
  return fallback && fallback > 0 ? fallback : 0;
}

export function fillUsageWindow(usage: MessageUsage | null, window: number): MessageUsage | null {
  if (!usage) {
    return null;
  }
  if (usage.contextTokens > 0 || window <= 0) {
    return usage;
  }
  return { ...usage, contextTokens: window };
}

export function fillUsageCost(
  usage: MessageUsage | null,
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): MessageUsage | null {
  if (!usage || (usage.costUsd != null && usage.costUsd > 0)) {
    return usage;
  }
  const pricing = modelPricing(modelId, providers);
  const usd = usageCostUsd(pricing, {
    input: usage.promptTokens,
    output: usage.generatedTokens,
    cacheRead: usage.cacheReadTokens,
    cacheWrite: usage.cacheWriteTokens,
  });
  if (usd == null) {
    return usage;
  }
  return { ...usage, costUsd: usd };
}

function modelPricing(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): ModelPricing | undefined {
  const record = findModel(modelId, providers);
  return record?.host?.pricing ?? record?.pricing;
}

function usageCostUsd(pricing: ModelPricing | undefined, tokens: TokenUsage): number | undefined {
  if (!pricing) {
    return undefined;
  }
  const promptPrice = Number(pricing.prompt);
  const completionPrice = Number(pricing.completion);
  if (!Number.isFinite(promptPrice) || !Number.isFinite(completionPrice)) {
    return undefined;
  }
  const cacheReadPrice = pricing.input_cache_read ? Number(pricing.input_cache_read) : 0;
  const cacheWritePrice = pricing.input_cache_write ? Number(pricing.input_cache_write) : 0;
  const cached = tokens.cacheRead ?? 0;
  const written = tokens.cacheWrite ?? 0;
  const billedInput = Math.max(0, tokens.input - cached);
  return (
    billedInput * promptPrice +
    tokens.output * completionPrice +
    cached * cacheReadPrice +
    written * cacheWritePrice
  );
}
