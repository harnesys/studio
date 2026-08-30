import { create } from 'zustand';

import { seedWebhooks, type Webhook, type WebhookStatus } from './webhook';

export type WebhookDraft = {
  name: string;
  targetAgentId: string;
};

export type WebhookPatch = {
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
  endpoint?: string;
};

type WebhookStore = {
  items: Webhook[];
  byId: (id: string) => Webhook | undefined;
  inWorkspace: (workspaceId: string) => Webhook[];
  create: (workspaceId: string, draft: WebhookDraft) => Webhook | null;
  update: (webhookId: string, patch: WebhookPatch) => void;
  remove: (webhookId: string) => void;
};

export const useWebhookStore = create<WebhookStore>((set, get) => ({
  items: seedWebhooks.map((item) => ({ ...item })),

  byId: (id) => get().items.find((item) => item.id === id),

  inWorkspace: (workspaceId) => get().items.filter((item) => item.workspaceId === workspaceId),

  create: (workspaceId, draft) => {
    const name = draft.name.trim();
    if (!workspaceId || !name) {
      return null;
    }
    const webhook: Webhook = {
      id: crypto.randomUUID(),
      workspaceId,
      name,
      status: 'active',
      targetAgentId: draft.targetAgentId,
      detail: 'No webhook notes yet.',
      endpoint: 'https://hooks.harnesys.dev/new',
      lastFiredAt: undefined,
    };
    set((state) => ({ items: [...state.items, webhook] }));
    return webhook;
  },

  update: (webhookId, patch) => {
    const current = get().items.find((item) => item.id === webhookId);
    if (!current) {
      return;
    }
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) {
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === webhookId
          ? {
              ...item,
              name: name ?? item.name,
              status: patch.status ?? item.status,
              targetAgentId: patch.targetAgentId ?? item.targetAgentId,
              detail: patch.detail?.trim() || item.detail,
              endpoint: patch.endpoint?.trim() || item.endpoint,
            }
          : item,
      ),
    }));
  },

  remove: (webhookId) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== webhookId),
    }));
  },
}));
