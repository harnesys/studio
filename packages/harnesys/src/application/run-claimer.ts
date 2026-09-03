import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { RunTargets } from '../ports/run-targets.ts';
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
}): RunClaimer {
  const leaseTtl = deps.leaseTtlMs ?? 15_000;
  const sweepMs = deps.sweepMs ?? 5_000;
  let stopped = false;
  let sweeping = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const executing = new Set<string>();

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
      return;
    }
    const claimed = await deps.lifecycle.claim(runId, deps.instanceId, leaseTtl);
    if (claimed === null) {
      return;
    }
    executing.add(runId);
    void deps.engine
      .execute(runId, target)
      .catch(() => {})
      .finally(() => {
        executing.delete(runId);
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
