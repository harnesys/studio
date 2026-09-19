import { CalendarClockIcon, PlusIcon, WebhookIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import type { Webhook } from '@/entities/webhook';
import { useIdeStore } from '@/features/ide';
import { createSchedule, openScheduleConfigDialog } from '@/features/manage-schedule';
import { createWebhook, openWebhookConfigDialog } from '@/features/manage-webhook';
import { studioPath } from '@/shared/config/routes';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

type PickerData = Record<string, never>;

type PickerChoice = 'scheduler' | 'webhook';

function AutomationCreatePickerDialog({
  onResolve,
}: DialogComponentProps<PickerChoice | null, PickerData>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="automation-create-scheduler"
          onClick={() => onResolve?.('scheduler')}
          className="flex min-h-24 flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
        >
          <CalendarClockIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Scheduler</span>
          <span className="text-muted-foreground text-xs">Run an agent on a cron</span>
        </button>
        <button
          type="button"
          data-testid="automation-create-webhook"
          onClick={() => onResolve?.('webhook')}
          className="flex min-h-24 flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
        >
          <WebhookIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Webhook</span>
          <span className="text-muted-foreground text-xs">Trigger from an HTTP endpoint</span>
        </button>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}

function openAutomationCreatePicker() {
  return dialog.open(AutomationCreatePickerDialog, {
    title: 'New automation',
    description: 'Choose how the agent should be triggered.',
    className: 'sm:max-w-md',
    testId: 'automation-create-picker',
  });
}

export function AutomationsSectionCreateButton({
  workspaceId,
  agents,
  onDone,
}: {
  workspaceId: string;
  agents: Agent[];
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const workspaceAgents = agents.filter((item) => item.workspaceId === workspaceId);

  const openWebhookTab = (item: Webhook) => {
    const agentId = useThreadStore.getState().byId(item.threadId)?.agentId;
    useIdeStore
      .getState()
      .openWebhook(workspaceId, item.id, item.threadId, agentId ?? item.targetAgentId);
    void navigate(studioPath.webhook(workspaceId, item.id));
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="New automation"
      aria-label="New automation"
      data-testid={`automations-create-${workspaceId}`}
      onClick={() => {
        void (async () => {
          const choice = await openAutomationCreatePicker();
          if (!choice) {
            return;
          }
          if (choice === 'scheduler') {
            const draft = await openScheduleConfigDialog(workspaceAgents, workspaceId);
            if (!draft) {
              return;
            }
            const created = await createSchedule(workspaceId, draft);
            if (created) {
              useIdeStore
                .getState()
                .openSchedule(workspaceId, created.id, created.threadId, created.targetAgentId);
              void navigate(studioPath.schedule(workspaceId, created.id));
              onDone?.();
            }
            return;
          }
          const draft = await openWebhookConfigDialog(workspaceAgents, workspaceId);
          if (!draft) {
            return;
          }
          const created = await createWebhook(workspaceId, draft);
          if (created) {
            openWebhookTab(created);
            onDone?.();
          }
        })();
      }}
    >
      <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New automation</span>
    </Button>
  );
}
