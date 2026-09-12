import type { InstallPluginRequest, PluginMutationResponse } from '@harnesys/studio-shared';
import { alert, dialog } from '@/shared/services/overlay';

import {
  AddRegistryDialog,
  InstallCatalogPluginDialog,
  InstallPluginDialog,
} from '../ui/plugin-dialogs';

export function openInstallPluginDialog(prefill?: InstallPluginRequest) {
  return dialog.open(InstallPluginDialog, {
    title: 'Install plugin',
    description:
      'Clone from `owner/repo` or a git URL. Use subdirectory when the plugin is not at the repo root.',
    className: 'sm:max-w-lg',
    testId: 'install-plugin-dialog',
    ...(prefill ? { data: prefill } : {}),
  });
}

export function openInstallCatalogPluginDialog(input: { registryId: string; pluginName: string }) {
  return dialog.open(InstallCatalogPluginDialog, {
    title: `Install ${input.pluginName}`,
    description: 'Install from the connected marketplace catalog.',
    className: 'sm:max-w-lg',
    testId: 'install-catalog-plugin-dialog',
    data: input,
  }) as Promise<PluginMutationResponse | null>;
}

export function openAddRegistryDialog() {
  return dialog.open(AddRegistryDialog, {
    title: 'Add marketplace',
    description: 'Connect a Claude-compatible marketplace (`marketplace.json`).',
    className: 'sm:max-w-lg',
    testId: 'add-registry-dialog',
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

export function confirmRemoveRegistry(name: string) {
  return alert.confirm({
    title: `Remove marketplace ${name}?`,
    description: 'Removes the catalog source. Already installed plugins stay installed.',
    confirmText: 'Remove',
    variant: 'destructive',
    testId: 'remove-registry-dialog',
  });
}
