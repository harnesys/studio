import { BotIcon, CalendarClockIcon, EarthIcon, FileIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useSelectedWorkspaceIds } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { runAgentCreateFlow } from '@/features/manage-agent';
import { createSchedule, openScheduleConfigDialog } from '@/features/manage-schedule';
import { createWebhook, openWebhookConfigDialog } from '@/features/manage-webhook';
import { studioPath } from '@/shared/config/routes';
import { dialog } from '@/shared/services/overlay';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
import { NewFileDialog } from './new-file-dialog';
export function IdeHome() {
  const workspaceIds = useSelectedWorkspaceIds();
  const workspaceId = workspaceIds[0] ?? null;
  const navigate = useNavigate();
  const agents = useAgentStore(
    useShallow((s) => (workspaceId ? s.items.filter((a) => a.workspaceId === workspaceId) : [])),
  );
  if (!workspaceId) {
    return (
      <CategoryLanding data-testid="ide-home">
        <CategoryLandingEyebrow>CLEAR</CategoryLandingEyebrow>
        <CategoryLandingTitle>No workspace selected</CategoryLandingTitle>
        <CategoryLandingDescription>
          Toggle a workspace tab above or create one from ⋯.
        </CategoryLandingDescription>
      </CategoryLanding>
    );
  }
  return (
    <CategoryLanding data-testid="ide-home">
      <CategoryLandingEyebrow>HOME</CategoryLandingEyebrow>
      <CategoryLandingTitle>Workspace is empty</CategoryLandingTitle>
      <CategoryLandingDescription>
        Open or create something. Tabs will live here with an icon per category.
      </CategoryLandingDescription>
      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Create
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<BotIcon />}
            title="New agent"
            description="Name and a job. Opens as a thread tab."
            onClick={() => {
              void runAgentCreateFlow({ workspaceId, navigate });
            }}
          />
          <CategoryLandingActionCard
            icon={<CalendarClockIcon />}
            title="New schedule"
            description="Cron fires a run."
            onClick={() => {
              void openScheduleConfigDialog(agents, workspaceId).then(async (draft) => {
                if (!draft) {
                  return;
                }
                const schedule = await createSchedule(workspaceId, draft);
                if (schedule) {
                  useIdeStore
                    .getState()
                    .openSchedule(
                      workspaceId,
                      schedule.id,
                      schedule.threadId,
                      schedule.targetAgentId,
                    );
                  void navigate(studioPath.schedule(workspaceId, schedule.id));
                }
              });
            }}
          />
          <CategoryLandingActionCard
            icon={<EarthIcon />}
            title="New webhook"
            description="Inbound trigger for an agent."
            onClick={() => {
              void openWebhookConfigDialog(agents, workspaceId).then(async (draft) => {
                if (!draft) {
                  return;
                }
                const created = await createWebhook(workspaceId, draft);
                if (created) {
                  useIdeStore
                    .getState()
                    .openWebhook(workspaceId, created.id, created.threadId, created.targetAgentId);
                  void navigate(studioPath.webhook(workspaceId, created.id));
                }
              });
            }}
          />
          <CategoryLandingActionCard
            icon={<FileIcon />}
            title="New file"
            description="Create a file at workspace root."
            onClick={() => {
              if (!workspaceId) {
                return;
              }
              void dialog
                .open(NewFileDialog, {
                  title: 'New file',
                  description:
                    'Enter a file name, e.g. notes.md. Use a path like docs/todo.md to create inside a folder.',
                  testId: 'new-file-dialog',
                })
                .then(async (name) => {
                  if (!name || !workspaceId) {
                    return;
                  }
                  const { createWorkspaceFile } = await import('@/shared/api/files');
                  try {
                    await createWorkspaceFile(workspaceId, { path: name.trim(), kind: 'file' });
                    useIdeStore.getState().openFile(workspaceId, name.trim());
                    void navigate(studioPath.file(workspaceId, name.trim()));
                  } catch {}
                });
            }}
          />
        </CategoryLandingActions>
      </div>
    </CategoryLanding>
  );
}
