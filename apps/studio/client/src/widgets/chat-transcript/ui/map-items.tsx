import { cn } from '@/shared/lib/utils';
import { StatusDot } from '@/shared/ui/status-dot';

import type { MapInfo, MapItemInfo, MapItemStatus } from '../model/map-groups';
import { useSpawnStream } from '../model/use-spawn-stream';

const DOT_TONE: Record<MapItemStatus, 'live' | 'idle' | 'danger'> = {
  running: 'live',
  done: 'idle',
  failed: 'danger',
};

const STATUS_LABEL: Record<MapItemStatus, string> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
};

function MapItemRow({ threadId, item }: { threadId: string; item: MapItemInfo }) {
  useSpawnStream(threadId, item.workerId, item.status === 'running');
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-md border border-border/50 px-2 py-1.5',
        item.status === 'running' && 'bg-[color-mix(in_oklab,var(--live)_7%,transparent)]',
        item.status === 'failed' && 'bg-destructive/8',
      )}
      data-testid="map-item"
      data-worker-id={item.workerId}
    >
      <span className="flex min-w-0 items-center gap-2 text-[12px]">
        <StatusDot tone={DOT_TONE[item.status]} />
        <span className="shrink-0 font-medium tabular-nums">#{item.index}</span>
        <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[item.status]}</span>
      </span>
      {item.preview ? (
        <span className="line-clamp-2 whitespace-pre-wrap text-[12px] text-muted-foreground leading-5">
          {item.preview}
        </span>
      ) : null}
      {item.status === 'failed' && item.message ? (
        <span className="text-[11px] text-destructive leading-4">{item.message}</span>
      ) : null}
    </div>
  );
}

/** Список воркеров control:map внутри карточки Graph Map. */
export function MapItems({ threadId, map }: { threadId: string; map: MapInfo }) {
  if (map.items.length === 0) {
    return (
      <div className="text-[12px] text-muted-foreground">
        {map.status === 'running'
          ? `Running ${map.count} item${map.count === 1 ? '' : 's'}…`
          : 'No item streams'}
      </div>
    );
  }
  const sorted = [...map.items].sort((a, b) => a.index - b.index);
  return (
    <div className="flex flex-col gap-1" data-testid="map-items">
      <div className="text-[11px] text-muted-foreground">
        {map.concurrency === 'sequential' ? 'Sequential' : 'Parallel'} · {sorted.length}/
        {map.count || sorted.length}
        {map.status !== 'running'
          ? ` · ${map.ok} ok${map.failed > 0 ? ` · ${map.failed} failed` : ''}`
          : ''}
      </div>
      {sorted.map((item) => (
        <MapItemRow key={item.workerId} threadId={threadId} item={item} />
      ))}
    </div>
  );
}
