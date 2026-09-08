import type { SessionEvent } from '@studio/shared';
import { stableEventKey } from '@/entities/session';

export type SpawnStatus = 'running' | 'done' | 'failed';

/** Фаза tool-события, значимая для чипов карточки спавна. */
export type SpawnToolPhase = 'requested' | 'completed' | 'failed';

/** Счётчики одного инструмента в бакете спавна. */
export type SpawnToolStat = {
  requested: number;
  completed: number;
  failed: number;
};

/** Живой чип: имя инструмента и его последняя фаза. */
export type SpawnToolChip = {
  name: string;
  phase: SpawnToolPhase;
};

/** Arrival-метки треда: ключ события → первый замеченный timestamp. */
export type SpawnSeenAt = Record<string, number>;

export type SpawnInfo = {
  spawnId: string;
  agentId: string;
  status: SpawnStatus;
  /** Хвост последнего текст-блока ребёнка или имя последнего tool. */
  lastActivity: string;
  /** Текст задачи из `agent.spawned.taskInput`; отсутствует при пустом вводе. */
  taskText?: string;
  /** Счётчики инструментов бакета по имени. */
  toolStats: Record<string, SpawnToolStat>;
  /** Последние tool-события бакета: имя + фаза. */
  recentTools: SpawnToolChip[];
  /** Шаги: tool requested + assistant text-блоки. */
  steps: number;
  /** Сумма promptTokens + generatedTokens из model.usage бакета. */
  tokens: number;
  /** Хвост последнего text- или reasoning-блока; отсутствует без текста. */
  preview?: string;
  /** Arrival-метка `agent.spawned`; отсутствует без истории меток. */
  spawnedAt?: number;
  /** Arrival-метка последнего события спавна; отсутствует без истории меток. */
  lastSeenAt?: number;
};

export type SpawnGroups = {
  feedEvents: SessionEvent[];
  spawns: SpawnInfo[];
};

type SpawnDraft = {
  info: SpawnInfo;
  deltaId: string | undefined;
  deltaText: string;
  reasoningId: string | undefined;
  reasoningText: string;
};

const LAST_ACTIVITY_MAX = 60;

/** Живые чипы: сколько последних tool-событий несёт карточка. */
const RECENT_TOOLS_MAX = 4;

function isToolPhase(phase: string): phase is SpawnToolPhase {
  return phase === 'requested' || phase === 'completed' || phase === 'failed';
}

function emptyToolStat(): SpawnToolStat {
  return { requested: 0, completed: 0, failed: 0 };
}

/** Arrival-метка события или прежнее значение, когда метки нет. */
function seenOr(
  prev: number | undefined,
  seenAt: SpawnSeenAt | undefined,
  ev: SessionEvent,
): number | undefined {
  if (seenAt === undefined) {
    return prev;
  }
  const key = stableEventKey(ev);
  if (key === undefined) {
    return prev;
  }
  return seenAt[key] ?? prev;
}

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
 * Tool-статистика, шаги и токены считаются по событиям бакета; строки
 * целые, режет только отображение в UI. Arrival-метки (`seenAt` из
 * session store) дают `spawnedAt`/`lastSeenAt`; без них поля отсутствуют.
 */
export function extractSpawns(events: SessionEvent[], seenAt?: SpawnSeenAt): SpawnGroups {
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
        owner.info.lastSeenAt = seenOr(owner.info.lastSeenAt, seenAt, ev);
        if (ev.type === 'text-delta') {
          const continues =
            ev.id !== undefined && ev.id === owner.deltaId && owner.deltaText !== '';
          owner.deltaText = continues ? owner.deltaText + ev.text : ev.text;
          if (!continues) {
            owner.info.steps += 1;
          }
          owner.deltaId = ev.id;
          owner.info.lastActivity = truncateActivity(owner.deltaText);
          owner.info.preview = owner.deltaText;
        } else if (ev.type === 'reasoning-delta') {
          const continues =
            ev.id !== undefined && ev.id === owner.reasoningId && owner.reasoningText !== '';
          owner.reasoningText = continues ? owner.reasoningText + ev.text : ev.text;
          owner.reasoningId = ev.id;
          owner.info.preview = owner.reasoningText;
        } else if (ev.type === 'tool') {
          owner.deltaId = undefined;
          owner.deltaText = '';
          owner.info.lastActivity = ev.name;
          if (isToolPhase(ev.phase)) {
            const stat = owner.info.toolStats[ev.name] ?? emptyToolStat();
            if (ev.phase === 'requested') {
              owner.info.toolStats[ev.name] = { ...stat, requested: stat.requested + 1 };
            } else if (ev.phase === 'completed') {
              owner.info.toolStats[ev.name] = { ...stat, completed: stat.completed + 1 };
            } else {
              owner.info.toolStats[ev.name] = { ...stat, failed: stat.failed + 1 };
            }
            owner.info.recentTools = [
              ...owner.info.recentTools,
              { name: ev.name, phase: ev.phase },
            ].slice(-RECENT_TOOLS_MAX);
            if (ev.phase === 'requested') {
              owner.info.steps += 1;
            }
          }
        } else if (ev.type === 'model.usage') {
          owner.info.tokens += ev.usage.promptTokens + ev.usage.generatedTokens;
        }
      }
      continue;
    }
    if (ev.type === 'agent.spawned') {
      const taskText = spawnTaskText(ev.taskInput);
      const key = stableEventKey(ev);
      const seen = key === undefined ? undefined : seenAt?.[key];
      drafts.set(ev.spawnId, {
        info: {
          spawnId: ev.spawnId,
          agentId: ev.agentId,
          status: 'running',
          lastActivity: '',
          ...(taskText !== undefined ? { taskText } : {}),
          toolStats: {},
          recentTools: [],
          steps: 0,
          tokens: 0,
          ...(seen !== undefined ? { spawnedAt: seen, lastSeenAt: seen } : {}),
        },
        deltaId: undefined,
        deltaText: '',
        reasoningId: undefined,
        reasoningText: '',
      });
      feedEvents.push(ev);
      continue;
    }
    if (ev.type === 'agent.completed' || ev.type === 'agent.failed') {
      const draft = drafts.get(ev.spawnId);
      if (draft) {
        draft.info.status = ev.type === 'agent.completed' ? 'done' : 'failed';
        draft.info.lastSeenAt = seenOr(draft.info.lastSeenAt, seenAt, ev);
      }
      feedEvents.push(ev);
      continue;
    }
    feedEvents.push(ev);
  }

  return { feedEvents, spawns: [...drafts.values()].map((draft) => draft.info) };
}
