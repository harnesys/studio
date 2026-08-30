import type { SessionEvent } from '@studio/shared';

import { chunkEvents } from '../model/tool-run-summary';
import { ActivityRail } from './activity-rail';
import { AskLine } from './ask-line';
import { ThinkingLine } from './thinking-line';
import { ToolRun } from './tool-run';

export function ActivityItems({
  events,
  live,
  detailedStats = false,
  runId,
}: {
  events: SessionEvent[];
  live: boolean;
  detailedStats?: boolean;
  runId?: string;
}) {
  const chunks = chunkEvents(events);

  return (
    <ActivityRail>
      {chunks.map((chunk, index) => {
        const chunkLive = live && index === chunks.length - 1;
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
