import type { SessionEvent } from '@studio/shared';
import { useEffect, useMemo, useState } from 'react';
import { useAgentStore } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { refreshThread, useDeskStore, useThreadEvents } from '@/features/desk';
import type { IdeTab } from '@/features/ide';
import { useOpenSpawnTab } from '@/features/ide';
import { StatusDot } from '@/shared/ui/status-dot';

import { splitRuns } from '../model/run-groups';
import type { SpawnStatus } from '../model/spawn-groups';
import { extractSpawns, spawnTaskText } from '../model/spawn-groups';
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

/**
 * Read-only IDE tab for one spawn of a thread. Events come from the parent
 * thread's journal: extractSpawns separates them from the parent feed, and
 * any runId in the spawn-id set (the spawn itself and nested spawns) is
 * rendered here — nested spawns show as SpawnCards and open their own
 * spawn tabs. No composer, no HitlPrompt, no MessageActions, no retry.
 */
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
  const hydratedWorkspaceId = useDeskStore((state) => state.hydratedWorkspaceId);
  const openSpawnTab = useOpenSpawnTab();

  const { spawns } = useMemo(() => extractSpawns(events, seenAt), [events, seenAt]);
  const spawn = spawns.find((item) => item.spawnId === spawnId);
  const agent = useAgentStore((state) =>
    spawn ? (state.byId(spawn.agentId) ?? undefined) : undefined,
  );
  const spawnIds = useMemo(() => new Set(spawns.map((item) => item.spawnId)), [spawns]);
  const spawnedTask = useMemo(() => {
    const found = events.find(
      (ev): ev is SessionEvent & { type: 'agent.spawned' } =>
        ev.type === 'agent.spawned' && ev.spawnId === spawnId,
    );
    return found ? spawnTaskText(found.taskInput) : undefined;
  }, [events, spawnId]);
  const [taskExpanded, setTaskExpanded] = useState(false);
  const taskCollapsed =
    spawnedTask !== undefined && Array.from(spawnedTask).length > TASK_COLLAPSE_AT && !taskExpanded;

  // A restored spawn tab has no URL and the parent thread's journal loads
  // only when that thread's panel mounts — fetch it here once if missing.
  useEffect(() => {
    if (hasEvents || hydratedWorkspaceId !== tab.workspaceId) {
      return;
    }
    void refreshThread(threadId).catch(() => {});
  }, [hasEvents, hydratedWorkspaceId, tab.workspaceId, threadId]);

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
    (ev) => ev.runId !== undefined && (ev.runId === spawnId || spawnIds.has(ev.runId)),
  );
  const runs = splitRuns(childEvents);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-spawn">
      <div className="flex h-9 shrink-0 items-center gap-2 border-border/60 border-b px-3">
        <StatusDot tone={DOT_TONE[spawn.status]} />
        <span
          className="truncate font-medium text-[12px] text-foreground leading-none"
          title={spawn.agentId}
        >
          {agent?.name ?? spawn.agentId.slice(0, 8)}
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
