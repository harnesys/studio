import type { Attachment } from '../domain/attachment.ts';
import { codedRunError } from '../domain/errors.ts';
import { compile } from './compile.ts';
import type { GraphOpts } from './graph.ts';
import { restoreReActOutput } from './graph-helpers.ts';
import { runStartedEvent } from './run-engine-events.ts';
import type { SegmentCtx, SegmentEnv } from './run-engine-segment.ts';
import { admit, flushJournal, runSegment } from './run-engine-segment.ts';
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

type RunRuntime = {
  abort: AbortController;
  renewTimer: ReturnType<typeof setInterval> | null;
  leaseLost: boolean;
};

export function createRunEngine(deps: RunEngineDeps): RunEngine {
  const leaseTtl = deps.leaseTtlMs ?? 15_000;
  const renewMs = deps.renewMs ?? 5_000;
  const active: Set<RunRuntime> = new Set();

  function envWith(leaseLost: () => boolean): SegmentEnv {
    return {
      lifecycle: deps.lifecycle,
      events: deps.events,
      feed: deps.feed,
      isLeaseLost: leaseLost,
    };
  }

  function haltRun(run: RunRuntime): void {
    run.abort.abort();
    if (run.renewTimer !== null) {
      clearInterval(run.renewTimer);
      run.renewTimer = null;
    }
    active.delete(run);
  }

  /** Aborts every active run and stops its renew timer (claimer/engine shutdown). */
  function stop(): void {
    for (const run of [...active]) {
      haltRun(run);
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
    const run: RunRuntime = { abort: new AbortController(), renewTimer: null, leaseLost: false };
    active.add(run);
    const signal = run.abort.signal;
    const env = envWith(() => run.leaseLost);
    run.renewTimer = setInterval(() => {
      void deps.lifecycle.renewLease(runId, deps.instanceId, leaseTtl).then((ok) => {
        if (!ok) {
          run.leaseLost = true;
          run.abort.abort(codedRunError('lease_stale', 'lease lost'));
        }
      });
    }, renewMs);

    try {
      const ctx: SegmentCtx = {
        runId,
        epoch,
        pending: [admit(env, runId, runStartedEvent(record.attempt))],
      };
      if (!(await flushJournal(env, ctx))) {
        return;
      }
      const answer = await findLastAnswer(runId);
      const snap = await opts.state.load();
      const user = answer === null ? await findFirstUser(runId) : null;
      const { plan } = compile(opts.agent);
      const startNodeId = answer === null ? undefined : snap?.cursor.interrupt?.nodeId;
      const graphOpts: GraphOpts = {
        agent: opts.agent,
        input: answer === null ? (user ?? snap?.initialInput ?? null) : null,
        // Ввод уже записан в лог жизненным циклом (SessionHandle.send):
        // граф не должен коммитить user.message второй раз.
        inputRecorded: answer === null && user !== null,
        state: opts.state,
        permissions: opts.permissions,
        paths: opts.paths,
        artifacts: deps.artifacts,
        models: deps.models,
        toolRegistry: opts.toolRegistry ?? deps.toolRegistry,
        plan,
        toolMessages: deps.toolMessages,
        mergeState: deps.mergeState,
        signal,
        startNodeId,
        outputHint: startNodeId === undefined ? undefined : restoreReActOutput(snap),
        rejected: answer?.rejected === true,
        resumePayload: answer?.payload,
        resumeInterruptId: answer?.interruptId,
      };
      await runSegment(env, runId, epoch, graphOpts);
    } finally {
      haltRun(run);
    }
  }

  return { execute, stop, close: stop };
}
