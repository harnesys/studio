import type {
  InstallPluginRequest,
  PluginMutationResponse,
  PluginSummary,
} from '@harnesys/studio-shared';
import { alert, dialog } from '@/shared/services/overlay';
import {
  AddRegistryDialog,
  InstallCatalogPluginDialog,
  InstallPluginDialog,
} from '../ui/plugin-dialogs';
import { EnablePluginDialog } from '../ui/plugin-enable-dialog';
export function openInstallPluginDialog(workspaceId: string, prefill?: InstallPluginRequest) {
  return dialog.open(InstallPluginDialog, {
    title: 'Install plugin',
    description:
      'Clone from `owner/repo` or a git URL. Use subdirectory when the plugin is not at the repo root.',
    className: 'sm:max-w-lg',
    testId: 'install-plugin-dialog',
    data: { workspaceId, prefill },
  });
}
export function openInstallCatalogPluginDialog(input: {
  workspaceId: string;
  registryId: string;
  pluginName: string;
}) {
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
export function openEnablePluginDialog(plugin: PluginSummary, workspaceId: string) {
  return dialog.open(EnablePluginDialog, {
    title: `Configure ${plugin.name}`,
    description: 'Review components, grant classes and configure user settings.',
    className: 'sm:max-w-lg',
    testId: 'enable-plugin-dialog',
    data: { plugin, workspaceId },
  }) as Promise<PluginSummary | null>;
}
export function confirmRemovePlugin(name: string) {
  return alert.confirm({
    title: `Remove ${name}?`,
    description:
      'Removes the install from this node. Shared host checkout is deleted only when no other node uses it.',
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
