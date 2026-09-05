import type { SessionEvent } from '@studio/shared';
import { FileTextIcon, Link2Icon } from 'lucide-react';

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
}: {
  events: SessionEvent[];
  live: boolean;
  runId?: string;
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
            />
          );
        }
        const { chunk } = item;
        if (chunk.type === 'text') {
          return <ThinkingLine key={`text-${index}`} text={chunk.event.text} live={itemLive} />;
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
              key={`source-${index}`}
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
        return (
          <ActivityLine
            key={`file-${index}`}
            icon={FileTextIcon}
            label="File"
            hint={String((chunk.event as { file?: unknown }).file ?? '')}
          />
        );
      })}
    </ActivityRail>
  );
}
