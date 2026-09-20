import { FileTextIcon, Link2Icon } from 'lucide-react';
import type { FeedChunk, FeedItem } from '@/entities/session';
import { ActivityLine } from './activity-line';
import { ActivityRail } from './activity-rail';
import { AskLine } from './ask-line';
import { ThinkingLine } from './thinking-line';
import { ToolGroup } from './tool-group';

export function ActivityItems({
  items,
  live,
  threadId,
  onOpenSpawn,
}: {
  items: FeedItem[];
  live: boolean;
  threadId?: string;
  onOpenSpawn?: (id: string) => void;
}) {
  return (
    <ActivityRail live={live}>
      {items.map((item, index) => {
        const itemLive = live && index === items.length - 1;
        if (item.type === 'group') {
          return (
            <ToolGroup
              key={item.key}
              chunks={item.chunks}
              live={itemLive}
              runLive={live}
              threadId={threadId}
              onOpenSpawn={onOpenSpawn}
            />
          );
        }
        return (
          <StandaloneChunk key={item.key} chunk={item.chunk} live={itemLive} threadId={threadId} />
        );
      })}
    </ActivityRail>
  );
}

function StandaloneChunk({
  chunk,
  live,
  threadId,
}: {
  chunk: FeedChunk & { type: 'text' | 'ask' | 'source' | 'file' };
  live: boolean;
  threadId?: string;
}) {
  if (chunk.type === 'text') {
    return <ThinkingLine text={chunk.event.text} live={live} threadId={threadId} />;
  }
  if (chunk.type === 'ask') {
    return <AskLine event={chunk.event} live={live} />;
  }
  if (chunk.type === 'source') {
    const src = chunk.event.source as Record<string, unknown> | undefined;
    const url = typeof src?.url === 'string' ? src.url : String(src ?? '');
    return (
      <ActivityLine key={chunk.key} icon={Link2Icon} label="Source" hint={url} hasContent>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="break-all text-[13px] text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
        >
          {url}
        </a>
      </ActivityLine>
    );
  }
  const fileHint = String((chunk.event as { file?: unknown }).file ?? '');
  return <ActivityLine key={chunk.key} icon={FileTextIcon} label="File" hint={fileHint} />;
}
