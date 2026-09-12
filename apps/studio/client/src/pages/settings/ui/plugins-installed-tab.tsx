import type { PluginListItem, PluginLoadDiagnostic } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon, ShieldCheckIcon, ShieldOffIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
import { confirmRemovePlugin, openInstallPluginDialog } from '@/features/manage-plugins';
import {
  enableWorkspacePlugin,
  listPlugins,
  pluginsQuery,
  pluginsQueryKey,
  removePlugin,
  trustPlugin,
  updatePlugin,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';

export function PluginsInstalledTab() {
  const { workspaceId } = useStudioLocation();
  const queryClient = useQueryClient();
  const pluginsListQuery = useQuery(pluginsQuery());
  const items = pluginsListQuery.data ?? [];
  const [expandedName, setExpandedName] = useState<string | null>(null);

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

  const trust = useMutation({
    mutationFn: (input: { name: string; trusted: boolean }) =>
      trustPlugin(input.name, { trusted: input.trusted }),
    onSuccess: async (result) => {
      await invalidatePlugins();
      toast.add({
        title: result.plugin.trusted ? 'Plugin trusted' : 'Plugin untrusted',
        description: result.plugin.name,
      });
    },
  });

  const enable = useMutation({
    mutationFn: (input: { name: string; enabled: boolean }) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return enableWorkspacePlugin(workspaceId, input.name, { enabled: input.enabled });
    },
    onSuccess: async (result, input) => {
      await invalidatePlugins();
      toast.add({
        title: input.enabled ? 'Plugin enabled' : 'Plugin disabled',
        description: result.plugin.name,
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

  const busy = update.isPending || trust.isPending || enable.isPending || remove.isPending;

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
            {items.map((item) => {
              const plugin = item.plugin;
              const expanded = expandedName === plugin.name;
              const enabledHere = workspaceId
                ? plugin.enabledWorkspaceIds.includes(workspaceId)
                : false;
              return (
                <div key={plugin.name} data-testid={`plugin-${plugin.name}`}>
                  <ConfigEntityCard
                    title={plugin.name}
                    badge={plugin.version ?? plugin.sourceFormat ?? undefined}
                    statusBadge={enabledHere ? 'enabled' : undefined}
                    description={pluginSummary(item)}
                    initials={initialsFromLabel(plugin.name)}
                    monoTitle
                    expanded={expanded}
                    onClick={() => setExpandedName(expanded ? null : plugin.name)}
                    trailing={
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          disabled={!workspaceId || busy}
                          onClick={() =>
                            enable.mutate({ name: plugin.name, enabled: !enabledHere })
                          }
                        >
                          {enabledHere ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70"
                          aria-label={
                            plugin.trusted ? `Untrust ${plugin.name}` : `Trust ${plugin.name}`
                          }
                          disabled={busy}
                          onClick={() =>
                            trust.mutate({ name: plugin.name, trusted: !plugin.trusted })
                          }
                        >
                          {plugin.trusted ? <ShieldOffIcon /> : <ShieldCheckIcon />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70"
                          aria-label={`Update ${plugin.name}`}
                          disabled={busy}
                          onClick={() => update.mutate(plugin.name)}
                        >
                          <RefreshCwIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70"
                          aria-label={`Remove ${plugin.name}`}
                          disabled={busy}
                          onClick={() => {
                            void confirmRemovePlugin(plugin.name).then((confirmed) => {
                              if (confirmed) {
                                remove.mutate(plugin.name);
                              }
                            });
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    }
                  >
                    <PluginDetail item={item} />
                  </ConfigEntityCard>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function pluginSummary(item: PluginListItem): string {
  const { plugin } = item;
  const parts = [
    `${plugin.skillCount} skills`,
    `${plugin.hookCount} hooks`,
    `${plugin.agentCount} agents`,
    `${plugin.commandCount} commands`,
  ];
  const diagnosticHint = diagnosticSummary(item.diagnostics);
  if (diagnosticHint) {
    parts.push(diagnosticHint);
  }
  return parts.join(' · ');
}

function PluginDetail({ item }: { item: PluginListItem }) {
  const plugin = item.plugin;
  return (
    <div className="flex flex-col gap-2">
      <DetailBlock
        label="Inventory"
        items={[
          `skills: ${plugin.skillCount}`,
          `hooks: ${plugin.hookCount}`,
          `mcp: ${plugin.mcpServerCount}`,
          `agents: ${plugin.agentCount}`,
          `commands: ${plugin.commandCount}`,
        ]}
      />
      <DetailBlock
        label="Source"
        items={[
          plugin.source,
          plugin.revision ? `revision ${plugin.revision.slice(0, 12)}` : 'revision unknown',
          ...(plugin.registryId ? [`registry ${plugin.registryId}`] : []),
          ...(plugin.sourceFormat ? [`format ${plugin.sourceFormat}`] : []),
          plugin.trusted ? 'trusted' : 'untrusted',
        ]}
      />
      <DetailBlock
        label="Diagnostics"
        items={item.diagnostics.map(formatDiagnostic)}
        emptyText="No diagnostics."
      />
      {plugin.description ? <DetailBlock label="Description" items={[plugin.description]} /> : null}
    </div>
  );
}

function DetailBlock({
  label,
  items,
  emptyText = 'None.',
}: {
  label: string;
  items: string[];
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-xs">{emptyText}</p>
      ) : (
        items.map((entry) => (
          <p key={entry} className="wrap-anywhere text-muted-foreground text-xs">
            {entry}
          </p>
        ))
      )}
    </div>
  );
}

function formatDiagnostic(diagnostic: PluginLoadDiagnostic): string {
  const path = diagnostic.path ? ` · ${diagnostic.path}` : '';
  return `${diagnostic.level}: ${diagnostic.code} — ${diagnostic.message}${path}`;
}

function diagnosticSummary(diagnostics: PluginLoadDiagnostic[]): string | undefined {
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
