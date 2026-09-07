import {
  formatDuration,
  formatTokenCount,
  type MessageUsage,
  tokensLeft,
  tokensUsed,
  type UsageRollup,
} from '@/entities/session';

type UsageCardProps = {
  last: MessageUsage | null;
  run: UsageRollup | null;
  thread: UsageRollup | null;
  window?: number;
};

export function UsageCard({ last, run, thread, window: windowProp = 0 }: UsageCardProps) {
  const window = last?.contextTokens || windowProp;
  const used = last ? tokensUsed(last) : 0;
  let left = 0;
  if (window > 0) {
    left = Math.max(0, window - used);
  } else if (last) {
    left = tokensLeft(last);
  }
  const percent = window > 0 ? Math.round(Math.min(1, used / window) * 100) : 0;

  return (
    <div className="flex flex-col gap-3" data-testid="usage-card">
      <div>
        <p className="font-medium text-sm">
          Context
          <span className="ml-1.5 font-mono font-normal text-muted-foreground text-xs">
            {formatTokenCount(used)} / {window > 0 ? formatTokenCount(window) : '—'}
          </span>
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-live"
            style={{ width: `${window > 0 ? Math.max(percent, 2) : 0}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>{window > 0 ? `${percent}% used` : 'Window unknown'}</span>
          <span>{window > 0 ? `${formatTokenCount(left)} remaining` : last?.model || '—'}</span>
        </div>
      </div>

      {run && run.calls > 0 ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            This run
          </p>
          <RollupRows rollup={run} />
        </div>
      ) : null}

      {thread && thread.calls > 0 ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Thread
          </p>
          <RollupRows rollup={thread} />
        </div>
      ) : null}
    </div>
  );
}

function RollupRows({ rollup }: { rollup: UsageRollup }) {
  const cacheMiss = Math.max(0, rollup.promptTokens - rollup.cacheReadTokens);
  return (
    <>
      <StatRow label="Input (Cache Miss)" value={`${formatTokenCount(cacheMiss)} tok`} />
      {rollup.cacheReadTokens > 0 ? (
        <StatRow label="Cache Hit" value={`${formatTokenCount(rollup.cacheReadTokens)} tok`} />
      ) : null}
      <StatRow label="Output" value={`${formatTokenCount(rollup.generatedTokens)} tok`} />
      {rollup.reasoningTokens > 0 ? (
        <StatRow label="Reasoning" value={`${formatTokenCount(rollup.reasoningTokens)} tok`} />
      ) : null}
      {rollup.cacheWriteTokens > 0 ? (
        <StatRow label="Cache Write" value={`${formatTokenCount(rollup.cacheWriteTokens)} tok`} />
      ) : null}
      <StatRow label="Steps" value={String(rollup.calls)} />
      <StatRow label="Duration" value={formatDuration(rollup.durationMs)} />
      <StatRow label="Cost" value={`$${rollup.costUsd.toFixed(4)}`} />
    </>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
