import type { SessionEvent, SessionEventType } from '@harnesys/studio-shared';

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

export type MapItemStatus = 'running' | 'done' | 'failed';
export type MapItemInfo = {
  index: number;
  workerId: string;
  status: MapItemStatus;
  preview?: string;
  code?: string;
  message?: string;
  startedAt?: number;
  lastSeenAt?: number;
};
export type MapInfo = {
  nodeId: string;
  parentRunId?: string;
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

export type CompactionSegmentMeta = {
  id: string;
  reason: 'threshold' | 'manual';
  coveredFrom: number;
  coveredUntil: number;
  tokensBefore: number;
  tokensAfter: number;
};

export type ToolCallEvent = SessionEvent & {
  type: 'tool';
};
export type ToolCallOpen = ToolCallEvent & {
  phase: 'requested' | 'streaming';
};
export type ToolCallDone = ToolCallEvent & {
  phase: 'completed' | 'failed';
};
export type ToolAskEvent = SessionEvent & {
  type: 'ask';
};
export type ToolEventPair = {
  call: ToolCallOpen;
  result?: ToolCallDone;
  ask?: ToolAskEvent;
};

export type FeedChunk =
  | {
      key: string;
      type: 'reasoning';
      events: (SessionEvent & {
        type: 'reasoning-delta';
      })[];
    }
  | {
      key: string;
      type: 'text';
      event: SessionEvent & {
        type: 'text-delta';
      };
    }
  | {
      key: string;
      type: 'ask';
      event: SessionEvent & {
        type: 'ask';
      };
    }
  | {
      key: string;
      type: 'tools';
      pairs: ToolEventPair[];
    }
  | {
      key: string;
      type: 'source';
      event: SessionEvent & {
        type: 'source';
      };
    }
  | {
      key: string;
      type: 'file';
      event: SessionEvent & {
        type: 'file';
      };
    }
  | {
      key: string;
      type: 'spawn';
      event: SessionEvent & {
        type: 'agent.spawned';
      };
    };
export type GroupFeedChunk = Extract<FeedChunk, { type: 'reasoning' | 'tools' | 'spawn' }>;
export type FeedItem =
  | {
      type: 'group';
      key: string;
      chunks: GroupFeedChunk[];
    }
  | {
      type: 'chunk';
      key: string;
      chunk: Extract<
        FeedChunk,
        {
          type: 'text' | 'ask' | 'source' | 'file';
        }
      >;
    };

export type FeedSegment =
  | {
      key: string;
      kind: 'user';
      event: SessionEvent & {
        type: 'user';
      };
    }
  | {
      key: string;
      kind: 'text';
      id: string | undefined;
      text: string;
    }
  | {
      key: string;
      kind: 'compaction';
      text: string;
      meta: CompactionSegmentMeta;
    }
  | {
      key: string;
      kind: 'handoff';
      agentId: string;
      seq: number | undefined;
    }
  | {
      key: string;
      kind: 'activity';
      items: FeedItem[];
    };

export type FeedRunTerminal = 'done' | 'error' | 'run.completed' | 'run.failed' | 'run.cancelled';

export type FeedRun = {
  key: string;
  id: string | null;
  runId: string | undefined;
  error: string | null;
  terminal: FeedRunTerminal | null;
  firstIndex: number;
  events: SessionEvent[];
  segments: FeedSegment[];
  hasInFlight: boolean;
};

export type ThreadFeed = {
  runs: FeedRun[];
  spawns: SpawnInfo[];
  maps: MapInfo[];
};

export type ThreadFeeds = {
  inherited: ThreadFeed;
  own: ThreadFeed;
};

export type FeedDecision = {
  ev: SessionEvent;
  merged: boolean;
  index: number;
  replaces?: boolean;
};

export const RUN_TERMINAL_EVENT_TYPES = new Set<SessionEventType>([
  'done',
  'error',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);
