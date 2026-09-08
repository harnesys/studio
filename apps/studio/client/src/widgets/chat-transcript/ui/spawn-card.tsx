import { useAgentStore } from '@/entities/agent';
import { formatDuration, formatTokenCount } from '@/entities/session';
import { cn } from '@/shared/lib/utils';
import { StatusDot } from '@/shared/ui/status-dot';

import type { SpawnInfo, SpawnStatus, SpawnToolPhase } from '../model/spawn-groups';
import { useNow } from '../model/use-now';
import { useSpawnStream } from '../model/use-spawn-stream';

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

const STATUS_LABEL: Record<SpawnStatus, string> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
};

const TOOL_DOT: Record<SpawnToolPhase, string> = {
  requested: 'bg-live/60',
  completed: 'bg-muted-foreground/50',
  failed: 'bg-destructive',
};

/** running без событий дольше — карточка показывает «нет активности Ns». */
const STALLED_AFTER_MS = 90_000;

const LIVE_TICK_MS = 1000;

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}

export function SpawnCard({
  threadId,
  spawnId,
  spawn,
  onOpen,
}: {
  /** Тред-владелец спавна: ключ подписки на стрим дочернего запуска. */
  threadId: string;
  spawnId: string;
  spawn: SpawnInfo;
  onOpen?: (spawnId: string) => void;
}) {
  useSpawnStream(threadId, spawnId, spawn.status === 'running');
  const agent = useAgentStore((state) => state.byId(spawn.agentId));
  const name = agent?.name ?? spawn.agentId.slice(0, 8);
  const now = useNow(spawn.status === 'running' ? LIVE_TICK_MS : 0);

  const elapsed =
    spawn.spawnedAt !== undefined ? formatDuration(Math.max(0, now - spawn.spawnedAt)) : undefined;
  const idleMs =
    spawn.status === 'running' && spawn.lastSeenAt !== undefined
      ? now - spawn.lastSeenAt
      : undefined;
  const stalled = idleMs !== undefined && idleMs > STALLED_AFTER_MS;
  const snippet = spawn.preview ?? (spawn.lastActivity ? spawn.lastActivity : undefined);

  const meta: string[] = [];
  if (elapsed !== undefined) {
    meta.push(elapsed);
  }
  if (spawn.status !== 'running') {
    meta.push(STATUS_LABEL[spawn.status]);
  }
  if (spawn.steps > 0) {
    meta.push(`${spawn.steps} ${plural(spawn.steps, 'шаг', 'шага', 'шагов')}`);
  }
  if (spawn.tokens > 0) {
    meta.push(
      `${formatTokenCount(spawn.tokens)} ${plural(spawn.tokens, 'токен', 'токена', 'токенов')}`,
    );
  }

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <StatusDot tone={DOT_TONE[spawn.status]} />
        <span className="shrink-0 font-medium" title={name}>
          {name}
        </span>
        {meta.length > 0 ? (
          <span className="min-w-0 truncate text-muted-foreground text-xs">{meta.join(' · ')}</span>
        ) : null}
      </span>
      {spawn.taskText ? (
        <span className="line-clamp-2 whitespace-pre-wrap text-[13px] text-muted-foreground leading-5">
          {spawn.taskText}
        </span>
      ) : null}
      {spawn.recentTools.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {spawn.recentTools.map((tool, index) => (
            <span
              key={`${tool.name}-${tool.phase}-${index}`}
              title={`${tool.name} · ${tool.phase}`}
              className="inline-flex max-w-40 items-center gap-1 rounded border border-border/70 px-1 py-px text-[11px] text-muted-foreground"
            >
              <span className={cn('size-1 shrink-0 rounded-full', TOOL_DOT[tool.phase])} />
              <span className="truncate">{tool.name}</span>
            </span>
          ))}
        </span>
      ) : null}
      {snippet ? <span className="truncate text-xs">{snippet}</span> : null}
      {stalled ? (
        <span className="text-[11px] text-muted-foreground">
          {`нет активности ${Math.floor((idleMs ?? 0) / 1000)}s`}
        </span>
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
          className="flex w-full cursor-pointer flex-col gap-1 py-2 pr-3 pl-3.5 text-left text-sm transition-colors hover:bg-muted/40"
        >
          {body}
        </button>
      ) : (
        <div
          data-testid={`spawn-row-${spawnId}`}
          className="flex flex-col gap-1 py-2 pr-3 pl-3.5 text-sm"
        >
          {body}
        </div>
      )}
    </div>
  );
}
