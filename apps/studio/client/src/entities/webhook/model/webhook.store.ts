import { create } from 'zustand';

import type { Webhook, WebhookStatus } from './webhook';

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
  upsert: (webhook: Webhook) => void;
  replaceWorkspace: (workspaceId: string, webhooks: Webhook[]) => void;
  update: (webhookId: string, patch: WebhookPatch) => void;
  remove: (webhookId: string) => void;
};

export const useWebhookStore = create<WebhookStore>((set, get) => ({
  items: [],

  byId: (id) => get().items.find((item) => item.id === id),

  inWorkspace: (workspaceId) => get().items.filter((item) => item.workspaceId === workspaceId),

  upsert: (webhook) => {
    set((state) => ({
      items: state.items.some((item) => item.id === webhook.id)
        ? state.items.map((item) => (item.id === webhook.id ? webhook : item))
        : [...state.items, webhook],
    }));
  },

  replaceWorkspace: (workspaceId, webhooks) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.workspaceId !== workspaceId), ...webhooks],
    }));
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
