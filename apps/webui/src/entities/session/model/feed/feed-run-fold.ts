import type { SessionEvent } from '@harnesys/studio-shared';
import { activityProcess, flushActivity } from './feed-run-activity';
import type { RunDraft, TextDeltaEvent } from './feed-run-drafts';
import { publishRun, runSnapshot } from './feed-run-publish';
import type { FeedRun, FeedRunTerminal, FeedSegment } from './feed-types';
import { RUN_TERMINAL_EVENT_TYPES } from './feed-types';

export type RunFold = {
  closed: FeedRun[];
  current: RunDraft | undefined;
  dirty: boolean;
  published: FeedRun[];
};

export function createRunFold(): RunFold {
  return { closed: [], current: undefined, dirty: false, published: [] };
}

export function runProcess(fold: RunFold, ev: SessionEvent, index: number): void {
  if (RUN_TERMINAL_EVENT_TYPES.has(ev.type)) {
    const failed =
      (ev.type === 'error' || ev.type === 'run.failed') && 'message' in ev
        ? (ev as { message: string }).message
        : null;
    closeRun(fold, failed, ev.type as FeedRunTerminal);
    return;
  }
  let run = fold.current;
  if (!run) {
    run = createRun(index);
    fold.current = run;
  }
  fold.dirty = true;
  run.events.push(ev);
  if (!run.id && ev.type === 'tool' && ev.toolCallId) {
    run.id = ev.toolCallId;
  }
  if (!run.runId && ev.runId) {
    run.runId = ev.runId;
  }
  if (ev.type === 'user') {
    flushActivity(run);
    pushSegment(run, { key: '', kind: 'user', event: ev as SessionEvent & { type: 'user' } });
    return;
  }
  if (ev.type === 'text-delta') {
    flushActivity(run);
    const last = run.segments[run.segments.length - 1];
    const delta = ev as TextDeltaEvent;
    if (last && last.kind === 'text' && last.data.kind === 'text' && last.data.id === delta.id) {
      last.data = { ...last.data, text: last.data.text + delta.text };
      return;
    }
    pushSegment(run, { key: '', kind: 'text', id: delta.id, text: delta.text });
    return;
  }
  if (ev.type === 'compaction') {
    flushActivity(run);
    const texts: string[] = [];
    while (run.segments.length > 0) {
      const last = run.segments[run.segments.length - 1];
      if (last.kind !== 'text') {
        break;
      }
      if (last.data.kind === 'text') {
        texts.unshift(last.data.text);
      }
      run.segments.pop();
    }
    pushSegment(run, {
      key: '',
      kind: 'compaction',
      text: texts.join(''),
      meta: {
        id: ev.id,
        reason: ev.reason,
        coveredFrom: ev.coveredFrom,
        coveredUntil: ev.coveredUntil,
        tokensBefore: ev.tokensBefore,
        tokensAfter: ev.tokensAfter,
      },
    });
    return;
  }
  if (ev.type === 'agent.handoff') {
    flushActivity(run);
    pushSegment(run, { key: '', kind: 'handoff', agentId: ev.agentId, seq: ev.seq });
    return;
  }
  activityProcess(run, ev);
}

export function splitRuns(events: SessionEvent[]): FeedRun[] {
  const fold = createRunFold();
  let index = 0;
  for (const ev of events) {
    runProcess(fold, ev, index);
    index += 1;
  }
  return runSnapshot(fold).slice();
}

export function isCompactRun(run: FeedRun): boolean {
  return run.events.some(
    (event) =>
      event.type === 'compaction' ||
      (typeof event.runId === 'string' && event.runId.startsWith('compact:')),
  );
}

function createRun(index: number): RunDraft {
  return {
    id: null,
    runId: undefined,
    error: null,
    terminal: null,
    firstIndex: index,
    events: [],
    segments: [],
    segmentOrdinal: 0,
    pairs: new Map(),
    hasInFlight: false,
    published: null,
  };
}

function closeRun(fold: RunFold, error: string | null, terminal: FeedRunTerminal): void {
  const run = fold.current;
  if (!run) {
    return;
  }
  flushActivity(run);
  run.error = error;
  run.terminal = terminal;
  fold.closed.push(publishRun(run));
  fold.current = undefined;
}

export function pushSegment(run: RunDraft, data: FeedSegment): void {
  data.key = `s${run.segmentOrdinal}`;
  run.segmentOrdinal += 1;
  run.segments.push({
    kind: data.kind,
    key: data.key,
    data,
    items: [],
    reasoningBuffer: [],
    toolsBuffer: [],
    groupChunks: [],
    askByCall: new Map(),
    askItemByCall: new Map(),
    chunkOrdinal: 0,
    itemOrdinal: 0,
    eventCount: 1,
    dirty: true,
    published: null,
  });
}
