import { WrenchIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useChatPreferences } from '@/shared/lib/chat-preferences';

import type { MapInfo } from '../model/map-groups';
import type { GroupActivityChunk } from '../model/tool-run-summary';
import { groupPairs, summarizeToolRun } from '../model/tool-run-summary';
import type { ActivityBadge } from './activity-line';
import { ActivityLine } from './activity-line';
import { ThinkingLine } from './thinking-line';
import { ToolLine } from './tool-line';

const TOOL_GROUP_MIN = 2;
const HINT_PARTS = 3;

/**
 * Свернувшаяся группа активности между текстом агента: тулы и мысли.
 * Свёрнутый заголовок — перечень тулов со счётчиком ошибок; живой ран
 * или expandTools показывают плоский список без сворачивания.
 */
export function ToolGroup({
  chunks,
  live,
  runLive = live,
  threadId,
  maps,
}: {
  chunks: GroupActivityChunk[];
  live: boolean;
  runLive?: boolean;
  threadId?: string;
  maps?: MapInfo[];
}) {
  const expandTools = useChatPreferences((state) => state.expandTools);
  const pairs = groupPairs(chunks);
  const collapse = !runLive && !expandTools && pairs.length >= TOOL_GROUP_MIN;

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
          }),
        )}
      </div>
    );
  }

  const summary = summarizeToolRun(pairs);
  const hint = summary.parts.slice(0, HINT_PARTS).join(' · ');
  const extra = summary.parts.length > HINT_PARTS ? ` +${summary.parts.length - HINT_PARTS}` : null;
  const badges: ActivityBadge[] =
    summary.failed > 0 ? [{ text: `${summary.failed} failed`, tone: 'destructive' }] : [];

  return (
    <ActivityLine
      icon={WrenchIcon}
      label={`${summary.total} tools`}
      hint={hint ? `${hint}${extra ?? ''}` : null}
      badges={badges}
      defaultOpen={false}
      hasContent
      indentContent={false}
    >
      <div className="flex flex-col gap-1 pr-1">
        {chunks.map((chunk, index) =>
          renderChunk({ chunk, index, live: false, runLive, threadId, maps }),
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
}: {
  chunk: GroupActivityChunk;
  index: number;
  live: boolean;
  runLive?: boolean;
  threadId?: string;
  maps?: MapInfo[];
}): ReactNode {
  if (chunk.type === 'reasoning') {
    const text = chunk.events.map((e) => e.text).join('');
    return <ThinkingLine key={`reasoning-${index}`} text={text} live={live} threadId={threadId} />;
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
