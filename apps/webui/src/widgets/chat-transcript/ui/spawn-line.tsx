import { BotIcon, WrenchIcon } from 'lucide-react';
import { useAgentStore } from '@/entities/agent';
import { formatDuration, formatTokenCount } from '@/entities/session';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { Button } from '@/shared/ui/button';
import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import { agentFallbackName } from '../model/agent-label';
import type { SpawnInfo, SpawnToolStat } from '../model/spawn-groups';
import { useNow } from '../model/use-now';
import { useSpawnStream } from '../model/use-spawn-stream';
import { type ActivityBadge, ActivityLine } from './activity-line';

const LIVE_TICK_MS = 5000;
const STALLED_AFTER_MS = 90000;
export function SpawnLine({
  threadId,
  spawnId,
  spawn,
  live,
  onOpen,
}: {
  threadId: string;
  spawnId: string;
  spawn: SpawnInfo;
  live: boolean;
  onOpen?: (spawnId: string) => void;
}) {
  useSpawnStream(threadId, spawnId, spawn.status === 'running');
  const feedDetail = useChatPreferences((state) => state.feedDetail);
  const agent = useAgentStore((state) => state.byId(spawn.agentId));
  const name = agent?.name ?? agentFallbackName(spawn.agentId);
  const running = spawn.status === 'running';
  const now = useNow(running ? LIVE_TICK_MS : 0);
  const elapsed =
    running && spawn.spawnedAt !== undefined
      ? formatDuration(Math.max(0, now - spawn.spawnedAt))
      : undefined;
  const stalledMs = running && spawn.lastSeenAt !== undefined ? now - spawn.lastSeenAt : undefined;
  const badges: ActivityBadge[] = [];
  if (running) {
    if (elapsed !== undefined) {
      badges.push({ text: elapsed, tone: 'live' });
    }
    if (stalledMs !== undefined && stalledMs > STALLED_AFTER_MS) {
      badges.push({ text: `idle ${Math.floor(stalledMs / 1000)}s`, tone: 'live' });
    }
  } else {
    if (spawn.steps > 0) {
      badges.push({ text: `${spawn.steps} steps` });
    }
    if (spawn.tokens > 0) {
      badges.push({ text: `${formatTokenCount(spawn.tokens)} tok` });
    }
  }
  const failed = spawn.status === 'failed';
  if (failed) {
    badges.unshift({ text: 'failed', tone: 'destructive' });
  }
  const toolEntries = Object.entries(spawn.toolStats).filter(
    ([, stat]) => stat.requested + stat.completed + stat.failed > 0,
  );
  return (
    <ActivityLine
      icon={BotIcon}
      label={name}
      hint={spawn.taskText ?? spawn.preview ?? null}
      badges={badges}
      active={running}
      failed={failed}
      defaultOpen={live || feedDetail === 'full'}
      hasContent={toolEntries.length > 0 || Boolean(spawn.preview)}
      tail={
        onOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 shrink-0 px-1.5 font-mono text-[11px] text-muted-foreground/50 transition-colors hover:text-foreground"
            title="Open agent tab"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(spawnId);
            }}
          >
            <span>open</span>
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-1">
        {toolEntries.map(([toolName, stat]) => (
          <ActivityLine
            key={toolName}
            icon={WrenchIcon}
            label={toolName}
            hint={formatToolStat(stat)}
            failed={stat.failed > 0}
          />
        ))}
        {spawn.preview ? (
          <ExpandableScroll>
            <div className="whitespace-pre-wrap text-[13px] text-muted-foreground/90 leading-5">
              {spawn.preview}
            </div>
          </ExpandableScroll>
        ) : null}
      </div>
    </ActivityLine>
  );
}
function formatToolStat(stat: SpawnToolStat): string {
  const parts: string[] = [];
  if (stat.completed > 0) {
    parts.push(`${stat.completed} ok`);
  }
  if (stat.failed > 0) {
    parts.push(`${stat.failed} failed`);
  }
  if (stat.requested > stat.completed + stat.failed) {
    parts.push('running');
  }
  return parts.join(' · ');
}
