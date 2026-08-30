import type { DiscoveredModel, ModelRecord, ProviderModelPublic } from '@studio/shared';

import { alert, dialog } from '@/shared/services/overlay';

import { AddModelDialog, EditModelDialog } from '../ui/model-dialogs';
import { modelFieldsFrom } from './model-fields';

export function openEditModelDialog(row: {
  name?: string;
  saved: boolean;
  stored?: ProviderModelPublic | ModelRecord;
  found?: DiscoveredModel;
}) {
  const modelName = row.stored?.name ?? row.found?.name ?? row.name ?? '';
  return dialog.open(EditModelDialog, {
    title: row.saved ? 'Edit model' : 'Fill model fields',
    description:
      'Limits, cost, modalities and features are host fields. Providers often omit them.',
    className: 'sm:max-w-lg',
    data: {
      modelName,
      confirm: row.saved ? 'Save' : 'Attach',
      initial: modelFieldsFrom(row),
    },
  });
}

export function openAddModelDialog() {
  return dialog.open(AddModelDialog, {
    title: 'Add model',
    description: 'Attach a name the provider did not list.',
    className: 'sm:max-w-lg',
  });
}

export function confirmDetachModel(name: string) {
  return alert.confirm({
    title: `Detach ${name}?`,
    confirmText: 'Detach',
    variant: 'destructive',
  });
}
