import type { PluginDiagnostic, PluginListItem } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';

import {
  confirmRemovePlugin,
  openEnablePluginDialog,
  openInstallPluginDialog,
  openPluginDetailDrawer,
} from '@/features/manage-plugins';
import {
  listPlugins,
  pluginsQuery,
  pluginsQueryKey,
  removePlugin,
  updatePlugin,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';

export function PluginsInstalledTab() {
  const { workspaceId } = useStudioLocation();
  const queryClient = useQueryClient();
  const pluginsListQuery = useQuery(pluginsQuery());
  const items = pluginsListQuery.data ?? [];

  async function invalidatePlugins() {
    await queryClient.invalidateQueries({ queryKey: pluginsQueryKey });
  }

  const reload = useMutation({
    mutationFn: () => listPlugins(),
    onSuccess: (result) => {
      queryClient.setQueryData(pluginsQueryKey, result);
      toast.add({ title: 'Plugins reloaded' });
    },
  });

  const update = useMutation({
    mutationFn: (name: string) => updatePlugin(name),
    onSuccess: async (result) => {
      await invalidatePlugins();
      toast.add({ title: 'Plugin updated', description: result.plugin.name });
    },
    onError: (error) => {
      toast.add({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const remove = useMutation({
    mutationFn: (name: string) => removePlugin(name),
    onSuccess: async (_result, name) => {
      await invalidatePlugins();
      toast.add({ title: 'Plugin removed', description: name });
    },
  });

  const busy = update.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4" data-testid="plugins-installed-tab">
      <div className="flex h-8 items-center gap-1">
        <p className="font-medium text-sm">Installed</p>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={reload.isPending}
            onClick={() => reload.mutate()}
          >
            <RefreshCwIcon />
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              void openInstallPluginDialog().then(async (result) => {
                if (!result) {
                  return;
                }
                await invalidatePlugins();
                toast.add({ title: 'Plugin installed', description: result.plugin.name });
              });
            }}
          >
            <PlusIcon />
            Install from git
          </Button>
        </div>
      </div>

      {pluginsListQuery.isPending && (
        <p className="text-muted-foreground text-sm">Loading plugins…</p>
      )}
      {!pluginsListQuery.isPending &&
        (items.length === 0 ? (
          <Empty className="min-h-0 border-0 py-8">
            <EmptyHeader>
              <EmptyTitle>No plugins yet</EmptyTitle>
              <EmptyDescription>
                Install from git (`obra/superpowers`) or open Discover to install from a
                marketplace.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <PluginRow
                key={item.plugin.name}
                item={item}
                busy={busy}
                canManage={Boolean(workspaceId)}
                enabledHere={
                  Boolean(workspaceId) &&
                  item.plugin.enabledWorkspaceIds.includes(workspaceId ?? '')
                }
                onDetails={() => openPluginDetailDrawer(item, workspaceId ?? '')}
                onEnable={() => {
                  void openEnablePluginDialog(item.plugin, workspaceId ?? '').then(
                    async (result) => {
                      if (!result) {
                        return;
                      }
                      await invalidatePlugins();
                      toast.add({ title: 'Plugin enabled', description: result.name });
                    },
                  );
                }}
                onUpdate={() => update.mutate(item.plugin.name)}
                onRemove={() => {
                  void confirmRemovePlugin(item.plugin.name).then((confirmed) => {
                    if (confirmed) {
                      remove.mutate(item.plugin.name);
                    }
                  });
                }}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

function PluginRow({
  item,
  busy,
  canManage,
  enabledHere,
  onDetails,
  onEnable,
  onUpdate,
  onRemove,
}: {
  item: PluginListItem;
  busy: boolean;
  canManage: boolean;
  enabledHere: boolean;
  onDetails: () => void;
  onEnable: () => void;
  onUpdate: () => void;
  onRemove: () => void;
}) {
  const plugin = item.plugin;
  const diagnosticHint = diagnosticSummary(item.diagnostics);

  return (
    <div
      className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
      data-testid={`plugin-${plugin.name}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm">{plugin.name}</span>
          {plugin.version ? (
            <Badge variant="secondary" className="font-mono">
              {plugin.version}
            </Badge>
          ) : null}
          {plugin.format !== 'unknown' ? (
            <Badge
              variant="outline"
              className="font-mono"
              data-testid={`plugin-format-${plugin.name}`}
            >
              {plugin.format}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono">
              unattested
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {plugin.skillCount} skills · {plugin.hookCount} hooks · {plugin.agentCount} agents ·{' '}
          {plugin.commandCount} commands
          {diagnosticHint ? ` · ${diagnosticHint}` : null}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Show details for ${plugin.name}`}
        onClick={onDetails}
      >
        <ChevronRightIcon />
      </Button>
      {canManage ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={busy}
          onClick={onEnable}
        >
          {enabledHere ? 'Reconfigure' : 'Enable'}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        disabled={busy}
        onClick={onUpdate}
      >
        <RefreshCwIcon />
        Update
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${plugin.name}`}
        disabled={busy}
        onClick={onRemove}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

function diagnosticSummary(diagnostics: PluginDiagnostic[]): string | undefined {
  if (diagnostics.length === 0) {
    return undefined;
  }
  const errors = diagnostics.filter((item) => item.level === 'error').length;
  const warnings = diagnostics.filter((item) => item.level === 'warning').length;
  const parts: string[] = [];
  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}
