export type ToolRunStat = {
  name: string;
  status: string;
  durationMs: number;
  tokens?: number;
};
export type MessageUsage = {
  model: string;
  promptTokens: number;
  generatedTokens: number;
  contextTokens: number;
  durationMs: number;
  tools: ToolRunStat[];
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  steps?: number;
};
export type UsageRollup = {
  promptTokens: number;
  generatedTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  durationMs: number;
  costUsd: number;
  calls: number;
  steps: number;
};
export function tokensUsed(usage: MessageUsage): number {
  return usage.promptTokens;
}
export function tokensLeft(usage: MessageUsage): number {
  return Math.max(0, usage.contextTokens - tokensUsed(usage));
}
export function contextUsedRatio(usage: MessageUsage): number {
  if (usage.contextTokens <= 0) {
    return 0;
  }
  return Math.min(1, tokensUsed(usage) / usage.contextTokens);
}
export function formatTokenCount(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 2)}M`;
  }
  if (value >= 10000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return String(value);
}
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}
type GenerationUsage = {
  input?: number;
  output?: number;
  ms?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
};
export function usageFromGeneration(
  usage: GenerationUsage | null | undefined,
): MessageUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    model: '',
    promptTokens: usage.input ?? 0,
    generatedTokens: usage.output ?? 0,
    contextTokens: 0,
    durationMs: usage.ms ?? 0,
    tools: [],
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    reasoningTokens: usage.reasoning,
  };
}
export function rollupUsage(items: MessageUsage[]): UsageRollup {
  return items.reduce<UsageRollup>(
    (sum, item) => ({
      promptTokens: sum.promptTokens + item.promptTokens,
      generatedTokens: sum.generatedTokens + item.generatedTokens,
      cacheReadTokens: sum.cacheReadTokens + (item.cacheReadTokens ?? 0),
      cacheWriteTokens: sum.cacheWriteTokens + (item.cacheWriteTokens ?? 0),
      reasoningTokens: sum.reasoningTokens + (item.reasoningTokens ?? 0),
      durationMs: sum.durationMs + item.durationMs,
      costUsd: sum.costUsd + (item.costUsd ?? 0),
      calls: sum.calls + 1,
      steps: sum.steps + (item.steps ?? 1),
    }),
    {
      promptTokens: 0,
      generatedTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      durationMs: 0,
      costUsd: 0,
      calls: 0,
      steps: 0,
    },
  );
}
export function estimateTokens(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.3));
}
export function contextWindowForModel(model: string): number {
  if (model.includes('4')) {
    return 256000;
  }
  if (model.includes('3')) {
    return 131000;
  }
  return 128000;
}
