import { alert, dialog } from '@/shared/services/overlay';

import { InstallPluginDialog } from '../ui/plugin-dialogs';

export function openInstallPluginDialog() {
  return dialog.open(InstallPluginDialog, {
    title: 'Install plugin',
    description: 'Clone from `owner/repo` or a git URL into `~/.harnesys/plugins`.',
    className: 'sm:max-w-lg',
    testId: 'install-plugin-dialog',
  });
}

export function confirmRemovePlugin(name: string) {
  return alert.confirm({
    title: `Remove ${name}?`,
    description: 'Deletes the checkout under `~/.harnesys/plugins`. Plugin data is kept.',
    confirmText: 'Remove',
    variant: 'destructive',
    testId: 'remove-plugin-dialog',
  });
}
