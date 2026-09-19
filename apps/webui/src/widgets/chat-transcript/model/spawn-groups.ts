import type { SessionEvent } from '@harnesys/studio-shared';
import { stableEventKey } from '@/entities/session';
export type SpawnStatus = 'running' | 'done' | 'failed';
export type SpawnToolPhase = 'requested' | 'completed' | 'failed';
export type SpawnToolStat = {
  requested: number;
  completed: number;
  failed: number;
};
export type SpawnToolChip = {
  name: string;
  phase: SpawnToolPhase;
};
export type SpawnSeenAt = Record<string, number>;
export type SpawnInfo = {
  spawnId: string;
  agentId: string;
  status: SpawnStatus;
  lastActivity: string;
  taskText?: string;
  toolStats: Record<string, SpawnToolStat>;
  recentTools: SpawnToolChip[];
  steps: number;
  tokens: number;
  preview?: string;
  spawnedAt?: number;
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
const RECENT_TOOLS_MAX = 4;
function isToolPhase(phase: string): phase is SpawnToolPhase {
  return phase === 'requested' || phase === 'completed' || phase === 'failed';
}
function emptyToolStat(): SpawnToolStat {
  return { requested: 0, completed: 0, failed: 0 };
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
        const content = (
          first as {
            content?: unknown;
          }
        ).content;
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
export function spawnSubtreeIds(events: SessionEvent[], spawnId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const ev of events) {
    if (ev.type !== 'agent.spawned' || ev.runId === undefined) {
      continue;
    }
    const children = childrenOf.get(ev.runId);
    if (children) {
      children.push(ev.spawnId);
    } else {
      childrenOf.set(ev.runId, [ev.spawnId]);
    }
  }
  const subtree = new Set<string>();
  const walk = (id: string): void => {
    for (const child of childrenOf.get(id) ?? []) {
      if (subtree.has(child)) {
        continue;
      }
      subtree.add(child);
      walk(child);
    }
  };
  walk(spawnId);
  return subtree;
}
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
