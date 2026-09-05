import { Earth } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore, type Webhook } from '@/entities/webhook';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteWebhook,
  createWebhook,
  openCreateWebhookDialog,
} from '@/features/manage-webhook';
import { deleteWebhookRecord } from '@/shared/api';
import { studioPath } from '@/shared/config/routes';
import { RailSection } from './rail-section';
import { WebhookRow } from './webhook-row';

type WebhooksSectionProps = {
  workspaceId: string | null;
  agents: Agent[];
  webhooks: Webhook[];
  onSelectDone: () => void;
};

export function WebhooksSection({
  workspaceId,
  agents,
  webhooks,
  onSelectDone,
}: WebhooksSectionProps) {
  const navigate = useNavigate();

  const openWebhook = (item: Webhook) => {
    if (!workspaceId) {
      return;
    }
    const agentId = useThreadStore.getState().byId(item.threadId)?.agentId;
    useIdeStore.getState().openThread(workspaceId, agentId ?? item.targetAgentId, item.threadId);
    void navigate(studioPath.thread(workspaceId, item.threadId, { kind: 'webhook', id: item.id }));
  };

  const create = () => {
    void openCreateWebhookDialog(agents).then(async (draft) => {
      if (!draft || !workspaceId) {
        return;
      }
      const created = await createWebhook(workspaceId, draft);
      if (created) {
        openWebhook(created);
        onSelectDone();
      }
    });
  };

  return (
    <RailSection
      id="webhooks"
      icon={<Earth />}
      title="Webhooks"
      addLabel="New webhook"
      onAdd={create}
      testId="nav-webhooks"
    >
      {webhooks.length === 0 ? (
        <button
          type="button"
          className="group/empty flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
          onClick={create}
        >
          <span className="flex items-center gap-1.5">
            <span className="live-dot size-1 rounded-full bg-live" />
            <span className="font-mono text-[10px] text-live tracking-[0.16em]">QUIET</span>
          </span>
          <span className="text-[11px] text-muted-foreground leading-snug">
            Wire an inbound webhook.
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
          {webhooks.map((item) => (
            <WebhookRow
              key={item.id}
              webhook={item}
              selected={false}
              onSelect={() => {
                openWebhook(item);
                onSelectDone();
              }}
              onDelete={() => {
                void confirmDeleteWebhook(item).then(async (confirmed) => {
                  if (!confirmed || !workspaceId) {
                    return;
                  }
                  await deleteWebhookRecord(workspaceId, item.id);
                  useWebhookStore.getState().remove(item.id);
                  useIdeStore.getState().closeByEntity(workspaceId, 'thread', item.threadId);
                });
              }}
            />
          ))}
        </div>
      )}
    </RailSection>
  );
}
