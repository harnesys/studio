import { DEFAULT_LEASE_RENEW_MS, DEFAULT_LEASE_TTL_MS, RUN_NON_TERMINAL } from '../constants.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Event } from '../domain/snapshot.ts';
import { CONSOLE_LOGGER } from '../ports/logger.ts';
import type { SessionEvent } from '../ports/session.ts';
import type { GraphOpts } from './graph.ts';
import { emitHook, type HookEmitCtx } from './hooks/emit-hook.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import { eventToSessionEvent, runFailedEvent, runStartedEvent } from './run-engine-events.ts';
import { prepareExecuteGraphOpts } from './run-engine-prepare.ts';
import type { SegmentCtx, SegmentEnv } from './run-engine-segment.ts';
import { admit, flushJournal, guardedTransition, runSegment } from './run-engine-segment.ts';
import type { RunEngine, RunEngineDeps, RunTargetOpts } from './run-engine-types.ts';

export type { RunEngine, RunEngineDeps, RunTargetOpts };

type RunRuntime = {
  abort: AbortController;
  renewTimer: ReturnType<typeof setInterval> | null;
  leaseLost: boolean;
};

export function createRunEngine(deps: RunEngineDeps): RunEngine {
  const leaseTtl = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const renewMs = deps.renewMs ?? DEFAULT_LEASE_RENEW_MS;
  const active: Set<RunRuntime> = new Set();
  const runLogger = deps.logger ?? CONSOLE_LOGGER;
  /** Built pack outputs per runId. First segment builds via `create`; later
   *  segments (`respond`) reuse the map so stateful `create` runs once per run. */
  const packCache = new Map<string, PackRunMap>();
  /** Per-run hook emit contexts; segments reuse the bus, terminal run closes it. */
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

  /** Aborts every active run and stops its renew timer (claimer/engine shutdown). */
  function stop(): void {
    for (const run of [...active]) {
      haltRun(run);
    }
    packCache.clear();
    // Незавершённые хук-процессы (включая async) не переживают остановку движка.
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
      // Журнал дочерних спавнов: события ребёнка пишутся в тред под runId = spawnId.
      // Проглатывание ошибки — сознательно: журнал ребёнка не должен ронять
      // родительский ран; потеря стрима не влияет на snapshot.
      const childJournal = (spawnId: string, ev: Event): void => {
        const mapped = eventToSessionEvent(ev);
        if (mapped === null) {
          return;
        }
        const withRun = { ...mapped, runId: spawnId } as SessionEvent;
        const seq = deps.events.next(spawnId);
        const full = { ...withRun, seq } as SessionEvent;
        void Promise.resolve(deps.events.appendForThread(record.threadId, spawnId, [full]))
          .then((stored) => deps.feed.publish(spawnId, stored))
          .catch(() => {});
      };
      let graphOpts: GraphOpts;
      try {
        graphOpts = await prepareExecuteGraphOpts({
          deps,
          opts,
          runId,
          signal,
          packCache,
          hookCache,
          runLogger,
          childJournal,
        });
      } catch (err) {
        if (env.isLeaseLost() || (err as { code?: string }).code === 'lease_stale') {
          return;
        }
        await guardedTransition(env, runId, epoch, {
          from: 'running',
          to: 'failed',
          events: [
            runFailedEvent(err instanceof Error && err.message ? err.message : 'run failed'),
          ],
        });
        return;
      }
      await runSegment(env, runId, epoch, graphOpts);
      const terminal = await deps.lifecycle
        .get(runId)
        .then((rec) => rec !== null && !RUN_NON_TERMINAL.includes(rec.status))
        .catch(() => false);
      if (terminal) {
        packCache.delete(runId);
        // Закрытие рана: групповое убийство хук-процессов (включая async),
        // drain deferred, затем emit SessionEnd (спека §2.4).
        const hooks = hookCache.get(runId);
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
