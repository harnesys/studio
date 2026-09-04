import type { RunRecord } from 'harnesys';
import type { ThreadActiveRun } from '../../../shared/types.ts';

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
