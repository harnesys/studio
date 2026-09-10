import type { MemoryRecord, SemanticScope } from '@harnesys/studio-shared';

import { alert, dialog } from '@/shared/services/overlay';

import { AddSemanticDialog, EditSemanticDialog } from '../ui/semantic-dialogs';

export function openAddSemanticDialog(scope: SemanticScope = 'long') {
  return dialog.open(AddSemanticDialog, {
    title: 'Add memory',
    description: 'Semantic memory row (human source).',
    className: 'sm:max-w-lg',
    testId: 'add-semantic-dialog',
    data: { scope },
  });
}

export function openEditSemanticDialog(row: MemoryRecord) {
  return dialog.open(EditSemanticDialog, {
    title: 'Edit memory',
    description: row.key ? `Update \`${row.key}\`.` : 'Update this memory row.',
    className: 'sm:max-w-lg',
    testId: 'edit-semantic-dialog',
    data: { row },
  });
}

export function confirmDeleteSemantic(label: string) {
  return alert.confirm({
    title: `Delete ${label}?`,
    description: 'Removes this semantic memory row.',
    confirmText: 'Delete',
    variant: 'destructive',
    testId: 'delete-semantic-dialog',
  });
}
