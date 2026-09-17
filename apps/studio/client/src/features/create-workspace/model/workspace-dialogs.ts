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

export function openEditWorkspaceDialog(workspace: Workspace) {
  return dialog.open(WorkspaceDetailsDialog, {
    title: 'Edit workspace',
    description: 'Rename the workspace or point it at another folder.',
    className: 'sm:max-w-md',
    testId: 'edit-workspace-dialog',
    data: { workspace },
  });
}

export function confirmDeleteWorkspace(workspace: Workspace) {
  return alert.confirm({
    title: 'Delete workspace',
    description: `Remove ${workspace.name} from Studio? Agents, threads, and messages stored for it are deleted. The folder on disk stays.`,
    confirmText: 'Delete',
    variant: 'destructive',
    testId: 'delete-workspace-dialog',
  });
}
