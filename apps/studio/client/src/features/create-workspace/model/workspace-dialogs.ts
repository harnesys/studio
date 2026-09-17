import { dialog } from '@/shared/services/overlay';

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
