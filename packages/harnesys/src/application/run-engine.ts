import { DEFAULT_LEASE_RENEW_MS, DEFAULT_LEASE_TTL_MS, RUN_NON_TERMINAL } from '../constants.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Event } from '../domain/snapshot.ts';
import { CONSOLE_LOGGER } from '../ports/logger.ts';
import type { RunLifecycleStatus } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';
import type { GraphOpts } from './graph.ts';
import { emitHook, type HookEmitCtx } from './hooks/emit-hook.ts';
import { eventToSessionEvent, runFailedEvent, runStartedEvent } from './run-engine-events.ts';
import { prepareExecuteGraphOpts } from './run-engine-prepare.ts';
import type { SegmentCtx, SegmentEnv } from './run-engine-segment.ts';
import {
  admit,
  failMessageOf,
  flushJournal,
  guardedTransition,
  runSegment,
} from './run-engine-segment.ts';
import type { RunEngine, RunEngineDeps, RunTargetOpts } from './run-engine-types.ts';

export type { RunEngine, RunEngineDeps, RunTargetOpts };

type RunRuntime = {
  abort: AbortController;
  renewTimer: ReturnType<typeof setInterval> | null;
  leaseLost: boolean;
};
const CHILD_TERMINAL_STATUS: Record<string, RunLifecycleStatus> = {
  'run.completed': 'completed',
  'run.cancelled': 'cancelled',
  'run.failed': 'failed',
};
type ChildRunJournal = {
  tail: Promise<void>;
  epoch: number;
  closed: boolean;
};
export function createRunEngine(deps: RunEngineDeps): RunEngine {
  const leaseTtl = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const renewMs = deps.renewMs ?? DEFAULT_LEASE_RENEW_MS;
  const active: Set<RunRuntime> = new Set();
  const runLogger = deps.logger ?? CONSOLE_LOGGER;
  const hookCache = new Map<string, HookEmitCtx>();
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
  function stop(): void {
    for (const run of [...active]) {
      haltRun(run);
    }
    for (const hooks of hookCache.values()) {
      void hooks.bus.close();
    }
    hookCache.clear();
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
      const childRuns = new Map<string, ChildRunJournal>();
      const childJournal = (spawnId: string, ev: Event): void => {
        let entry = childRuns.get(spawnId);
        if (entry === undefined) {
          entry = { tail: Promise.resolve(), epoch: 0, closed: false };
          childRuns.set(spawnId, entry);
          const born = entry;
          entry.tail = deps.lifecycle
            .create({ runId: spawnId, threadId: record.threadId, parentRunId: runId })
            .then((rec) =>
              deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
                from: 'queued',
                to: 'running',
              }),
            )
            .then((rec) => {
              born.epoch = rec.leaseEpoch;
            })
            .catch(() => {});
        }
        const journal = entry;
        const mapped = eventToSessionEvent(ev);
        const terminal = CHILD_TERMINAL_STATUS[ev.type];
        journal.tail = journal.tail
          .then(() => {
            if (mapped === null) {
              return undefined;
            }
            const withRun = { ...mapped, runId: spawnId } as SessionEvent;
            const seq = deps.events.next(spawnId);
            const full = { ...withRun, seq } as SessionEvent;
            return Promise.resolve(
              deps.events.appendForThread(record.threadId, spawnId, [full]),
            ).then((stored) => deps.feed.publish(spawnId, stored));
          })
          .then(() => {
            if (terminal === undefined || journal.closed) {
              return undefined;
            }
            journal.closed = true;
            return deps.lifecycle
              .transition(spawnId, journal.epoch, { from: 'running', to: terminal })
              .then(() => {});
          })
          .catch(() => {});
      };
      let graphOpts: GraphOpts;
      try {
        graphOpts = await prepareExecuteGraphOpts({
          deps,
          opts,
          runId,
          signal,
          hookCache,
          runLogger,
          childJournal,
        });
      } catch (err) {
        if (
          env.isLeaseLost() ||
          (
            err as {
              code?: string;
            }
          ).code === 'lease_stale'
        ) {
          return;
        }
        await guardedTransition(env, runId, epoch, {
          from: 'running',
          to: 'failed',
          events: [runFailedEvent(failMessageOf(err))],
        });
        return;
      }
      await runSegment(env, runId, epoch, graphOpts);
      const terminal = await deps.lifecycle
        .get(runId)
        .then((rec) => rec !== null && !RUN_NON_TERMINAL.includes(rec.status))
        .catch(() => false);
      if (terminal) {
        const hooks = opts.hooksEmit ?? hookCache.get(runId);
        if (hooks !== undefined) {
          hookCache.delete(runId);
          await hooks.bus.close();
          await emitHook(hooks, 'SessionEnd', {});
        }
      }
    } finally {
      haltRun(run);
    }
  }
  return { execute, stop, close: stop };
}
