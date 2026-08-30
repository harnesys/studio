import { Earth } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import { useWebhookStore, type Webhook } from '@/entities/webhook';
import { useIdeStore } from '@/features/ide';
import {
  confirmDeleteWebhook,
  createWebhook,
  openCreateWebhookDialog,
} from '@/features/manage-webhook';
import { useStudioNavigation } from '@/shared/config/navigation';
import { RailSection } from './rail-section';
import { WebhookRow } from './webhook-row';

type WebhooksSectionProps = {
  workspaceId: string | null;
  agents: Agent[];
  webhooks: Webhook[];
  selectedWebhookId: string | null;
  selected: boolean;
  onOpen: (workspaceId: string, webhookId: string) => void;
  onSelectDone: () => void;
};

export function WebhooksSection({
  workspaceId,
  agents,
  webhooks,
  selectedWebhookId,
  selected,
  onOpen,
  onSelectDone,
}: WebhooksSectionProps) {
  const { openWebhooks } = useStudioNavigation();
  const create = () => {
    void openCreateWebhookDialog(agents).then((draft) => {
      if (!draft || !workspaceId) {
        return;
      }
      const created = createWebhook(workspaceId, draft);
      if (created) {
        useIdeStore.getState().openWebhook(workspaceId, created.id);
        onOpen(workspaceId, created.id);
      }
    });
  };

  return (
    <RailSection
      id="webhooks"
      icon={<Earth />}
      title="Webhooks"
      addLabel="New webhook"
      selected={selected}
      onHeaderClick={() => {
        if (workspaceId) {
          openWebhooks(workspaceId);
          onSelectDone();
        }
      }}
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
              selected={item.id === selectedWebhookId && selected}
              onSelect={() => {
                if (workspaceId) {
                  useIdeStore.getState().openWebhook(workspaceId, item.id);
                  onOpen(workspaceId, item.id);
                }
                onSelectDone();
              }}
              onDelete={() => {
                void confirmDeleteWebhook(item).then((confirmed) => {
                  if (confirmed) {
                    useWebhookStore.getState().remove(item.id);
                    if (workspaceId) {
                      useIdeStore.getState().closeByEntity(workspaceId, 'webhook', item.id);
                    }
                  }
                });
              }}
            />
          ))}
        </div>
      )}
    </RailSection>
  );
}
