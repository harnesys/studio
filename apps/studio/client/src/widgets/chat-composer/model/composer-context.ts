import type { ProviderPublic, SessionEvent } from '@harnesys/studio-shared';
import { type MessageUsage, rollupUsage, type UsageRollup } from '@/entities/session';
import {
  fillUsageCost,
  fillUsageWindow,
  generationUsages,
  turnGenerationUsages,
} from './model-context';

export type ComposerUsage = {
  last: MessageUsage | null;
  run: UsageRollup;
  thread: UsageRollup;
};

export function composerUsage(
  events: SessionEvent[],
  modelId: string | null | undefined,
  providers: ProviderPublic[],
  contextWindow: number,
): ComposerUsage {
  const usages = generationUsages(events).map((item) => {
    const filled = fillUsageCost(item, modelId, providers);
    return filled ?? item;
  });
  const run = rollupUsage(
    turnGenerationUsages(events).map((item) => fillUsageCost(item, modelId, providers) ?? item),
  );
  return {
    last: fillUsageWindow(usages.at(-1) ?? null, contextWindow),
    run,
    thread: rollupUsage(usages),
  };
}
