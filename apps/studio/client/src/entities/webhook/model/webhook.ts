export const WEBHOOK_STATUSES = ['active', 'paused', 'failed'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export function webhookStatusTone(
  status: WebhookStatus,
): 'idle' | 'live' | 'wait' | 'danger' | 'off' {
  switch (status) {
    case 'active':
      return 'live';
    case 'paused':
      return 'wait';
    case 'failed':
      return 'danger';
  }
}

export function webhookStatusLabel(status: WebhookStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Failed';
  }
}

export function webhookInk(status: WebhookStatus): string {
  switch (status) {
    case 'active':
      return 'text-live';
    case 'paused':
      return 'text-muted-foreground';
    case 'failed':
      return 'text-destructive';
  }
}

export type Webhook = {
  id: string;
  workspaceId: string;
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  lastFiredAt?: string;
};

export const seedWebhooks: Webhook[] = [
  {
    id: '05000000-0000-4000-8000-000000000004',
    workspaceId: '01000000-0000-4000-8000-000000000001',
    name: 'GitHub pull request',
    status: 'active',
    targetAgentId: '02000000-0000-4000-8000-000000000001',
    detail: 'Opens a review thread when a PR mentions @harnesys.',
    endpoint: 'https://hooks.harnesys.dev/gh/northstar',
    lastFiredAt: '2026-08-16T10:12:00.000Z',
  },
  {
    id: '05000000-0000-4000-8000-000000000005',
    workspaceId: '01000000-0000-4000-8000-000000000001',
    name: 'Linear issue labeled',
    status: 'active',
    targetAgentId: '02000000-0000-4000-8000-000000000002',
    detail: 'Starts a research thread when an issue is labeled brief.',
    endpoint: 'https://hooks.harnesys.dev/linear/northstar',
    lastFiredAt: '2026-08-15T17:44:00.000Z',
  },
  {
    id: '05000000-0000-4000-8000-000000000006',
    workspaceId: '01000000-0000-4000-8000-000000000001',
    name: 'PagerDuty incident',
    status: 'failed',
    targetAgentId: '02000000-0000-4000-8000-000000000004',
    detail: 'Missing signing secret. Nyx paused replay until it is rotated.',
    endpoint: 'https://hooks.harnesys.dev/pd/northstar',
    lastFiredAt: '2026-08-16T12:03:00.000Z',
  },
  {
    id: '05000000-0000-4000-8000-000000000008',
    workspaceId: '01000000-0000-4000-8000-000000000002',
    name: 'Status page publish',
    status: 'active',
    targetAgentId: '02000000-0000-4000-8000-000000000007',
    detail: "Publishes Lumen's draft when ops confirms.",
    endpoint: 'https://hooks.harnesys.dev/status/atlas',
    lastFiredAt: '2026-08-12T11:00:00.000Z',
  },
];
