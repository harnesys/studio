import { BotIcon, CalendarClockIcon, EarthIcon, FileIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useIdeStore } from '@/features/ide';
import { createAgent, openCreateAgentDialog } from '@/features/manage-agent';
import { createSchedule, openCreateScheduleDialog } from '@/features/manage-schedule';
import { createWebhook, openCreateWebhookDialog } from '@/features/manage-webhook';
import { useStudioLocation } from '@/shared/config/location';
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
  const { workspaceId } = useStudioLocation();
  const navigate = useNavigate();
  const agents = useAgentStore(
    useShallow((s) => (workspaceId ? s.items.filter((a) => a.workspaceId === workspaceId) : [])),
  );

  if (!workspaceId) {
    return null;
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
              void openCreateAgentDialog().then(async (draft) => {
                if (!draft || !workspaceId) {
                  return;
                }
                const agent = await createAgent(workspaceId, draft);
                if (!agent) {
                  return;
                }
                const { useThreadStore } = await import('@/entities/thread');
                const thread = useThreadStore.getState().create(agent.id, 'New thread');
                if (thread) {
                  useIdeStore.getState().openThread(workspaceId, agent.id, thread.id);
                  void navigate(studioPath.workspaceThread(workspaceId, agent.id, thread.id));
                } else {
                  void navigate(studioPath.workspaceAgent(workspaceId, agent.id));
                }
              });
            }}
          />
          <CategoryLandingActionCard
            icon={<CalendarClockIcon />}
            title="New schedule"
            description="Cron fires a run."
            onClick={() => {
              void openCreateScheduleDialog(agents).then(async (draft) => {
                if (!draft || !workspaceId) {
                  return;
                }
                const schedule = await createSchedule(workspaceId, draft);
                if (schedule) {
                  useIdeStore.getState().openSchedule(workspaceId, schedule.id);
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
              void openCreateWebhookDialog(agents).then((draft) => {
                if (!draft || !workspaceId) {
                  return;
                }
                const created = createWebhook(workspaceId, draft);
                if (created) {
                  useIdeStore.getState().openWebhook(workspaceId, created.id);
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
                    void navigate(studioPath.files(workspaceId));
                  } catch {}
                });
            }}
          />
        </CategoryLandingActions>
      </div>
    </CategoryLanding>
  );
}
