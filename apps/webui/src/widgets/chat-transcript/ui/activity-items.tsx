import type { SessionEvent } from '@harnesys/studio-shared';
import { FileTextIcon, Link2Icon } from 'lucide-react';
import type { MapInfo } from '../model/map-groups';
import type { SpawnInfo } from '../model/spawn-groups';
import { chunkEvents, groupActivityChunks } from '../model/tool-run-summary';
import { ActivityLine } from './activity-line';
import { ActivityRail } from './activity-rail';
import { AskLine } from './ask-line';
import { ThinkingLine } from './thinking-line';
import { ToolGroup } from './tool-group';
export function ActivityItems({
  events,
  live,
  runId,
  threadId,
  maps,
  spawns,
  onOpenSpawn,
}: {
  events: SessionEvent[];
  live: boolean;
  runId?: string;
  threadId?: string;
  maps?: MapInfo[];
  spawns?: SpawnInfo[];
  onOpenSpawn?: (id: string) => void;
}) {
  const items = groupActivityChunks(chunkEvents(events));
  return (
    <ActivityRail live={live}>
      {items.map((item, index) => {
        const itemLive = live && index === items.length - 1;
        if (item.type === 'group') {
          const firstPair = item.chunks.find((chunk) => chunk.type === 'tools')?.pairs[0];
          return (
            <ToolGroup
              key={firstPair?.call.toolCallId ?? `group-${index}`}
              chunks={item.chunks}
              live={itemLive}
              runLive={live}
              threadId={threadId}
              maps={maps}
              spawns={spawns}
              onOpenSpawn={onOpenSpawn}
            />
          );
        }
        const { chunk } = item;
        if (chunk.type === 'text') {
          const textKey =
            typeof chunk.event.id === 'string'
              ? chunk.event.id
              : `text:${chunk.event.text.slice(0, 48)}`;
          return (
            <ThinkingLine
              key={textKey}
              text={chunk.event.text}
              live={itemLive}
              threadId={threadId}
            />
          );
        }
        if (chunk.type === 'ask') {
          return (
            <AskLine
              key={chunk.event.askId}
              event={chunk.event}
              runId={runId ?? ''}
              live={itemLive}
            />
          );
        }
        if (chunk.type === 'source') {
          const src = chunk.event.source as Record<string, unknown> | undefined;
          const url = typeof src?.url === 'string' ? src.url : String(src ?? '');
          return (
            <ActivityLine
              key={`source:${url}`}
              icon={Link2Icon}
              label="Source"
              hint={url}
              hasContent
            >
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
        const fileHint = String(
          (
            chunk.event as {
              file?: unknown;
            }
          ).file ?? '',
        );
        return (
          <ActivityLine key={`file:${fileHint}`} icon={FileTextIcon} label="File" hint={fileHint} />
        );
      })}
    </ActivityRail>
  );
}
