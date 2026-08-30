import type { TranscriptActivity } from '@studio/shared';
import { stepText } from '@studio/shared';

import { usageFromGeneration } from '@/entities/journal';

import { chunkActivity } from '../model/tool-run-summary';
import { ActivityRail } from './activity-rail';
import { AskLine } from './ask-line';
import { ThinkingLine } from './thinking-line';
import { ToolRun } from './tool-run';
import { StepStats } from './turn-stats';

export function ActivityItems({
  items,
  live,
  detailedStats = false,
  runId,
}: {
  items: TranscriptActivity[];
  live: boolean;
  detailedStats?: boolean;
  runId?: string;
}) {
  const chunks = chunkActivity(items);

  return (
    <ActivityRail>
      {chunks.map((chunk, index) => {
        const chunkLive = live && index === chunks.length - 1;
        if (chunk.type === 'reasoning') {
          const usage = usageFromGeneration(chunk.item.step.meta?.usage);
          return (
            <div key={chunk.item.step.id} className="flex flex-col gap-0.5">
              <ThinkingLine
                text={stepText(chunk.item.step)}
                live={chunkLive}
                durationMs={usage?.durationMs}
              />
              {detailedStats && usage ? (
                <div className="pl-6">
                  <StepStats usage={usage} />
                </div>
              ) : null}
            </div>
          );
        }
        if (chunk.type === 'ask') {
          return (
            <AskLine
              key={chunk.item.step.id}
              step={chunk.item.step}
              runId={runId ?? ''}
              live={chunkLive}
            />
          );
        }
        return (
          <ToolRun
            key={chunk.items[0]?.call.id ?? `tools-${index}`}
            items={chunk.items}
            live={chunkLive}
            runId={runId}
          />
        );
      })}
    </ActivityRail>
  );
}
