import type { PinRecord } from '@harnesys/studio-shared';

import { alert, dialog } from '@/shared/services/overlay';

import { AddPinDialog, EditPinDialog } from '../ui/pin-dialogs';

export function openAddPinDialog() {
  return dialog.open(AddPinDialog, {
    title: 'Add pin',
    description: 'Pinned fact for this agent (human source).',
    className: 'sm:max-w-lg',
    testId: 'add-pin-dialog',
  });
}

export function openEditPinDialog(pin: PinRecord) {
  return dialog.open(EditPinDialog, {
    title: 'Edit pin',
    description: `Update pin \`${pin.key}\`.`,
    className: 'sm:max-w-lg',
    testId: 'edit-pin-dialog',
    data: { pin },
  });
}

export function confirmDeletePin(key: string) {
  return alert.confirm({
    title: `Delete pin ${key}?`,
    description: 'Removes this pinned fact from the agent.',
    confirmText: 'Delete',
    variant: 'destructive',
    testId: 'delete-pin-dialog',
  });
}
