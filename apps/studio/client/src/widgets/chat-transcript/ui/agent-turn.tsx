import type { AgentEntry, SystemEntry, TranscriptActivity, TranscriptEntry } from '@studio/shared';
import { isLiveActivity, stepText } from '@studio/shared';
import { AlertCircleIcon } from 'lucide-react';

import { type MessageUsage, usageFromGeneration } from '@/entities/session';
import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import { branchThread } from '@/features/switch-thread';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { Markdown } from '@/shared/ui/markdown';
import { toast } from '@/shared/ui/toast';

import {
  groupSegments,
  segmentKey,
  segmentSpacing,
  type TurnSegment,
} from '../model/turn-segments';
import { ActivityItems } from './activity-items';
import { ActivityRail } from './activity-rail';
import { AskLine } from './ask-line';
import { MessageActions } from './message-actions';
import { ThinkingLine } from './thinking-line';
import { StepStats, TurnStats } from './turn-stats';

export function FailedMessageView({ text }: { text: string }) {
  return (
    <div
      data-testid="error-message-view"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-destructive text-sm"
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 break-words font-mono text-xs leading-relaxed">{text}</div>
    </div>
  );
}

export function SystemMessageView({ entry }: { entry: SystemEntry }) {
  const text = entry.payload.message;
  if (!text) {
    return null;
  }
  if (entry.payload.type === 'error') {
    return <FailedMessageView text={text} />;
  }
  return (
    <div
      data-testid="system-message-view"
      className="rounded-lg border bg-muted/40 px-3.5 py-2.5 text-muted-foreground text-sm"
    >
      <p className="font-mono text-[11px] uppercase tracking-wide">System</p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
    </div>
  );
}

export function ActivityBlock({
  items,
  last,
  streaming = false,
}: {
  items: TranscriptActivity[];
  last: boolean;
  streaming?: boolean;
}) {
  const live = (last && streaming) || isLiveActivity(items);

  if (items.length === 0 && live) {
    return (
      <ActivityRail>
        <ThinkingLine text="" live={true} />
      </ActivityRail>
    );
  }

  return <ActivityItems items={items} live={live} />;
}

export function AssistantMessageView({
  entry,
  entries,
  streaming = false,
}: {
  entry: AgentEntry;
  entries: TranscriptEntry[];
  streaming?: boolean;
}) {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const { workspaceId } = useStudioLocation();
  const { openThread } = useStudioNavigation();
  const detailedStats = useChatPreferences((state) => state.detailedStats);
  const segments = groupSegments(entries);
  const answerText = entries
    .filter((item) => item.type === 'text')
    .map((item) => stepText(item.step))
    .filter(Boolean)
    .join('\n\n');
  const turnUsage = turnUsageFromEntries(entries);
  const generationCount = entries.filter(
    (item) => (item.type === 'text' || item.type === 'reasoning') && item.step.meta?.usage,
  ).length;
  const runId = entry.id;
  const waitingForModel = streaming && entry.status === 'running' && !hasInFlightStep(entry);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {segments.map((segment, index) => (
          <div key={segmentKey(segment, index)} className={segmentSpacing(segments, index)}>
            <TurnSegmentView
              segment={segment}
              live={streaming && index === segments.length - 1 && !waitingForModel}
              detailedStats={detailedStats}
              runId={runId}
            />
          </div>
        ))}
        {waitingForModel ? (
          <div className={segments.length > 0 ? 'mt-3' : undefined}>
            <ActivityRail>
              <ThinkingLine text="" live={true} />
            </ActivityRail>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        {detailedStats && turnUsage ? (
          <TurnStats usage={turnUsage} generations={generationCount} />
        ) : null}
        {answerText ? (
          <MessageActions
            entryId={entry.id}
            onCopy={() => {
              void navigator.clipboard.writeText(answerText);
              toast.add({ title: 'Copied.' });
            }}
            onBranch={() => {
              if (!agent || !thread || !workspaceId) {
                return;
              }
              const nextId = branchThread(entry.id, agent.id, thread.id);
              if (nextId) {
                useDeskStore.getState().setFocusedThreadId(nextId);
                openThread(workspaceId, agent.id, nextId);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function hasInFlightStep(entry: AgentEntry): boolean {
  return (entry.steps ?? []).some(
    (step: any) =>
      step.status === 'pending' ||
      step.status === 'streaming' ||
      step.status === 'awaiting_confirm' ||
      step.status === 'awaiting_input',
  );
}

function TurnSegmentView({
  segment,
  live,
  detailedStats,
  runId,
}: {
  segment: TurnSegment;
  live: boolean;
  detailedStats: boolean;
  runId: string;
}) {
  if (segment.type === 'activity') {
    return (
      <ActivityItems
        items={segment.items}
        live={live}
        detailedStats={detailedStats}
        runId={runId}
      />
    );
  }

  if (segment.type === 'ask') {
    return <AskLine step={segment.entry.step} runId={runId} live={live} />;
  }

  const text = stepText(segment.entry.step);
  const usage = usageFromGeneration(segment.entry.step.meta?.usage);
  return (
    <div className="flex flex-col gap-1">
      {text ? <Markdown text={text} /> : null}
      {detailedStats && usage ? <StepStats usage={usage} /> : null}
    </div>
  );
}

function turnUsageFromEntries(entries: TranscriptEntry[]): MessageUsage | undefined {
  const usages = entries
    .filter((item) => item.type === 'text' || item.type === 'reasoning')
    .map((item) => usageFromGeneration(item.step.meta?.usage))
    .filter((item): item is MessageUsage => item != null);
  if (usages.length === 0) {
    return undefined;
  }
  return usages.reduce<MessageUsage>(
    (sum, item) => ({
      model: sum.model || item.model,
      promptTokens: sum.promptTokens + item.promptTokens,
      generatedTokens: sum.generatedTokens + item.generatedTokens,
      contextTokens: Math.max(sum.contextTokens, item.contextTokens),
      durationMs: sum.durationMs + item.durationMs,
      tools: [...sum.tools, ...item.tools],
      cacheReadTokens: (sum.cacheReadTokens ?? 0) + (item.cacheReadTokens ?? 0),
      cacheWriteTokens: (sum.cacheWriteTokens ?? 0) + (item.cacheWriteTokens ?? 0),
      reasoningTokens: (sum.reasoningTokens ?? 0) + (item.reasoningTokens ?? 0),
      costUsd: (sum.costUsd ?? 0) + (item.costUsd ?? 0),
    }),
    {
      model: '',
      promptTokens: 0,
      generatedTokens: 0,
      contextTokens: 0,
      durationMs: 0,
      tools: [],
    },
  );
}
