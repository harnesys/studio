import type { MonitorJobSpec } from 'harnesys';
export type MonitorJobRegistration = {
  threadId: string;
  jobs: MonitorJobSpec[];
  cwd: string;
};
export type MonitorJobRegistrar = {
  register(input: MonitorJobRegistration): void;
  deregister(threadId: string): void;
};
export type MonitorJobRegistrarPort = MonitorJobRegistrar;
