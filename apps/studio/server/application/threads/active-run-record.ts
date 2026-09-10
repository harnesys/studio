import type { RunRecord } from 'harnesys';
import type { ThreadActiveRun } from '@harnesys/studio-shared';

export function activeRunOf(active: RunRecord | null): ThreadActiveRun | null {
  if (!active) {
    return null;
  }
  const leaseExpired =
    active.status === 'running' &&
    active.leaseExpiresAt !== undefined &&
    active.leaseExpiresAt < Date.now();
  return { runId: active.runId, status: active.status, leaseExpired: leaseExpired || undefined };
}
