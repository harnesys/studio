import type { RunLifecycleStore, RunRecord } from '../ports/run-lifecycle-store.ts';
import type { RunTarget, RunTargets } from '../ports/run-targets.ts';
import { runFailedEvent } from './run-engine-events.ts';
import type { RunEngine } from './run-engine-types.ts';

export type RunClaimer = {
  /** Wakes the sweep immediately (after send/respond/reject). */
  kick(): void;
  /** Stops the claimer (in-flight runs are interrupted via the engine stop). */
  stop(): void;
};

export function createRunClaimer(deps: {
  lifecycle: RunLifecycleStore;
  targets: RunTargets;
  engine: RunEngine;
  instanceId: string;
  leaseTtlMs?: number;
  sweepMs?: number;
  /** Wraps the engine.execute call with the host context from RunTarget.scope. */
  withScope?: (target: RunTarget, execute: () => Promise<void>) => Promise<void>;
  /** Called once per finished execute with the post-execution lifecycle record. */
  onComplete?: (record: RunRecord) => void;
}): RunClaimer {
  const leaseTtl = deps.leaseTtlMs ?? 15_000;
  const sweepMs = deps.sweepMs ?? 5_000;
  let stopped = false;
  let sweeping = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const executing = new Set<string>();

  function finishWith(record: RunRecord): void {
    if (deps.onComplete !== undefined) {
      deps.onComplete(record);
    }
  }

  /** Null target would strand the queued run forever; fail it instead. */
  async function failUnavailable(rec: RunRecord): Promise<RunRecord | null> {
    try {
      return await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
        from: 'queued',
        to: 'failed',
        events: [runFailedEvent('run target unavailable')],
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'already_resumed' || code === 'lease_stale') {
        return null;
      }
      throw err;
    }
  }

  async function tryClaim(runId: string): Promise<void> {
    if (executing.has(runId)) {
      return;
    }
    const rec = await deps.lifecycle.get(runId);
    if (rec === null || rec.status !== 'queued') {
      return;
    }
    const target = await deps.targets.resolve(rec.threadId);
    if (target === null) {
      const failed = await failUnavailable(rec);
      if (failed !== null) {
        finishWith(failed);
      }
      return;
    }
    const claimed = await deps.lifecycle.claim(runId, deps.instanceId, leaseTtl);
    if (claimed === null) {
      return;
    }
    executing.add(runId);
    const run = (): Promise<void> => deps.engine.execute(runId, target);
    const execution = deps.withScope !== undefined ? deps.withScope(target, run) : run();
    void execution
      .catch(() => {})
      .finally(() => {
        executing.delete(runId);
        void deps.lifecycle
          .get(runId)
          .then((record) => {
            if (record !== null) {
              finishWith(record);
            }
          })
          .catch(() => {});
        void sweep();
      });
  }

  async function sweep(): Promise<void> {
    if (stopped || sweeping) {
      return;
    }
    sweeping = true;
    try {
      const claimable = await deps.lifecycle.listClaimable({ limit: 10 });
      for (const rec of claimable) {
        if (stopped) {
          return;
        }
        await tryClaim(rec.runId);
      }
    } finally {
      sweeping = false;
    }
  }

  timer = setInterval(() => {
    void sweep();
  }, sweepMs);

  return {
    kick() {
      void sweep();
    },
    stop() {
      stopped = true;
      if (timer !== null) {
        clearInterval(timer);
      }
      deps.engine.stop();
    },
  };
}
