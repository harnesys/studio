import type { RouteObject } from 'react-router';
import { Navigate, Outlet, useParams } from 'react-router';

import { DeskSync } from '@/features/desk';
import { KnowledgeIndexSync } from '@/features/manage-knowledge-index';
import { SettingsPage } from '@/pages/settings';
import { WorkspacePage } from '@/pages/workspace';
import { parseSettingsCategory, studioPath } from '@/shared/config/routes';
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

function BareWorkspaceRedirect() {
  return <Navigate to={studioPath.desk} replace />;
}

function LegacyWorkspaceRedirect() {
  const params = useParams();
  const rest = params['*'] ?? '';
  const segments = rest.split('/').filter(Boolean);
  const workspaceId = segments[0];
  if (!workspaceId) {
    return <Navigate to={studioPath.desk} replace />;
  }

  const kind = segments[1];
  if (kind === 'thread' && segments[2]) {
    return <Navigate to={studioPath.thread(workspaceId, segments[2])} replace />;
  }
  if (kind === 'file') {
    const filePath = `/${segments.slice(2).join('/')}`;
    return <Navigate to={studioPath.file(workspaceId, filePath)} replace />;
  }
  if (kind === 'settings') {
    const category = segments[2];
    const providerId = segments[3];
    if (category === 'providers' && providerId) {
      return <Navigate to={studioPath.settings('providers', providerId)} replace />;
    }
    if (category) {
      return <Navigate to={studioPath.settings(parseSettingsCategory(category))} replace />;
    }
    return <Navigate to={studioPath.settings()} replace />;
  }

  return <Navigate to={studioPath.desk} replace />;
}

const routes: RouteObject[] = [
  {
    element: <StudioLayout />,
    children: [
      { index: true, element: <WorkspacePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:category', element: <SettingsPage /> },
      { path: 'settings/:category/:providerId', element: <SettingsPage /> },
      {
        path: ':workspaceId',
        element: <WorkspacePage />,
        children: [
          { index: true, element: <BareWorkspaceRedirect /> },
          { path: 'thread/:threadId', element: null },
          { path: 'file/*', element: null },
          { path: 'diff/*', element: null },
          { path: 'schedule/:scheduleId', element: null },
          { path: 'webhook/:webhookId', element: null },
          { path: 'spawn/:threadId/:spawnId', element: null },
        ],
      },
      { path: 'w/*', element: <LegacyWorkspaceRedirect /> },
      { path: '*', element: <Navigate to={studioPath.desk} replace /> },
    ],
  },
];

export default routes;
