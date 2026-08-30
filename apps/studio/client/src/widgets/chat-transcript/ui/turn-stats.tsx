import { formatDuration, formatTokenCount, type MessageUsage } from '@/entities/journal';

export function StepStats({ usage }: { usage: MessageUsage }) {
  return (
    <p
      className="px-1.5 font-mono text-[11px] text-muted-foreground/80"
      data-testid="generation-stats"
    >
      {`${formatUsageParts(usage)}`}
    </p>
  );
}

export function TurnStats({ usage, generations }: { usage: MessageUsage; generations: number }) {
  const parts = [formatDuration(usage.durationMs || 0)];
  if (generations > 0) {
    parts.push(`${generations} ${generations === 1 ? 'gen' : 'gens'}`);
  }
  if (usage.costUsd && usage.costUsd > 0) {
    parts.push(`$${usage.costUsd.toFixed(4)}`);
  }
  return (
    <p className="px-1.5 font-mono text-[11px] text-muted-foreground" data-testid="turn-stats">
      {`${parts.join(' · ')}`}
    </p>
  );
}

function formatUsageParts(usage: MessageUsage): string {
  const parts = [...tokenParts(usage)];
  if (usage.durationMs > 0) {
    parts.push(formatDuration(usage.durationMs));
  }
  if (usage.costUsd && usage.costUsd > 0) {
    parts.push(`$${usage.costUsd.toFixed(4)}`);
  }
  return parts.join(' · ');
}

function tokenParts(usage: MessageUsage): string[] {
  const parts = [
    `${formatTokenCount(usage.promptTokens)} in`,
    `${formatTokenCount(usage.generatedTokens)} out`,
  ];
  if (usage.cacheReadTokens && usage.cacheReadTokens > 0) {
    parts.push(`${formatTokenCount(usage.cacheReadTokens)} cache`);
  }
  if (usage.reasoningTokens && usage.reasoningTokens > 0) {
    parts.push(`${formatTokenCount(usage.reasoningTokens)} reason`);
  }
  return parts;
}
