import type { SessionEvent } from '@studio/shared';

export type SpawnStatus = 'running' | 'done' | 'failed';

export type SpawnInfo = {
  spawnId: string;
  agentId: string;
  status: SpawnStatus;
  /** Хвост последнего текст-блока ребёнка или имя последнего tool. */
  lastActivity: string;
  /** Текст задачи из `agent.spawned.taskInput`; отсутствует при пустом вводе. */
  taskText?: string;
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

/**
 * Выводит текст задачи спавна из `agent.spawned.taskInput`: строка — как
 * есть; объект с `messages` — content первого сообщения; иначе компактный
 * JSON. Пустой результат — `undefined`, поле в `SpawnInfo` отсутствует.
 * Без усечений: режет только отображение в UI, данные целы в журнале.
 */
export function spawnTaskText(input: unknown): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input === 'string') {
    return input ? input : undefined;
  }
  if (typeof input === 'object') {
    const msgs = (input as Record<string, unknown>).messages;
    if (Array.isArray(msgs) && msgs.length > 0) {
      const first = msgs[0];
      if (first && typeof first === 'object') {
        const content = (first as { content?: unknown }).content;
        if (typeof content === 'string') {
          return content ? content : undefined;
        }
      }
    }
  }
  try {
    const json = JSON.stringify(input);
    return json ? json : undefined;
  } catch {
    return undefined;
  }
}

function truncateActivity(text: string): string {
  if (text.length <= LAST_ACTIVITY_MAX) {
    return text;
  }
  return Array.from(text).slice(0, LAST_ACTIVITY_MAX).join('');
}

/**
 * Разделяет журнал треда на ленту родителя и карточки спавнов.
 * `agent.spawned` остаётся в ленте — по нему `groupSegments` строит
 * spawn-сегмент. События с `runId ∈ spawnIds` (внуков включительно —
 * их `agent.spawned` проходит через журнал родителя) в ленту не
 * попадают независимо от наличия карточки: карточка есть только у
 * прямых детей, активность внуков отрисовывает спавн-вью ребёнка.
 * У прямых детей последний текст-блок или tool идёт в `lastActivity`.
 * Статус — running, пока не пришёл `agent.completed`/`agent.failed`.
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
    if (ev.runId !== undefined && spawnIds.has(ev.runId)) {
      const owner = drafts.get(ev.runId);
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
      }
      continue;
    }
    if (ev.type === 'agent.spawned') {
      const taskText = spawnTaskText(ev.taskInput);
      drafts.set(ev.spawnId, {
        info: {
          spawnId: ev.spawnId,
          agentId: ev.agentId,
          status: 'running',
          lastActivity: '',
          ...(taskText !== undefined ? { taskText } : {}),
        },
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
