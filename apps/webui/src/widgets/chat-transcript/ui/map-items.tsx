import { BotIcon } from 'lucide-react';
import type { MapInfo, MapItemInfo } from '../model/map-groups';
import { useSpawnStream } from '../model/use-spawn-stream';
import { type ActivityBadge, ActivityLine } from './activity-line';

function MapItemRow({ threadId, item }: { threadId: string; item: MapItemInfo }) {
  useSpawnStream(threadId, item.workerId, item.status === 'running');
  const badges: ActivityBadge[] =
    item.status === 'failed' ? [{ text: 'failed', tone: 'destructive' }] : [];
  return (
    <ActivityLine
      icon={BotIcon}
      label={`#${item.index + 1}`}
      hint={item.preview ?? null}
      badges={badges}
      active={item.status === 'running'}
      failed={item.status === 'failed'}
      defaultOpen={item.status === 'failed'}
      hasContent={Boolean(item.message)}
    >
      {item.message ? (
        <div className="whitespace-pre-wrap text-[13px] text-destructive/90 leading-5">
          {item.message}
        </div>
      ) : null}
    </ActivityLine>
  );
}
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
  return (
    <div className="flex flex-col gap-1" data-testid="map-items">
      {[...map.items]
        .sort((a, b) => a.index - b.index)
        .map((item) => (
          <MapItemRow key={item.workerId} threadId={threadId} item={item} />
        ))}
    </div>
  );
}
