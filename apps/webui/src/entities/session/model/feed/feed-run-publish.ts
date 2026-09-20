import type { ChunkDraft, ItemDraft, RunDraft, SegmentDraft } from './feed-run-drafts';
import type { RunFold } from './feed-run-fold';
import type { FeedChunk, FeedItem, FeedRun, FeedSegment, ToolEventPair } from './feed-types';

export function runSnapshot(fold: RunFold): FeedRun[] {
  if (!fold.dirty) {
    return fold.published;
  }
  const current = fold.current ? publishRun(fold.current) : undefined;
  fold.published = current ? [...fold.closed, current] : fold.closed.slice();
  fold.dirty = false;
  return fold.published;
}

export { publishRun };

function publishRun(run: RunDraft): FeedRun {
  const segments: FeedSegment[] = [];
  for (const segment of run.segments) {
    segments.push(publishSegment(segment));
  }
  const first = run.events[0];
  const key =
    run.id ??
    (first?.type === 'user' && first.clientEventId ? first.clientEventId : undefined) ??
    `run-${run.firstIndex}`;
  const published: FeedRun = {
    key,
    id: run.id,
    runId: run.runId,
    error: run.error,
    terminal: run.terminal,
    firstIndex: run.firstIndex,
    events: run.events.slice(),
    segments,
    hasInFlight: run.hasInFlight,
  };
  run.published = published;
  return published;
}

function publishSegment(segment: SegmentDraft): FeedSegment {
  if (segment.kind !== 'activity') {
    segment.published = segment.data;
    return segment.data;
  }
  const items: FeedItem[] = [];
  for (const item of segment.items) {
    items.push(publishItem(item));
  }
  const published: FeedSegment = { key: segment.key, kind: 'activity', items };
  segment.published = published;
  return published;
}

function publishItem(item: ItemDraft): FeedItem {
  const chunks: FeedChunk[] = [];
  let toolsKey: string | undefined;
  for (const chunk of item.chunks) {
    const published = publishChunk(chunk);
    chunks.push(published);
    if (chunk.kind === 'tools' && !toolsKey) {
      toolsKey = chunk.pairs?.[0]?.key;
    }
  }
  if (!item.group) {
    const chunk = chunks[0];
    const published: FeedItem = {
      type: 'chunk',
      key: chunk.key || item.key,
      chunk: chunk as Extract<FeedChunk, { type: 'text' | 'ask' | 'source' | 'file' }>,
    };
    item.published = published;
    return published;
  }
  const published: FeedItem = {
    type: 'group',
    key: toolsKey ?? `group-${item.key || chunks[0]?.key || 'x'}`,
    chunks: chunks as Extract<FeedChunk, { type: 'reasoning' | 'tools' | 'spawn' }>[],
  };
  item.published = published;
  return published;
}

function publishChunk(chunk: ChunkDraft): FeedChunk {
  if (chunk.kind === 'tools') {
    const pairs: ToolEventPair[] = (chunk.pairs ?? []).map((pair) => {
      if (!pair.dirty && pair.published) {
        return pair.published;
      }
      const published: ToolEventPair = {
        call: pair.call,
        ...(pair.result ? { result: pair.result } : {}),
        ...(pair.ask ? { ask: pair.ask } : {}),
      };
      pair.published = published;
      pair.dirty = false;
      return published;
    });
    const published: FeedChunk = {
      key: chunk.pairs?.[0]?.key ?? chunk.key,
      type: 'tools',
      pairs,
    };
    chunk.published = published;
    chunk.dirty = false;
    return published;
  }
  if (chunk.kind === 'reasoning') {
    const published: FeedChunk = {
      key: chunk.key || 'reasoning',
      type: 'reasoning',
      events: chunk.reasoning ?? [],
    };
    chunk.published = published;
    chunk.dirty = false;
    return published;
  }
  const published = {
    key: chunk.key || `${chunk.kind}-x`,
    type: chunk.kind,
    event: chunk.event,
  } as FeedChunk;
  chunk.published = published;
  chunk.dirty = false;
  return published;
}
