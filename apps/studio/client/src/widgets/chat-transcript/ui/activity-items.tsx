import type { SessionEvent } from '@studio/shared';

import { chunkEvents } from '../model/tool-run-summary';
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
    <ActivityRail>
      {chunks.map((chunk, index) => {
        const chunkLive = live && index === chunks.length - 1;
        if (chunk.type === 'reasoning') {
          const text = chunk.events.map((e) => e.text).join('');
          return (
            <div key={`reasoning-${index}`} className="flex flex-col gap-0.5">
              <ThinkingLine text={text} live={chunkLive} />
            </div>
          );
        }
        if (chunk.type === 'text') {
          return (
            <div key={`text-${index}`} className="flex flex-col gap-0.5">
              <ThinkingLine text={chunk.event.text} live={chunkLive} />
            </div>
          );
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
            <div key={`source-${index}`} className="text-muted-foreground text-xs">
              <a href={url} target="_blank" rel="noreferrer" className="underline">
                {url}
              </a>
            </div>
          );
        }
        if (chunk.type === 'file') {
          return (
            <div key={`file-${index}`} className="text-muted-foreground text-xs">
              file
            </div>
          );
        }
        return (
          <ToolRun
            key={chunk.pairs[0]?.call.toolCallId ?? `tools-${index}`}
            pairs={chunk.pairs}
            live={chunkLive}
            runId={runId}
          />
        );
      })}
    </ActivityRail>
  );
}
