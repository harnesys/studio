import { dialog } from '@/shared/services/overlay';
import { NewBranchDialog } from '../ui/git-branch-dialog';
export function openNewBranchDialog(from?: string) {
  return dialog.open(NewBranchDialog, {
    title: from ? `New branch from '${from}'` : 'New branch',
    description: from ? `Create branch from ${from}` : 'Create a new branch from current HEAD.',
    className: 'sm:max-w-md',
    data: { from },
  });
}
