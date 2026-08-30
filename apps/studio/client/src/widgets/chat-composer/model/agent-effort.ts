import type { Effort, ProviderPublic } from '@studio/shared';

import { findModel } from './model-input';

export function agentEfforts(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): Effort[] {
  return findModel(modelId, providers)?.efforts ?? [];
}

export function agentModelVerified(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): boolean {
  return findModel(modelId, providers)?.verified ?? true;
}

export function selectedEffort(levels: Effort[], current?: string): Effort | undefined {
  if (levels.length === 0) {
    return undefined;
  }
  const matched = current ? levels.find((item) => item === current) : undefined;
  if (matched) {
    return matched;
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
