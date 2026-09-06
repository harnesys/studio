import type { CapabilityScope } from '../domain/capability.ts';
import type { RunLifecycleStatus } from './run-lifecycle-store.ts';
import type { SessionEvent } from './session.ts';

export type WebhookStatus = 'active' | 'paused' | 'failed';

export type WebhookRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  threadId: string;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookCreateInput = {
  name: string;
  targetAgentId?: string;
  detail?: string;
};

export type WebhookUpdateInput = {
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
};

export type WebhookThreadActiveRun = {
  runId: string;
  status: RunLifecycleStatus;
  leaseExpired?: boolean;
};

export type WebhookCreatedThread = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  workspaceId: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  events: SessionEvent[];
  activeRun: WebhookThreadActiveRun | null;
};

export type WebhookCreatedRecord = {
  webhook: WebhookRecord;
  thread: WebhookCreatedThread;
};

export type WebhookPort = {
  list(scope: CapabilityScope): Promise<WebhookRecord[]>;
  create(scope: CapabilityScope, input: WebhookCreateInput): Promise<WebhookCreatedRecord>;
  update(scope: CapabilityScope, id: string, patch: WebhookUpdateInput): Promise<WebhookRecord>;
  remove(scope: CapabilityScope, id: string): Promise<void>;
};
