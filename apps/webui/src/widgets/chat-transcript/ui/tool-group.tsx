import { WrenchIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { ACTIVITY_COLLAPSE_MIN } from '@/shared/config/constants';
import { useChatPreferences } from '@/shared/lib/chat-preferences';

import type { MapInfo } from '../model/map-groups';
import type { SpawnInfo } from '../model/spawn-groups';
import type { GroupActivityChunk } from '../model/tool-run-summary';
import { summarizeActivity } from '../model/tool-run-summary';
import type { ActivityBadge } from './activity-line';
import { ActivityLine } from './activity-line';
import { SpawnLine } from './spawn-line';
import { ThinkingLine } from './thinking-line';
import { ToolLine } from './tool-line';

const HINT_PARTS = 3;

/**
 * Свернувшаяся группа активности между текстом агента: тулы, мысли и спавны.
 * Свёрнутый заголовок — сводка по типам со счётчиком ошибок; живой ран
 * или режим Full показывают плоский список без сворачивания.
 */
export function ToolGroup({
  chunks,
  live,
  runLive = live,
  threadId,
  maps,
  spawns,
  onOpenSpawn,
}: {
  chunks: GroupActivityChunk[];
  live: boolean;
  runLive?: boolean;
  threadId?: string;
  maps?: MapInfo[];
  spawns?: SpawnInfo[];
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
            index,
            live: live && index === chunks.length - 1,
            runLive,
            threadId,
            maps,
            spawns,
            onOpenSpawn,
          }),
        )}
      </div>
    );
  }

  const spawnsById = new Map((spawns ?? []).map((item) => [item.spawnId, item]));
  const summary = summarizeActivity(chunks, spawnsById);
  const hint = summary.parts.slice(0, HINT_PARTS).join(' · ');
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
        {chunks.map((chunk, index) =>
          renderChunk({
            chunk,
            index,
            live: false,
            runLive,
            threadId,
            maps,
            spawns,
            onOpenSpawn,
          }),
        )}
      </div>
    </ActivityLine>
  );
}

function renderChunk({
  chunk,
  index,
  live,
  runLive,
  threadId,
  maps,
  spawns,
  onOpenSpawn,
}: {
  chunk: GroupActivityChunk;
  index: number;
  live: boolean;
  runLive?: boolean;
  threadId?: string;
  maps?: MapInfo[];
  spawns?: SpawnInfo[];
  onOpenSpawn?: (spawnId: string) => void;
}): ReactNode {
  if (chunk.type === 'reasoning') {
    const text = chunk.events.map((e) => e.text).join('');
    return <ThinkingLine key={`reasoning-${index}`} text={text} live={live} threadId={threadId} />;
  }
  if (chunk.type === 'spawn') {
    const spawn = spawns?.find((item) => item.spawnId === chunk.event.spawnId);
    if (!spawn) {
      return null;
    }
    return (
      <SpawnLine
        key={chunk.event.spawnId}
        threadId={threadId ?? ''}
        spawnId={chunk.event.spawnId}
        spawn={spawn}
        live={live}
        onOpen={onOpenSpawn}
      />
    );
  }
  return chunk.pairs.map((pair, pairIndex) => (
    <ToolLine
      key={pair.call.toolCallId}
      pair={pair}
      live={live && pairIndex === chunk.pairs.length - 1}
      runLive={runLive}
      threadId={threadId}
      maps={maps}
    />
  ));
}
