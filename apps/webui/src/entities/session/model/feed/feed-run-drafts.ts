import type { SessionEvent } from '@harnesys/studio-shared';
import type {
  FeedChunk,
  FeedItem,
  FeedRun,
  FeedRunTerminal,
  FeedSegment,
  ToolAskEvent,
  ToolCallDone,
  ToolCallOpen,
  ToolEventPair,
} from './feed-types';

export type ReasoningEvent = SessionEvent & { type: 'reasoning-delta' };
export type TextDeltaEvent = SessionEvent & { type: 'text-delta' };
export type AskEvent = ToolAskEvent;

export type ChunkDraft = {
  kind: 'reasoning' | 'tools' | 'text' | 'ask' | 'source' | 'file' | 'spawn';
  key: string;
  event?: SessionEvent;
  reasoning?: ReasoningEvent[];
  pairs?: PairDraft[];
  dirty: boolean;
  published: FeedChunk | null;
};
export type ItemDraft = {
  group: boolean;
  key: string;
  chunks: ChunkDraft[];
  dirty: boolean;
  published: FeedItem | null;
};
export type PairDraft = {
  key: string;
  call: ToolCallOpen;
  result?: ToolCallDone;
  ask?: AskEvent;
  dirty: boolean;
  published: ToolEventPair | null;
};
export type SegmentDraft = {
  kind: 'user' | 'text' | 'compaction' | 'handoff' | 'activity';
  key: string;
  data: FeedSegment;
  items: ItemDraft[];
  reasoningBuffer: ReasoningEvent[];
  toolsBuffer: PairDraft[];
  groupChunks: ChunkDraft[];
  askByCall: Map<string, AskEvent>;
  askItemByCall: Map<string, ItemDraft>;
  chunkOrdinal: number;
  itemOrdinal: number;
  eventCount: number;
  dirty: boolean;
  published: FeedSegment | null;
};
export type RunDraft = {
  id: string | null;
  runId: string | undefined;
  error: string | null;
  terminal: FeedRunTerminal | null;
  firstIndex: number;
  events: SessionEvent[];
  segments: SegmentDraft[];
  segmentOrdinal: number;
  pairs: Map<string, PairDraft>;
  hasInFlight: boolean;
  published: FeedRun | null;
};
