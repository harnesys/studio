import type { SessionEvent } from '@studio/shared';
import { FileTextIcon, Link2Icon } from 'lucide-react';

import { chunkEvents } from '../model/tool-run-summary';
import { ActivityLine } from './activity-line';
import { ActivityRail } from './activity-rail';
import { AskLine } from './ask-line';
import { ThinkingLine } from './thinking-line';
import { ToolRun } from './tool-run';

export function ActivityItems({
  events,
  live,
  runId,
}: {
  events: SessionEvent[];
  live: boolean;
  runId?: string;
}) {
  const chunks = chunkEvents(events);

  return (
    <ActivityRail live={live}>
      {chunks.map((chunk, index) => {
        const chunkLive = live && index === chunks.length - 1;
        if (chunk.type === 'reasoning') {
          const text = chunk.events.map((e) => e.text).join('');
          return <ThinkingLine key={`reasoning-${index}`} text={text} live={chunkLive} />;
        }
        if (chunk.type === 'text') {
          return <ThinkingLine key={`text-${index}`} text={chunk.event.text} live={chunkLive} />;
        }
        if (chunk.type === 'ask') {
          return (
            <AskLine
              key={chunk.event.askId}
              event={chunk.event}
              runId={runId ?? ''}
              live={chunkLive}
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
        if (chunk.type === 'file') {
          return (
            <ActivityLine
              key={`file-${index}`}
              icon={FileTextIcon}
              label="File"
              hint={String((chunk.event as { file?: unknown }).file ?? '')}
            />
          );
        }
        return (
          <ToolRun
            key={chunk.pairs[0]?.call.toolCallId ?? `tools-${index}`}
            pairs={chunk.pairs}
            live={chunkLive}
            runLive={live}
          />
        );
      })}
    </ActivityRail>
  );
}
