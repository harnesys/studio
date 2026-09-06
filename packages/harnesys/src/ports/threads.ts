import type { CapabilityScope } from '../domain/capability.ts';

export type ThreadSummary = {
  id: string;
  title: string;
  kind: string;
  agentId: string;
  agentName: string;
  hasSchedule?: boolean;
};

export type ThreadsPort = {
  list(scope: CapabilityScope): Promise<ThreadSummary[]>;
};
