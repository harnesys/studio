import type { SessionEvent } from '@harnesys/studio-shared';
import { stableEventKey } from '@/entities/session';

import type { SpawnSeenAt } from './spawn-groups';

export type MapItemStatus = 'running' | 'done' | 'failed';

export type MapItemInfo = {
  index: number;
  workerId: string;
  status: MapItemStatus;
  /** Хвост последнего text/reasoning воркера. */
  preview?: string;
  code?: string;
  message?: string;
  startedAt?: number;
  lastSeenAt?: number;
};

export type MapInfo = {
  nodeId: string;
  /** Parent run that owns map.started / map.completed. */
  parentRunId?: string;
  /** map toolCallId paired by order within the parent run. */
  toolCallId?: string;
  count: number;
  concurrency?: string;
  status: MapItemStatus;
  ok: number;
  failed: number;
  timedOut?: boolean;
  items: MapItemInfo[];
  startedAt?: number;
  completedAt?: number;
};

export type MapGroups = {
  feedEvents: SessionEvent[];
  maps: MapInfo[];
};

type MapDraft = {
  info: MapInfo;
  itemsByWorker: Map<string, MapItemInfo>;
};

type ItemDraft = {
  info: MapItemInfo;
  deltaId: string | undefined;
  deltaText: string;
  reasoningId: string | undefined;
  reasoningText: string;
};

const PREVIEW_MAX = 120;

function truncate(text: string): string {
  if (text.length <= PREVIEW_MAX) {
    return text;
  }
  return `${Array.from(text).slice(0, PREVIEW_MAX).join('')}…`;
}

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

function isMapStructural(ev: SessionEvent): ev is SessionEvent & {
  type:
    | 'map.started'
    | 'map.item.started'
    | 'map.item.completed'
    | 'map.item.failed'
    | 'map.completed';
} {
  return (
    ev.type === 'map.started' ||
    ev.type === 'map.item.started' ||
    ev.type === 'map.item.completed' ||
    ev.type === 'map.item.failed' ||
    ev.type === 'map.completed'
  );
}

function pairToolCallIds(events: SessionEvent[], maps: MapInfo[]): void {
  const pendingByRun = new Map<string, string[]>();
  for (const ev of events) {
    if (ev.type !== 'tool' || ev.name !== 'map' || ev.phase !== 'completed') {
      continue;
    }
    if (ev.runId === undefined || !ev.toolCallId) {
      continue;
    }
    const queue = pendingByRun.get(ev.runId);
    if (queue) {
      queue.push(ev.toolCallId);
    } else {
      pendingByRun.set(ev.runId, [ev.toolCallId]);
    }
  }
  for (const map of maps) {
    if (!map.parentRunId) {
      continue;
    }
    const queue = pendingByRun.get(map.parentRunId);
    const toolCallId = queue?.shift();
    if (toolCallId) {
      map.toolCallId = toolCallId;
    }
  }
}

type LegacyAttachArgs = {
  events: SessionEvent[];
  maps: MapInfo[];
  knownWorkers: Set<string>;
  spawnIds: Set<string>;
  seenAt: SpawnSeenAt | undefined;
};

/**
 * Legacy journals (no map.item.started): orphan runIds between map.started
 * and map.completed belong to that map. Spawn ids are excluded by caller.
 */
function attachLegacyWorkers(args: LegacyAttachArgs): void {
  const { events, maps, knownWorkers, spawnIds, seenAt } = args;
  if (maps.length === 0) {
    return;
  }
  let mapIndex = -1;
  const open = new Map<number, MapInfo>();
  for (const ev of events) {
    if (ev.type === 'map.started') {
      mapIndex += 1;
      const map = maps[mapIndex];
      if (map && map.items.length === 0) {
        open.set(mapIndex, map);
      }
      continue;
    }
    if (ev.type === 'map.completed') {
      open.delete(mapIndex);
      continue;
    }
    if (ev.runId === undefined || knownWorkers.has(ev.runId) || spawnIds.has(ev.runId)) {
      continue;
    }
    if (open.size === 0) {
      continue;
    }
    const map = [...open.values()].at(-1);
    if (!map || (map.parentRunId && ev.runId === map.parentRunId)) {
      continue;
    }
    if (map.items.some((item) => item.workerId === ev.runId)) {
      continue;
    }
    const index = map.items.length;
    map.items.push({
      index,
      workerId: ev.runId,
      status: map.status === 'running' ? 'running' : 'done',
      startedAt: seenOr(undefined, seenAt, ev),
      lastSeenAt: seenOr(undefined, seenAt, ev),
    });
    knownWorkers.add(ev.runId);
  }
}

/**
 * Вынимает события map-воркеров из ленты родителя (как extractSpawns).
 * Связь: map.item.started.workerId; для старых журналов — orphan runId
 * в окне map.started…map.completed.
 */
export function extractMaps(
  events: SessionEvent[],
  seenAt?: SpawnSeenAt,
  opts?: { spawnIds?: Iterable<string> },
): MapGroups {
  const spawnIds = new Set(opts?.spawnIds ?? []);
  const drafts: MapDraft[] = [];
  let current: MapDraft | undefined;
  const workerIds = new Set<string>();
  const itemDrafts = new Map<string, ItemDraft>();

  for (const ev of events) {
    if (ev.type === 'map.started') {
      const info: MapInfo = {
        nodeId: ev.nodeId,
        parentRunId: ev.runId,
        count: ev.count,
        concurrency: ev.concurrency,
        status: 'running',
        ok: 0,
        failed: 0,
        items: [],
        startedAt: seenOr(undefined, seenAt, ev),
      };
      current = { info, itemsByWorker: new Map() };
      drafts.push(current);
      continue;
    }
    if (ev.type === 'map.item.started' && current) {
      const item: MapItemInfo = {
        index: ev.index,
        workerId: ev.workerId,
        status: 'running',
        startedAt: seenOr(undefined, seenAt, ev),
        lastSeenAt: seenOr(undefined, seenAt, ev),
      };
      current.itemsByWorker.set(ev.workerId, item);
      current.info.items.push(item);
      workerIds.add(ev.workerId);
      itemDrafts.set(ev.workerId, {
        info: item,
        deltaId: undefined,
        deltaText: '',
        reasoningId: undefined,
        reasoningText: '',
      });
      continue;
    }
    if ((ev.type === 'map.item.completed' || ev.type === 'map.item.failed') && current) {
      const item = current.itemsByWorker.get(ev.workerId);
      if (item) {
        item.status = ev.type === 'map.item.completed' ? 'done' : 'failed';
        item.lastSeenAt = seenOr(item.lastSeenAt, seenAt, ev);
        if (ev.type === 'map.item.failed') {
          item.code = ev.code;
          item.message = ev.message;
        }
      }
      continue;
    }
    if (ev.type === 'map.completed' && current) {
      current.info.status = ev.failed > 0 ? 'failed' : 'done';
      current.info.ok = ev.ok;
      current.info.failed = ev.failed;
      current.info.timedOut = ev.timedOut;
      current.info.completedAt = seenOr(undefined, seenAt, ev);
      for (const item of current.info.items) {
        if (item.status === 'running') {
          item.status = 'done';
        }
      }
      current = undefined;
    }
  }

  const maps = drafts.map((d) => {
    d.info.items.sort((a, b) => a.index - b.index);
    return d.info;
  });

  attachLegacyWorkers({ events, maps, knownWorkers: workerIds, spawnIds, seenAt });
  pairToolCallIds(events, maps);

  for (const map of maps) {
    for (const item of map.items) {
      if (!itemDrafts.has(item.workerId)) {
        itemDrafts.set(item.workerId, {
          info: item,
          deltaId: undefined,
          deltaText: '',
          reasoningId: undefined,
          reasoningText: '',
        });
      }
    }
  }

  const feedEvents: SessionEvent[] = [];
  for (const ev of events) {
    if (isMapStructural(ev)) {
      continue;
    }
    if (ev.runId !== undefined && workerIds.has(ev.runId)) {
      const draft = itemDrafts.get(ev.runId);
      if (!draft) {
        continue;
      }
      draft.info.lastSeenAt = seenOr(draft.info.lastSeenAt, seenAt, ev);
      if (ev.type === 'text-delta') {
        const continues = ev.id !== undefined && ev.id === draft.deltaId && draft.deltaText !== '';
        draft.deltaText = continues ? draft.deltaText + ev.text : ev.text;
        draft.deltaId = ev.id;
        draft.info.preview = truncate(draft.deltaText);
      } else if (ev.type === 'reasoning-delta') {
        const continues =
          ev.id !== undefined && ev.id === draft.reasoningId && draft.reasoningText !== '';
        draft.reasoningText = continues ? draft.reasoningText + ev.text : ev.text;
        draft.reasoningId = ev.id;
        if (!draft.info.preview) {
          draft.info.preview = truncate(draft.reasoningText);
        }
      } else if (ev.type === 'done') {
        draft.info.status = draft.info.status === 'failed' ? 'failed' : 'done';
        if (typeof ev.text === 'string' && ev.text) {
          draft.info.preview = truncate(ev.text);
        }
      } else if (ev.type === 'error') {
        draft.info.status = 'failed';
        draft.info.message = ev.message;
        draft.info.code = ev.code;
      }
      continue;
    }
    feedEvents.push(ev);
  }

  return { feedEvents, maps };
}

export function mapForToolCall(maps: MapInfo[], toolCallId: string): MapInfo | undefined {
  return maps.find((map) => map.toolCallId === toolCallId);
}

export function mapLineHint(map: MapInfo): string {
  const done = map.items.filter((item) => item.status !== 'running').length;
  const mode = map.concurrency === 'sequential' ? 'sequential' : 'parallel';
  return `${mode} · ${done}/${map.count || map.items.length}`;
}
