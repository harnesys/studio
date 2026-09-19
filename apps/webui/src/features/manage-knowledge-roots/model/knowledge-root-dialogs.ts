import { alert, dialog } from '@/shared/services/overlay';
import { AddKnowledgeRootDialog } from '../ui/knowledge-root-dialogs';
export function openAddKnowledgeRootDialog() {
  return dialog.open(AddKnowledgeRootDialog, {
    title: 'Add knowledge root',
    description: 'Index text files under this path relative to the workspace.',
    className: 'sm:max-w-lg',
    testId: 'add-knowledge-root-dialog',
  });
}
export function confirmDeleteKnowledgeRoot(path: string) {
  return alert.confirm({
    title: `Remove ${path}?`,
    description: 'Drops this root from the index list. Reindex to refresh chunks.',
    confirmText: 'Remove',
    variant: 'destructive',
    testId: 'delete-knowledge-root-dialog',
  });
}
