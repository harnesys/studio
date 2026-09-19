import type { MonitorJobSpec } from 'harnesys';

/** One registration per plugin per run thread. */
export type MonitorJobRegistration = {
  threadId: string;
  jobs: MonitorJobSpec[];
  /** Working directory for the job processes: the plugin root. */
  cwd: string;
};

/**
 * Per-run monitor job lifecycle (spec §3 monitor): jobs live while the
 * thread's run is active, stdout lines become Notification events, and
 * nothing survives a server restart. Deregistration happens on the
 * run-finish desk event, not on a background timer.
 */
export type MonitorJobRegistrar = {
  register(input: MonitorJobRegistration): void;
  deregister(threadId: string): void;
};

export type MonitorJobRegistrarPort = MonitorJobRegistrar;
