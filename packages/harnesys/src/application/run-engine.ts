import type { Attachment } from '../domain/attachment.ts';
import { codedRunError } from '../domain/errors.ts';
import type { PendingSessionEvent } from '../ports/run-event-store.ts';
import { compile } from './compile.ts';
import type { GraphOpts } from './graph.ts';
import { runStartedEvent } from './run-engine-events.ts';
import type { SegmentEnv } from './run-engine-segment.ts';
import { appendJournal, runSegment } from './run-engine-segment.ts';
import type { RunEngine, RunEngineDeps, RunTargetOpts } from './run-engine-types.ts';

export type { RunEngine, RunEngineDeps, RunTargetOpts };

type HitlAnswer = {
  interruptId: string;
  payload?: unknown;
  rejected?: boolean;
};

type UserInput = {
  text: string;
  attachments?: Attachment[];
  origin?: string;
};

export function createRunEngine(deps: RunEngineDeps): RunEngine {
  const leaseTtl = deps.leaseTtlMs ?? 15_000;
  const renewMs = deps.renewMs ?? 5_000;
  let abort: AbortController | null = null;
  let renewTimer: ReturnType<typeof setInterval> | null = null;
  let leaseLost = false;

  const env: SegmentEnv = {
    lifecycle: deps.lifecycle,
    events: deps.events,
    feed: deps.feed,
    isLeaseLost: () => leaseLost,
  };

  function stop(): void {
    abort?.abort();
    abort = null;
    if (renewTimer !== null) {
      clearInterval(renewTimer);
      renewTimer = null;
    }
  }

  async function findLastAnswer(runId: string): Promise<HitlAnswer | null> {
    const history = await deps.events.tail(runId, 0);
    let last: HitlAnswer | null = null;
    for (const event of history) {
      if (event.type === 'hitl.answer') {
        last = { interruptId: event.interruptId, payload: event.payload, rejected: event.rejected };
      }
    }
    return last;
  }

  async function findFirstUser(runId: string): Promise<UserInput | null> {
    const history = await deps.events.tail(runId, 0);
    for (const event of history) {
      if (event.type === 'user') {
        return { text: event.text, attachments: event.attachments, origin: event.origin };
      }
    }
    return null;
  }

  async function execute(runId: string, opts: RunTargetOpts): Promise<void> {
    const record = await deps.lifecycle.get(runId);
    if (
      record === null ||
      record.status !== 'running' ||
      record.leaseInstanceId !== deps.instanceId
    ) {
      throw codedRunError('lease_stale', `run ${runId} not owned by ${deps.instanceId}`);
    }
    const epoch = record.leaseEpoch;
    abort = new AbortController();
    const signal = abort.signal;
    leaseLost = false;
    renewTimer = setInterval(() => {
      void deps.lifecycle.renewLease(runId, deps.instanceId, leaseTtl).then((ok) => {
        if (!ok) {
          leaseLost = true;
          abort?.abort(codedRunError('lease_stale', 'lease lost'));
        }
      });
    }, renewMs);

    try {
      const started: PendingSessionEvent[] = [runStartedEvent(record.attempt)];
      if (!(await appendJournal(env, runId, epoch, started))) {
        return;
      }
      const answer = await findLastAnswer(runId);
      const snap = await opts.state.load();
      const user = answer === null ? await findFirstUser(runId) : null;
      const { plan } = compile(opts.agent);
      const graphOpts: GraphOpts = {
        agent: opts.agent,
        input: answer === null ? (user ?? snap?.initialInput ?? null) : null,
        state: opts.state,
        permissions: opts.permissions,
        paths: opts.paths,
        artifacts: deps.artifacts,
        models: deps.models,
        toolRegistry: deps.toolRegistry,
        plan,
        toolMessages: deps.toolMessages,
        mergeState: deps.mergeState,
        signal,
        startNodeId: answer === null ? undefined : snap?.cursor.interrupt?.nodeId,
        rejected: answer?.rejected === true,
        resumePayload: answer?.payload,
      };
      await runSegment(env, runId, epoch, graphOpts);
    } finally {
      stop();
    }
  }

  return { execute, stop, close: stop };
}
