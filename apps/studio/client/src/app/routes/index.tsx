import type { RouteObject } from 'react-router';
import { Navigate, Outlet, useParams } from 'react-router';

import { useWorkspaces } from '@/entities/workspace';
import { DeskSync } from '@/features/desk';
import { KnowledgeIndexSync } from '@/features/manage-knowledge-index';
import { AgentLandingPage } from '@/pages/agent-landing';
import { SettingsPage } from '@/pages/settings';
import { ChatWorkspace, WorkspacePage } from '@/pages/workspace';
import { WorkspaceGatePage } from '@/pages/workspace-gate';
import { resolveStudioEntry, studioPath } from '@/shared/config/routes';
import { OverlayProvider } from '@/shared/services/overlay';
import { FilesMain } from '@/widgets/files-main';
import { SchedulesList } from '@/widgets/schedules-list';
import { ThreadsList } from '@/widgets/threads-list';
import { WebhooksList } from '@/widgets/webhooks-list';

function StudioLayout() {
  return (
    <>
      <DeskSync />
      <KnowledgeIndexSync />
      <OverlayProvider />
      <Outlet />
    </>
  );
}

function WorkspaceGuard() {
  const { workspaceId } = useParams();
  const workspacesQuery = useWorkspaces();
  const workspace = workspacesQuery.data?.find((item) => item.id === workspaceId) ?? null;
  const entry = resolveStudioEntry({
    selectedWorkspaceId: workspaceId ?? null,
    hasWorkspace: workspace !== null,
    workspacesStatus: workspacesQuery.status,
  });

  if (entry === 'opening') {
    return <OpeningDesk />;
  }
  if (entry === 'gate') {
    return <Navigate to={studioPath.gate} replace />;
  }
  return <Outlet />;
}

function OpeningDesk() {
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background p-6"
      data-testid="workspace-opening"
    >
      <p className="text-muted-foreground text-sm">Opening workspace…</p>
    </div>
  );
}

const routes: RouteObject[] = [
  {
    element: <StudioLayout />,
    children: [
      {
        index: true,
        element: <WorkspaceGatePage />,
      },
      {
        path: 'w/:workspaceId',
        element: <WorkspaceGuard />,
        children: [
          {
            element: <WorkspacePage />,
            children: [
              { index: true, element: <ChatWorkspace /> },
              { path: 'agent/:agentId/threads', element: <ThreadsList /> },
              { path: 'agent/:agentId/:threadId', element: <ChatWorkspace /> },
              { path: 'schedules', element: <SchedulesList /> },
              { path: 'schedules/:scheduleId', element: <SchedulesList /> },
              { path: 'webhooks', element: <WebhooksList /> },
              { path: 'webhooks/:webhookId', element: <WebhooksList /> },
              { path: 'files', element: <FilesMain /> },
            ],
          },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/:category', element: <SettingsPage /> },
          { path: 'settings/:category/:providerId', element: <SettingsPage /> },
          { path: 'agent/:agentId', element: <AgentLandingPage /> },
        ],
      },
      { path: '*', element: <Navigate to={studioPath.gate} replace /> },
    ],
  },
];

export default routes;
