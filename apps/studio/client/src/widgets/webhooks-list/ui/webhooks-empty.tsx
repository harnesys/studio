import { WebhookIcon } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import type { Webhook } from '@/entities/webhook';
import { webhookInk, webhookStatusLabel } from '@/entities/webhook';
import { createWebhook, openCreateWebhookDialog } from '@/features/manage-webhook';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingList,
  CategoryLandingListItem,
  CategoryLandingSection,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';

type WebhooksEmptyProps = {
  workspaceId: string | null;
  agents: Agent[];
  webhooks: Webhook[];
  onOpen: (workspaceId: string, webhookId: string) => void;
};

export function WebhooksEmpty({ workspaceId, agents, webhooks, onOpen }: WebhooksEmptyProps) {
  return (
    <CategoryLanding data-testid="webhooks-list">
      <CategoryLandingEyebrow>QUIET</CategoryLandingEyebrow>
      <CategoryLandingTitle>No webhooks yet</CategoryLandingTitle>
      <CategoryLandingDescription>
        An HTTP hit starts the agent without opening a thread. Wire one for inbound calls.
      </CategoryLandingDescription>

      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Wire one
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<WebhookIcon />}
            title="Webhook"
            description="An HTTP hit starts the agent."
            meta="/hooks/…"
            onClick={() => {
              if (!workspaceId) {
                return;
              }
              void openCreateWebhookDialog(agents).then((draft) => {
                if (!draft || !workspaceId) {
                  return;
                }
                const created = createWebhook(workspaceId, draft);
                if (created) {
                  onOpen(workspaceId, created.id);
                }
              });
            }}
          />
        </CategoryLandingActions>
      </div>

      {webhooks.length > 0 ? (
        <CategoryLandingSection label="Existing">
          <CategoryLandingList>
            {webhooks.map((item) => (
              <CategoryLandingListItem
                key={item.id}
                icon={<WebhookIcon />}
                title={item.name}
                subtitle={item.endpoint}
                status={
                  <span className={webhookInk(item.status)}>{webhookStatusLabel(item.status)}</span>
                }
                onClick={() => {
                  if (workspaceId) {
                    onOpen(workspaceId, item.id);
                  }
                }}
              />
            ))}
          </CategoryLandingList>
        </CategoryLandingSection>
      ) : null}
    </CategoryLanding>
  );
}
