import type { RouteObject } from 'react-router';
import { Navigate, Outlet, useParams } from 'react-router';

import { useWorkspaces } from '@/entities/workspace';
import { DeskSync } from '@/features/desk';
import { KnowledgeIndexSync } from '@/features/manage-knowledge-index';
import { SettingsPage } from '@/pages/settings';
import { WorkspacePage } from '@/pages/workspace';
import { WorkspaceGatePage } from '@/pages/workspace-gate';
import { resolveStudioEntry, studioPath } from '@/shared/config/routes';
import { OverlayProvider } from '@/shared/services/overlay';

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
              { index: true, element: null },
              { path: 'thread/:threadId', element: null },
              { path: 'file/*', element: null },
              { path: 'agent/:agentId', element: null },
            ],
          },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/:category', element: <SettingsPage /> },
          { path: 'settings/:category/:providerId', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <Navigate to={studioPath.gate} replace /> },
    ],
  },
];

export default routes;
