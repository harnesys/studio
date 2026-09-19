import type { SessionEvent } from '@harnesys/studio-shared';
import { useEffect, useState } from 'react';
import { agentColorClass, useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { refreshThread, useDeskStore, useThreadEvents } from '@/features/desk';
import type { IdeTab } from '@/features/ide';
import { useOpenSpawnTab } from '@/features/ide';
import { cn } from '@/shared/lib/utils';
import { StatusDot } from '@/shared/ui/status-dot';
import { agentFallbackName } from '../model/agent-label';
import { splitRuns } from '../model/run-groups';
import type { SpawnStatus } from '../model/spawn-groups';
import { extractSpawns, spawnSubtreeIds, spawnTaskText } from '../model/spawn-groups';
import { useSpawnStream } from '../model/use-spawn-stream';
import { RunTurn } from './run-turn';

const DOT_TONE: Record<SpawnStatus, 'live' | 'idle' | 'danger'> = {
  running: 'live',
  done: 'idle',
  failed: 'danger',
};
const STATUS_LABEL: Record<SpawnStatus, string> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
};
const TASK_COLLAPSE_AT = 500;
export function SpawnView({
  tab,
  threadId,
  spawnId,
}: {
  tab: IdeTab;
  threadId: string;
  spawnId: string;
}) {
  const events = useThreadEvents(threadId);
  const seenAt = useSessionStore((state) => state.seenAt[threadId]);
  const hasEvents = events.length > 0;
  const deskReady = useDeskStore((state) => state.hydrated[tab.workspaceId] === 'ready');
  const openSpawnTab = useOpenSpawnTab();
  const { spawns } = extractSpawns(events, seenAt);
  const spawn = spawns.find((item) => item.spawnId === spawnId);
  const agent = useAgentStore((state) => (spawn ? state.byId(spawn.agentId) : undefined));
  const subtreeIds = spawnSubtreeIds(events, spawnId);
  const spawnedEvent = events.find(
    (
      ev,
    ): ev is SessionEvent & {
      type: 'agent.spawned';
    } => ev.type === 'agent.spawned' && ev.spawnId === spawnId,
  );
  const spawnedTask = spawnedEvent ? spawnTaskText(spawnedEvent.taskInput) : undefined;
  const [taskExpanded, setTaskExpanded] = useState(false);
  const taskCollapsed =
    spawnedTask !== undefined && Array.from(spawnedTask).length > TASK_COLLAPSE_AT && !taskExpanded;
  useEffect(() => {
    if (hasEvents || !deskReady) {
      return;
    }
    void refreshThread(threadId).catch(() => {});
  }, [hasEvents, deskReady, threadId]);
  const running = spawn?.status === 'running';
  useSpawnStream(threadId, spawnId, running);
  if (!spawn) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
        data-testid="ide-spawn-loading"
      >
        {hasEvents ? 'Spawn not found' : 'Loading…'}
      </div>
    );
  }
  const onOpenSpawn = (sid: string) => {
    const target = spawns.find((item) => item.spawnId === sid);
    openSpawnTab(tab.workspaceId, target?.agentId ?? '', threadId, sid);
  };
  const childEvents = events.filter(
    (ev) => ev.runId !== undefined && (ev.runId === spawnId || subtreeIds.has(ev.runId)),
  );
  const runs = splitRuns(childEvents);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-spawn">
      <div className="flex h-9 shrink-0 items-center gap-2 border-border/60 border-b px-3">
        <StatusDot tone={DOT_TONE[spawn.status]} />
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', agentColorClass(agent?.color ?? null))}
        />
        <span
          className="truncate font-medium text-[12px] text-foreground leading-none"
          title={spawn.agentId}
        >
          {agent?.name ?? agentFallbackName(spawn.agentId)}
        </span>
        <span className="text-[11px] text-muted-foreground leading-none">
          {STATUS_LABEL[spawn.status]}
        </span>
      </div>
      {spawnedTask ? (
        <div className="shrink-0 border-border/60 border-b px-3 py-2" data-testid="ide-spawn-task">
          <div className="mx-auto w-full max-w-3xl">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Task</div>
            <div className="whitespace-pre-wrap text-[12px] text-foreground leading-5">
              {taskCollapsed
                ? Array.from(spawnedTask).slice(0, TASK_COLLAPSE_AT).join('')
                : spawnedTask}
            </div>
            {Array.from(spawnedTask).length > TASK_COLLAPSE_AT ? (
              <button
                type="button"
                onClick={() => setTaskExpanded((open) => !open)}
                className="mt-1 cursor-pointer text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {taskExpanded ? 'Show less' : 'Show full task'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
          {runs.map((run, index) => (
            <RunTurn
              key={run.runId ?? `run-${index}`}
              events={run.events}
              runId={run.runId ?? spawnId}
              streaming={running && index === runs.length - 1}
              error={run.error}
              threadId={threadId}
              spawns={spawns}
              onOpenSpawn={onOpenSpawn}
              readOnly
            />
          ))}
        </div>
      </div>
    </div>
  );
}
