import type { SessionEvent } from '@harnesys/studio-shared';
import type {
  AskEvent,
  ChunkDraft,
  ItemDraft,
  PairDraft,
  ReasoningEvent,
  RunDraft,
  SegmentDraft,
} from './feed-run-drafts';
import type { ToolCallDone, ToolCallOpen } from './feed-types';

export function activityProcess(run: RunDraft, ev: SessionEvent): void {
  let activity = lastActivity(run);
  if (!activity) {
    activity = createActivity(run);
  }
  activity.eventCount += 1;
  if (ev.type === 'reasoning-delta') {
    flushTools(activity);
    const chunk = lastBufferChunk(activity, () => ({
      kind: 'reasoning',
      key: `reasoning-${activity.chunkOrdinal}`,
      reasoning: [],
      dirty: true,
      published: null,
    }));
    activity.chunkOrdinal += 1;
    chunk.reasoning?.push(ev as ReasoningEvent);
    chunk.dirty = true;
    return;
  }
  if (ev.type === 'reasoning-start' || ev.type === 'reasoning-end') {
    return;
  }
  if (ev.type === 'ask') {
    run.hasInFlight = true;
    askProcess(run, activity, ev as AskEvent);
    return;
  }
  if (ev.type === 'source' || ev.type === 'file') {
    flushTools(activity);
    flushReasoning(activity);
    flushGroup(activity);
    const hint =
      ev.type === 'source'
        ? String((ev.source as Record<string, unknown> | undefined)?.url ?? ev.source ?? '')
        : String(ev.file ?? '');
    activity.items.push({
      group: false,
      key: `${ev.type}-${hint || activity.itemOrdinal}`,
      chunks: [{ kind: ev.type, key: '', event: ev, dirty: true, published: null }],
      dirty: true,
      published: null,
    });
    activity.itemOrdinal += 1;
    activity.dirty = true;
    return;
  }
  if (ev.type === 'agent.spawned') {
    flushTools(activity);
    flushReasoning(activity);
    const group = openGroup(activity);
    group.chunks.push({
      kind: 'spawn',
      key: `spawn-${ev.spawnId}`,
      event: ev as SessionEvent & { type: 'agent.spawned' },
      dirty: true,
      published: null,
    });
    group.dirty = true;
    return;
  }
  if (ev.type === 'tool') {
    flushReasoning(activity);
    const group = openGroup(activity);
    const last = group.chunks[group.chunks.length - 1];
    let chunk = last as ChunkDraft & { kind: 'tools' };
    if (last?.kind !== 'tools') {
      chunk = { kind: 'tools', key: '', pairs: [], dirty: true, published: null };
      group.chunks.push(chunk);
      group.dirty = true;
    }
    chunk.dirty = true;
    toolProcess(run, activity, ev, chunk);
  }
}

function askProcess(run: RunDraft, activity: SegmentDraft, ev: AskEvent): void {
  const callId = askToolCallId(ev);
  if (callId && run.pairs.has(callId)) {
    flushReasoning(activity);
    const pair = run.pairs.get(callId);
    if (pair && !pair.ask) {
      pair.ask = ev;
      pair.dirty = true;
    }
    return;
  }
  flushTools(activity);
  flushReasoning(activity);
  flushGroup(activity);
  const chunk: ChunkDraft = {
    kind: 'ask',
    key: `ask-${ev.askId ?? activity.itemOrdinal}`,
    event: ev,
    dirty: true,
    published: null,
  };
  const item: ItemDraft = {
    group: false,
    key: chunk.key,
    chunks: [chunk],
    dirty: true,
    published: null,
  };
  activity.items.push(item);
  if (callId) {
    activity.askByCall.set(callId, ev);
    activity.askItemByCall.set(callId, item);
  }
  activity.itemOrdinal += 1;
  activity.dirty = true;
}

function toolProcess(
  run: RunDraft,
  activity: SegmentDraft,
  ev: SessionEvent & { type: 'tool' },
  chunk: ChunkDraft & { kind: 'tools' },
): void {
  const pairs = chunk.pairs ?? [];
  if (pairs.length === 0) {
    chunk.pairs = pairs;
  }
  const existing = run.pairs.get(ev.toolCallId);
  if (ev.phase === 'requested') {
    const askEvent = activity.askByCall.get(ev.toolCallId);
    const askItem = activity.askItemByCall.get(ev.toolCallId);
    if (askEvent && askItem) {
      removeItem(activity, askItem);
      activity.askByCall.delete(ev.toolCallId);
      activity.askItemByCall.delete(ev.toolCallId);
    }
    const pair: PairDraft = {
      key: ev.toolCallId,
      call: ev as ToolCallOpen,
      result: existing?.result,
      ask: askEvent ?? existing?.ask,
      dirty: true,
      published: null,
    };
    run.pairs.set(ev.toolCallId, pair);
    replacePair(pairs, existing, pair);
    run.hasInFlight = true;
    return;
  }
  if (ev.phase === 'streaming') {
    if (existing) {
      existing.call = {
        ...existing.call,
        name: ev.name || existing.call.name,
        delta: ((existing.call.delta ?? '') + (ev.delta ?? '')).trim(),
      };
      existing.dirty = true;
      return;
    }
    const pair: PairDraft = {
      key: ev.toolCallId,
      call: ev as ToolCallOpen,
      dirty: true,
      published: null,
    };
    run.pairs.set(ev.toolCallId, pair);
    pairs.push(pair);
    run.hasInFlight = true;
    return;
  }
  if (existing) {
    existing.result = ev as ToolCallDone;
    existing.dirty = true;
    return;
  }
  const pair: PairDraft = {
    key: ev.toolCallId,
    call: {
      type: 'tool',
      phase: 'requested',
      toolCallId: ev.toolCallId,
      name: ev.name,
      input: ev.input,
    } as ToolCallOpen,
    result: ev as ToolCallDone,
    dirty: true,
    published: null,
  };
  run.pairs.set(ev.toolCallId, pair);
  pairs.push(pair);
}

function askToolCallId(event: SessionEvent): string | null {
  if (event.type !== 'ask') {
    return null;
  }
  const tool = (event as AskEvent).tool;
  if (tool && typeof tool.toolCallId === 'string' && tool.toolCallId) {
    return tool.toolCallId;
  }
  const askId = (event as AskEvent).askId;
  if (typeof askId === 'string' && askId.startsWith('ask/') && askId.length > 4) {
    return askId.slice(4);
  }
  return null;
}

function replacePair(pairs: PairDraft[], existing: PairDraft | undefined, pair: PairDraft): void {
  if (existing) {
    const index = pairs.indexOf(existing);
    if (index !== -1) {
      pairs[index] = pair;
      return;
    }
  }
  pairs.push(pair);
}

function openGroup(activity: SegmentDraft): ItemDraft {
  const last = activity.items[activity.items.length - 1];
  if (last?.group) {
    return last;
  }
  const item: ItemDraft = { group: true, key: '', chunks: [], dirty: true, published: null };
  activity.items.push(item);
  activity.dirty = true;
  return item;
}

function lastBufferChunk(activity: SegmentDraft, create: () => ChunkDraft): ChunkDraft {
  const group = openGroup(activity);
  const last = group.chunks[group.chunks.length - 1];
  if (last && last.kind === 'reasoning') {
    return last;
  }
  const created = create();
  group.chunks.push(created);
  group.dirty = true;
  return created;
}

function removeItem(activity: SegmentDraft, item: ItemDraft): void {
  const index = activity.items.indexOf(item);
  if (index !== -1) {
    activity.items.splice(index, 1);
    activity.dirty = true;
  }
}

function flushReasoning(activity: SegmentDraft): void {
  if (activity.reasoningBuffer.length === 0) {
    return;
  }
  const group = openGroup(activity);
  group.chunks.push({
    kind: 'reasoning',
    key: '',
    reasoning: activity.reasoningBuffer,
    dirty: true,
    published: null,
  });
  group.dirty = true;
  activity.reasoningBuffer = [];
}

function flushTools(activity: SegmentDraft): void {
  if (activity.toolsBuffer.length === 0) {
    return;
  }
  const group = openGroup(activity);
  group.chunks.push({
    kind: 'tools',
    key: '',
    pairs: activity.toolsBuffer,
    dirty: true,
    published: null,
  });
  group.dirty = true;
  activity.toolsBuffer = [];
}

function flushGroup(activity: SegmentDraft): void {
  if (activity.groupChunks.length === 0) {
    return;
  }
  const item: ItemDraft = {
    group: true,
    key: '',
    chunks: activity.groupChunks,
    dirty: true,
    published: null,
  };
  activity.items.push(item);
  activity.groupChunks = [];
}

function createActivity(run: RunDraft): SegmentDraft {
  const activity: SegmentDraft = {
    kind: 'activity',
    key: `s${run.segmentOrdinal}`,
    data: { key: `s${run.segmentOrdinal}`, kind: 'activity', items: [] },
    items: [],
    reasoningBuffer: [],
    toolsBuffer: [],
    groupChunks: [],
    askByCall: new Map(),
    askItemByCall: new Map(),
    chunkOrdinal: 0,
    itemOrdinal: 0,
    eventCount: 0,
    dirty: true,
    published: null,
  };
  run.segmentOrdinal += 1;
  run.segments.push(activity);
  return activity;
}

function lastActivity(run: RunDraft): SegmentDraft | undefined {
  const last = run.segments[run.segments.length - 1];
  return last && last.kind === 'activity' ? last : undefined;
}

export function flushActivity(run: RunDraft): void {
  const activity = lastActivity(run);
  if (!activity) {
    return;
  }
  flushTools(activity);
  flushReasoning(activity);
  flushGroup(activity);
  activity.dirty = true;
}
