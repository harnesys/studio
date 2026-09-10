import type {
  KnowledgeIndexStatus as IndexRunStatus,
  KnowledgeIndexState,
  KnowledgeStats,
} from '@harnesys/studio-shared';
import { RefreshCwIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';

type KnowledgeIndexStatusProps = {
  state: KnowledgeIndexState | undefined;
  stats: KnowledgeStats | undefined;
  disabled?: boolean;
  reindexPending?: boolean;
  cancelPending?: boolean;
  onReindex: () => void;
  onCancel: () => void;
};

export function KnowledgeIndexStatus({
  state,
  stats,
  disabled,
  reindexPending,
  cancelPending,
  onReindex,
  onCancel,
}: KnowledgeIndexStatusProps) {
  const status = state?.status ?? 'idle';
  const running = status === 'running';
  const processed = state?.processed ?? 0;
  const total = state?.total ?? 0;
  let progress = 100;
  if (total > 0) {
    progress = Math.min(100, Math.round((processed / total) * 100));
  } else if (running) {
    progress = 0;
  }
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const elapsed = formatElapsed(state?.startedAt, state?.finishedAt, running, now);
  const isSlowVector = running && elapsed && elapsed.rawMs > 20_000 && total > 0;

  return (
    <Card size="sm" data-testid="knowledge-index-status">
      <CardHeader>
        <div className="flex items-center gap-2">
          <StatusDot tone={statusTone(status)} label={status} />
          <CardTitle className="capitalize">{status}</CardTitle>
        </div>
        <CardAction>
          {running ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={disabled || cancelPending}
              onClick={onCancel}
            >
              <XIcon />
              Cancel
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={disabled || reindexPending}
              onClick={onReindex}
            >
              <RefreshCwIcon />
              Reindex all
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span>
            {processed}/{total} processed
          </span>
          {stats ? (
            <Badge
              variant={running ? 'outline' : 'secondary'}
              title={running ? 'Старый индекс — будет пересобран' : undefined}
            >
              {running ? `old: ${stats.chunkCount} chunks` : `${stats.chunkCount} chunks`}
            </Badge>
          ) : null}
          {state?.phase ? <span className="font-mono">{state.phase}</span> : null}
          {elapsed ? <span>{elapsed.label}</span> : null}
        </div>
        <Progress value={progress} className="w-full" />
        {running && state?.currentUri ? (
          <p className="truncate font-mono text-xs">
            indexing: <span className="font-medium">{state.currentUri}</span>
          </p>
        ) : null}
        {isSlowVector ? (
          <p className="text-amber-600 text-xs leading-snug">
            Vector indexing runs locally via Ollama. First batch loads the model (~20s cold start),
            subsequent batches are faster (keep_alive=10m). High CPU is expected. Large files are
            split into many chunks (e.g. 1200 chars / 150 overlap) — consider adding the file to
            .harnesysignore or using FTS backend. If &gt;2m without progress, check server logs with
            SERVER_TRACE.
          </p>
        ) : null}
        {state?.lastError ? (
          <p className="break-all text-destructive text-xs leading-snug">{state.lastError}</p>
        ) : null}
        {!running && state?.finishedAt && state?.startedAt ? (
          <p className="text-muted-foreground text-xs">
            finished {new Date(state.finishedAt).toLocaleTimeString()} · started{' '}
            {new Date(state.startedAt).toLocaleTimeString()}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function statusTone(status: IndexRunStatus): StatusDotTone {
  if (status === 'running') {
    return 'live';
  }
  if (status === 'error') {
    return 'danger';
  }
  return 'idle';
}

function formatElapsed(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
  running: boolean,
  now?: number,
): { label: string; rawMs: number } | null {
  if (!startedAt) {
    return null;
  }
  const start = new Date(startedAt).getTime();
  let end: number;
  if (running) {
    end = now ?? Date.now();
  } else if (finishedAt) {
    end = new Date(finishedAt).getTime();
  } else {
    end = now ?? Date.now();
  }
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  const ms = Math.max(0, end - start);
  if (ms < 1000) {
    return { label: `${ms}ms`, rawMs: ms };
  }
  const s = Math.floor(ms / 1000);
  if (s < 60) {
    return { label: `${s}s`, rawMs: ms };
  }
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return { label: `${m}m ${rs}s`, rawMs: ms };
}
