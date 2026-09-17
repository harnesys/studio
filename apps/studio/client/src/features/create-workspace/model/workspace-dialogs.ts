import type { Workspace } from '@/entities/workspace';
import { alert, dialog } from '@/shared/services/overlay';

import { WorkspaceDetailsDialog } from '../ui/workspace-details-dialog';

export function openCreateWorkspaceDialog() {
  return dialog.open(WorkspaceDetailsDialog, {
    title: 'New workspace',
    description:
      'A workspace is a folder on disk: agents, threads, schedules, and webhooks for that tree.',
    className: 'sm:max-w-md',
    testId: 'create-workspace-dialog',
  });
}

export function confirmDeleteWorkspace(workspace: Workspace) {
  return alert.confirm({
    title: `Remove ${workspace.name} from host?`,
    description:
      'Stops listing this node on the host. The folder on disk stays. Studio does not wipe workspace files here.',
    confirmText: 'Remove from host',
    variant: 'destructive',
    testId: 'delete-workspace-dialog',
  });
}
