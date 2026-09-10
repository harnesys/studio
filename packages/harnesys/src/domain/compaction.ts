import type { AgentModelRef } from './agent-definition.ts';

export { THRESHOLD_SUMMARY_NAME } from '../constants.ts';

export type CompactionSpec = {
  thresholdRatio?: number;
  protectRecentRatio?: number;
  outputReserveTokens?: number;
  auto?: boolean;
  summaryModel?: AgentModelRef;
};

export type ParsedCompactionSpec = {
  thresholdRatio: number;
  protectRecentRatio: number;
  outputReserveTokens: number;
  auto: boolean;
  summaryModel?: AgentModelRef;
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function isModelRef(value: unknown): value is AgentModelRef {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { provider?: unknown }).provider === 'string' &&
      typeof (value as { model?: unknown }).model === 'string',
  );
}

export function parseThresholdSpec(spec?: Record<string, unknown>): ParsedCompactionSpec {
  const raw = spec ?? {};
  const reserve =
    typeof raw.outputReserveTokens === 'number' && Number.isFinite(raw.outputReserveTokens)
      ? Math.max(0, Math.floor(raw.outputReserveTokens))
      : 0;
  return {
    thresholdRatio: clamp(raw.thresholdRatio, 0.1, 1, 0.8),
    protectRecentRatio: clamp(raw.protectRecentRatio, 0, 0.9, 0.1),
    outputReserveTokens: reserve,
    auto: raw.auto !== false,
    summaryModel: isModelRef(raw.summaryModel) ? raw.summaryModel : undefined,
  };
}

export type CompactionMessage = {
  role: 'assistant';
  kind: 'compaction';
  id: string;
  content: string;
  coveredFrom: number;
  coveredUntil: number;
  reason: 'threshold' | 'manual';
  stats: { tokensBefore: number; tokensAfter: number; coveredCount: number; usage?: unknown };
  model?: { provider: string; model: string };
  createdAt: string;
};

export function isCompactionMessage(value: unknown): value is CompactionMessage {
  return Boolean(
    value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'compaction',
  );
}
