import type {
  UpsertWorkspaceMcpServerRequest,
  WorkspaceMcpConfigServer,
} from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
import {
  confirmDeleteMcpServer,
  openAddMcpServerDialog,
  openEditMcpServerDialog,
} from '@/features/manage-workspace-mcp';
import {
  deleteWorkspaceMcpServer,
  reloadWorkspaceMcp,
  upsertWorkspaceMcpServer,
  workspaceMcpConfigQuery,
  workspaceMcpConfigQueryKey,
  workspaceMcpQuery,
  workspaceMcpQueryKey,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';

export function McpPane() {
  const { workspaceId } = useStudioLocation();
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    ...workspaceMcpConfigQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const servers = configQuery.data?.servers ?? [];
  const liveQuery = useQuery({
    ...workspaceMcpQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const liveServers = new Map(
    (liveQuery.data?.servers ?? []).map((server) => [server.serverId, server]),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function invalidateMcp() {
    if (!workspaceId) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceMcpConfigQueryKey(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: workspaceMcpQueryKey(workspaceId) }),
    ]);
  }

  const reload = useMutation({
    mutationFn: () => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return reloadWorkspaceMcp(workspaceId);
    },
    onSuccess: async (result) => {
      if (!workspaceId) {
        return;
      }
      queryClient.setQueryData(workspaceMcpConfigQueryKey(workspaceId), result);
      await queryClient.invalidateQueries({ queryKey: workspaceMcpQueryKey(workspaceId) });
      toast.add({ title: 'MCP reloaded' });
    },
  });

  const upsert = useMutation({
    mutationFn: (input: { serverId: string; body: UpsertWorkspaceMcpServerRequest }) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return upsertWorkspaceMcpServer(workspaceId, input.serverId, input.body);
    },
    onSuccess: async (result) => {
      await invalidateMcp();
      toast.add({ title: 'MCP server saved', description: result.server.serverId });
    },
  });

  const remove = useMutation({
    mutationFn: (serverId: string) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return deleteWorkspaceMcpServer(workspaceId, serverId);
    },
    onSuccess: async (_result, serverId) => {
      await invalidateMcp();
      toast.add({ title: 'MCP server deleted', description: serverId });
    },
  });

  return (
    <div className="flex flex-col gap-4" data-testid="mcp-pane">
      <div className="flex h-8 items-center gap-1">
        <p className="font-medium text-sm">Servers</p>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!workspaceId || reload.isPending}
            onClick={() => reload.mutate()}
          >
            <RefreshCwIcon />
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!workspaceId || upsert.isPending}
            onClick={() => {
              void openAddMcpServerDialog().then((draft) => {
                if (!draft) {
                  return;
                }
                upsert.mutate(draft);
              });
            }}
          >
            <PlusIcon />
            Add server
          </Button>
        </div>
      </div>

      {configQuery.isPending && (
        <p className="text-muted-foreground text-sm">Loading MCP config…</p>
      )}
      {!configQuery.isPending &&
        (servers.length === 0 ? (
          <Empty className="min-h-0 border-0 py-8">
            <EmptyHeader>
              <EmptyTitle>No MCP servers</EmptyTitle>
              <EmptyDescription>
                No servers in `.harnesys/mcp.json`. Add a server to connect tools.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {servers.map((server) => {
              const live = liveServers.get(server.serverId);
              const expandable =
                server.connected === true &&
                ((live?.tools.length ?? 0) > 0 || (live?.resources.length ?? 0) > 0);
              const expanded = expandable && expandedId === server.serverId;
              return (
                <div key={server.serverId} data-testid={`mcp-server-${server.serverId}`}>
                  <ConfigEntityCard
                    title={server.serverId}
                    badge={server.transport}
                    statusBadge={server.enabled ? undefined : 'off'}
                    description={serverSummary(server, live)}
                    initials={initialsFromLabel(server.serverId)}
                    monoTitle
                    expanded={expanded}
                    onClick={
                      expandable
                        ? () =>
                            setExpandedId((current) =>
                              current === server.serverId ? null : server.serverId,
                            )
                        : undefined
                    }
                    trailing={
                      <>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70"
                          aria-label={`Edit ${server.serverId}`}
                          disabled={upsert.isPending || remove.isPending}
                          onClick={() => {
                            void openEditMcpServerDialog(server).then((draft) => {
                              if (!draft) {
                                return;
                              }
                              upsert.mutate(draft);
                            });
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70"
                          aria-label={`Delete ${server.serverId}`}
                          disabled={upsert.isPending || remove.isPending}
                          onClick={() => {
                            void confirmDeleteMcpServer(server.serverId).then((confirmed) => {
                              if (confirmed) {
                                remove.mutate(server.serverId);
                              }
                            });
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    }
                  >
                    {live ? (
                      <div className="flex flex-col gap-2">
                        <ServerDetailBlock label="Tools" items={live.tools.map(toToolLine)} />
                        <ServerDetailBlock
                          label="Resources"
                          items={live.resources.map(
                            (resource) =>
                              `${resource.name}${resource.mimeType ? ` · ${resource.mimeType}` : ''} — ${resource.uri}`,
                          )}
                          emptyText="No resources exposed."
                        />
                      </div>
                    ) : null}
                  </ConfigEntityCard>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function serverSummary(
  server: WorkspaceMcpConfigServer,
  live: { tools: unknown[]; resources: unknown[] } | undefined,
): string {
  if (!server.enabled) {
    return 'Disabled';
  }
  if (!server.connected) {
    return 'Disconnected';
  }
  const parts = ['Connected', `${server.toolCount} tools`];
  if (live && live.resources.length > 0) {
    parts.push(`${live.resources.length} resources`);
  }
  return parts.join(' · ');
}

function toToolLine(tool: { name: string; description: string }): string {
  return tool.description ? `${tool.name} — ${tool.description}` : tool.name;
}

function ServerDetailBlock({
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
        items.map((item) => (
          <p key={item} className="wrap-anywhere text-muted-foreground text-xs">
            {item}
          </p>
        ))
      )}
    </div>
  );
}
