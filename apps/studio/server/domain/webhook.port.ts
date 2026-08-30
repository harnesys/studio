export type WebhookStatus = 'active' | 'paused' | 'failed';

export type Webhook = {
  id: string;
  workspaceId: string;
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookInsert = Webhook;

export type WebhookPatch = Partial<{
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  lastFiredAt: string | null;
}>;

export type WebhookRepository = {
  listByWorkspace(workspaceId: string): Webhook[];
  findById(id: string): Webhook | undefined;
  insert(rec: WebhookInsert): Webhook;
  update(id: string, patch: WebhookPatch): Webhook;
  delete(id: string): void;
  deleteByWorkspace(workspaceId: string): void;
};
