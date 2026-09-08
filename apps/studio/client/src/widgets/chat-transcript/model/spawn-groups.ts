import type { SessionEvent } from '@studio/shared';

export type SpawnStatus = 'running' | 'done' | 'failed';

export type SpawnInfo = {
  spawnId: string;
  agentId: string;
  status: SpawnStatus;
  /** Хвост последнего текст-блока ребёнка или имя последнего tool. */
  lastActivity: string;
};

export type SpawnGroups = {
  feedEvents: SessionEvent[];
  spawns: SpawnInfo[];
};

type SpawnDraft = {
  info: SpawnInfo;
  deltaId: string | undefined;
  deltaText: string;
};

const LAST_ACTIVITY_MAX = 60;

function truncateActivity(text: string): string {
  return text.length > LAST_ACTIVITY_MAX ? text.slice(0, LAST_ACTIVITY_MAX) : text;
}

/**
 * Разделяет журнал треда на ленту родителя и карточки спавнов.
 * `agent.spawned` остаётся в ленте — по нему `groupSegments` строит
 * spawn-сегмент; события детей (`runId = spawnId`) в ленту не попадают,
 * их последний текст-блок или tool идёт в `lastActivity`. Статус —
 * running, пока не пришёл `agent.completed`/`agent.failed`.
 */
export function extractSpawns(events: SessionEvent[]): SpawnGroups {
  const spawnIds = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'agent.spawned') {
      spawnIds.add(ev.spawnId);
    }
  }
  if (spawnIds.size === 0) {
    return { feedEvents: events, spawns: [] };
  }

  const drafts = new Map<string, SpawnDraft>();
  const feedEvents: SessionEvent[] = [];

  for (const ev of events) {
    const owner = ev.runId !== undefined ? drafts.get(ev.runId) : undefined;
    if (owner) {
      if (ev.type === 'text-delta') {
        owner.deltaText =
          ev.id !== undefined && ev.id === owner.deltaId ? owner.deltaText + ev.text : ev.text;
        owner.deltaId = ev.id;
        owner.info.lastActivity = truncateActivity(owner.deltaText);
      } else if (ev.type === 'tool') {
        owner.deltaId = undefined;
        owner.deltaText = '';
        owner.info.lastActivity = ev.name;
      }
      continue;
    }
    if (ev.type === 'agent.spawned') {
      drafts.set(ev.spawnId, {
        info: { spawnId: ev.spawnId, agentId: ev.agentId, status: 'running', lastActivity: '' },
        deltaId: undefined,
        deltaText: '',
      });
      feedEvents.push(ev);
      continue;
    }
    if (ev.type === 'agent.completed' || ev.type === 'agent.failed') {
      const draft = drafts.get(ev.spawnId);
      if (draft) {
        draft.info.status = ev.type === 'agent.completed' ? 'done' : 'failed';
      }
      feedEvents.push(ev);
      continue;
    }
    feedEvents.push(ev);
  }

  return { feedEvents, spawns: [...drafts.values()].map((draft) => draft.info) };
}
