import { type Effort, isEffort, type ProviderPublic } from '@harnesys/studio-shared';
import { findModel } from './model-input';
export function agentEfforts(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): Effort[] {
  const levels = findModel(modelId, providers)?.efforts ?? [];
  if (modelReasoningMandatory(modelId, providers)) {
    return levels.filter((item) => item !== 'none');
  }
  return levels;
}
export function agentDefaultEffort(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): Effort | undefined {
  const value = findModel(modelId, providers)?.defaultEffort;
  return typeof value === 'string' && isEffort(value) ? value : undefined;
}
function modelReasoningMandatory(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): boolean {
  return findModel(modelId, providers)?.reasoningMandatory === true;
}
export function agentModelVerified(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): boolean {
  return findModel(modelId, providers)?.verified ?? true;
}
export function selectedEffort(
  levels: Effort[],
  current?: string,
  defaultLevel?: string,
): Effort | undefined {
  if (levels.length === 0) {
    return undefined;
  }
  const matched = current ? levels.find((item) => item === current) : undefined;
  if (matched) {
    return matched;
  }
  if (defaultLevel && levels.some((item) => item === defaultLevel)) {
    return defaultLevel as Effort;
  }
  if (levels.includes('medium')) {
    return 'medium';
  }
  const active = levels.filter((item) => item !== 'none');
  return active.at(-1) ?? levels[0];
}
export function effortLabel(value: string): string {
  if (value === 'xhigh') {
    return 'Extra high';
  }
  if (value.length === 0) {
    return value;
  }
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
