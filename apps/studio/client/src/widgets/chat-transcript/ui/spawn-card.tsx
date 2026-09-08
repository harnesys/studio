import { useAgentStore } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { StatusDot } from '@/shared/ui/status-dot';

import type { SpawnInfo, SpawnStatus } from '../model/spawn-groups';

/** Точка-статус: running — пульс на var(--live), done — muted, failed — destructive. */
const DOT_TONE: Record<SpawnStatus, 'live' | 'idle' | 'danger'> = {
  running: 'live',
  done: 'idle',
  failed: 'danger',
};

const SURFACE: Record<SpawnStatus, string> = {
  running: 'bg-[color-mix(in_oklab,var(--live)_7%,transparent)]',
  done: 'bg-muted/25',
  failed: 'bg-destructive/8',
};

const RAIL: Record<SpawnStatus, string> = {
  running: 'bg-live',
  done: 'bg-muted-foreground/35',
  failed: 'bg-destructive',
};

export function SpawnCard({
  spawnId,
  spawn,
  onOpen,
}: {
  /** Тред-владелец спавна; нужен спавн-вью (Task 8), самой карточке не требуется. */
  threadId: string;
  spawnId: string;
  spawn: SpawnInfo;
  onOpen?: (spawnId: string) => void;
}) {
  const agent = useAgentStore((state) => state.byId(spawn.agentId));
  const name = agent?.name ?? spawn.agentId.slice(0, 8);

  const row = (
    <>
      <StatusDot tone={DOT_TONE[spawn.status]} />
      <span className="shrink-0 font-medium" title={name}>
        {name}
      </span>
      {spawn.lastActivity ? (
        <span className="min-w-0 truncate text-muted-foreground">{spawn.lastActivity}</span>
      ) : null}
    </>
  );

  return (
    <div
      data-testid="spawn-card"
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/70',
        SURFACE[spawn.status],
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', RAIL[spawn.status])} />
      {onOpen ? (
        <button
          type="button"
          data-testid={`spawn-row-${spawnId}`}
          onClick={() => onOpen(spawnId)}
          className="flex w-full cursor-pointer items-center gap-2 py-2 pr-3 pl-3.5 text-left text-sm transition-colors hover:bg-muted/40"
        >
          {row}
        </button>
      ) : (
        <div
          data-testid={`spawn-row-${spawnId}`}
          className="flex items-center gap-2 py-2 pr-3 pl-3.5 text-sm"
        >
          {row}
        </div>
      )}
    </div>
  );
}
