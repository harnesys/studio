import type { PluginDiagnostic, PluginListItem } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';

import { confirmRemovePlugin, openInstallPluginDialog } from '@/features/manage-plugins';
import {
  enableWorkspacePlugin,
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

  const busy = update.isPending || enable.isPending || remove.isPending;

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
              const expanded = expandedName === item.plugin.name;
              const enabledHere = workspaceId
                ? item.plugin.enabledWorkspaceIds.includes(workspaceId)
                : false;
              return (
                <div key={item.plugin.name} className="flex flex-col">
                  <PluginRow
                    item={item}
                    enabledHere={enabledHere}
                    busy={busy}
                    expanded={expanded}
                    canEnable={Boolean(workspaceId)}
                    onToggle={() =>
                      setExpandedName((current) =>
                        current === item.plugin.name ? null : item.plugin.name,
                      )
                    }
                    onEnable={() =>
                      enable.mutate({ name: item.plugin.name, enabled: !enabledHere })
                    }
                    onUpdate={() => update.mutate(item.plugin.name)}
                    onRemove={() => {
                      void confirmRemovePlugin(item.plugin.name).then((confirmed) => {
                        if (confirmed) {
                          remove.mutate(item.plugin.name);
                        }
                      });
                    }}
                  />
                  {expanded ? <PluginDetail item={item} /> : null}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function PluginRow({
  item,
  enabledHere,
  busy,
  expanded,
  canEnable,
  onToggle,
  onEnable,
  onUpdate,
  onRemove,
}: {
  item: PluginListItem;
  enabledHere: boolean;
  busy: boolean;
  expanded: boolean;
  canEnable: boolean;
  onToggle: () => void;
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
            <Badge variant="outline" className="font-mono">
              {plugin.format}
            </Badge>
          ) : null}
          {enabledHere ? (
            <Badge variant="secondary" className="font-mono">
              enabled
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono">
              off
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
        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${plugin.name}`}
        onClick={onToggle}
      >
        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        disabled={!canEnable || busy}
        onClick={onEnable}
      >
        {enabledHere ? 'Disable' : 'Enable'}
      </Button>
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

function PluginDetail({ item }: { item: PluginListItem }) {
  const plugin = item.plugin;
  return (
    <div className="mb-1 ml-2 flex flex-col gap-2 border-l pl-3">
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

function formatDiagnostic(diagnostic: PluginDiagnostic): string {
  const path = diagnostic.path ? ` · ${diagnostic.path}` : '';
  return `${diagnostic.level}: ${diagnostic.code} — ${diagnostic.message}${path}`;
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
