import { WrenchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GroupFeedChunk } from '@/entities/session';
import { useFeedSpawns } from '@/entities/session';
import { ACTIVITY_COLLAPSE_MIN } from '@/shared/config/constants';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { summarizeActivity } from '../model/tool-run-summary';
import type { ActivityBadge } from './activity-line';
import { ActivityLine } from './activity-line';
import { SpawnLine } from './spawn-line';
import { ThinkingLine } from './thinking-line';
import { ToolLine } from './tool-line';

const HINT_PARTS = 3;
export function ToolGroup({
  chunks,
  live,
  runLive = live,
  threadId,
  onOpenSpawn,
}: {
  chunks: GroupFeedChunk[];
  live: boolean;
  runLive?: boolean;
  threadId?: string;
  onOpenSpawn?: (spawnId: string) => void;
}) {
  const feedDetail = useChatPreferences((state) => state.feedDetail);
  const collapse = feedDetail === 'quiet' && !runLive && chunks.length >= ACTIVITY_COLLAPSE_MIN;
  if (!collapse) {
    return (
      <div className="flex flex-col gap-1">
        {chunks.map((chunk, index) =>
          renderChunk({
            chunk,
            live: live && index === chunks.length - 1,
            runLive,
            threadId,
            onOpenSpawn,
          }),
        )}
      </div>
    );
  }
  return (
    <CollapsedGroup
      chunks={chunks}
      threadId={threadId}
      renderChunk={renderChunk}
      runLive={runLive}
      onOpenSpawn={onOpenSpawn}
    />
  );
}

function CollapsedGroup({
  chunks,
  threadId,
  runLive,
  onOpenSpawn,
  renderChunk,
}: {
  chunks: GroupFeedChunk[];
  threadId?: string;
  runLive: boolean;
  onOpenSpawn?: (spawnId: string) => void;
  renderChunk: (args: {
    chunk: GroupFeedChunk;
    live: boolean;
    runLive?: boolean;
    threadId?: string;
    onOpenSpawn?: (spawnId: string) => void;
  }) => ReactNode;
}) {
  const spawns = useFeedSpawns(threadId ?? null);
  const summary = summarizeActivity(chunks, spawns);
  const lastPart = summary.last
    ? `last: ${[summary.last.title, summary.last.hint].filter(Boolean).join(' · ')}`
    : null;
  const shownParts = lastPart
    ? [...summary.parts.slice(0, HINT_PARTS), lastPart]
    : summary.parts.slice(0, HINT_PARTS);
  const hint = shownParts.length > 0 ? shownParts.join(' · ') : null;
  const extra = summary.parts.length > HINT_PARTS ? ` +${summary.parts.length - HINT_PARTS}` : null;
  const badges: ActivityBadge[] =
    summary.failed > 0 ? [{ text: `${summary.failed} failed`, tone: 'destructive' }] : [];
  return (
    <ActivityLine
      icon={WrenchIcon}
      label={summary.label}
      hint={hint ? `${hint}${extra ?? ''}` : null}
      badges={badges}
      defaultOpen={false}
      hasContent
      indentContent={false}
    >
      <div className="flex flex-col gap-1 pr-1">
        {chunks.map((chunk) => renderChunk({ chunk, live: false, runLive, threadId, onOpenSpawn }))}
      </div>
    </ActivityLine>
  );
}

function renderChunk({
  chunk,
  live,
  runLive,
  threadId,
  onOpenSpawn,
}: {
  chunk: GroupFeedChunk;
  live: boolean;
  runLive?: boolean;
  threadId?: string;
  onOpenSpawn?: (spawnId: string) => void;
}): ReactNode {
  if (chunk.type === 'reasoning') {
    const text = chunk.events.map((e) => e.text).join('');
    return <ThinkingLine key={chunk.key} text={text} live={live} threadId={threadId} />;
  }
  if (chunk.type === 'spawn') {
    return (
      <SpawnLine
        key={chunk.key}
        threadId={threadId ?? ''}
        spawnId={chunk.event.spawnId}
        live={live}
        onOpen={onOpenSpawn}
      />
    );
  }
  return chunk.pairs.map((pair) => (
    <ToolLine
      key={pair.call.toolCallId}
      pair={pair}
      live={live && pair === chunk.pairs.at(-1)}
      runLive={runLive}
      threadId={threadId}
    />
  ));
}
