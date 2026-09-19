import type { PortRef } from '@harnesys/studio-shared';
import { THRESHOLD_SUMMARY_NAME } from '@harnesys/studio-shared';
export type CompactionDraft = {
  enabled: boolean;
  thresholdRatio: string;
  protectRecentRatio: string;
  outputReserveTokens: string;
  auto: boolean;
  summaryProvider: string;
  summaryModel: string;
};
export function compactionDraftFrom(ref: PortRef): CompactionDraft {
  if (!ref) {
    return {
      enabled: false,
      thresholdRatio: '0.8',
      protectRecentRatio: '0.1',
      outputReserveTokens: '',
      auto: true,
      summaryProvider: '',
      summaryModel: '',
    };
  }
  const spec = ref.spec ?? {};
  const summary = summaryModelFrom(spec.summaryModel);
  return {
    enabled: true,
    thresholdRatio: stringifyNumber(spec.thresholdRatio, '0.8'),
    protectRecentRatio: stringifyNumber(spec.protectRecentRatio, '0.1'),
    outputReserveTokens: stringifyOptional(spec.outputReserveTokens),
    auto: spec.auto !== false,
    summaryProvider: summary.provider,
    summaryModel: summary.model,
  };
}
export function toCompactionPortRef(draft: CompactionDraft): PortRef {
  if (!draft.enabled) {
    return null;
  }
  const spec: Record<string, unknown> = {
    thresholdRatio: parseRatio(draft.thresholdRatio, 0.8),
    protectRecentRatio: parseRatio(draft.protectRecentRatio, 0.1),
    auto: draft.auto,
  };
  const reserve = parseOptionalInt(draft.outputReserveTokens);
  if (reserve !== undefined) {
    spec.outputReserveTokens = reserve;
  }
  const provider = draft.summaryProvider.trim();
  const model = draft.summaryModel.trim();
  if (provider && model) {
    spec.summaryModel = { provider, model };
  }
  return { name: THRESHOLD_SUMMARY_NAME, spec };
}
function summaryModelFrom(value: unknown): {
  provider: string;
  model: string;
} {
  if (typeof value !== 'object' || value === null) {
    return { provider: '', model: '' };
  }
  const record = value as {
    provider?: unknown;
    model?: unknown;
  };
  return {
    provider: typeof record.provider === 'string' ? record.provider : '',
    model: typeof record.model === 'string' ? record.model : '',
  };
}
function stringifyNumber(value: unknown, fallback: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}
function stringifyOptional(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
function parseRatio(value: string, fallback: number): number {
  const next = Number(value.trim());
  return Number.isFinite(next) ? next : fallback;
}
function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const next = Number(trimmed);
  return Number.isFinite(next) ? Math.floor(next) : undefined;
}
