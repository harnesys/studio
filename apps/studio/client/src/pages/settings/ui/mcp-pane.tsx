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
              const expandable = Boolean(live);
              const expanded = expandable && expandedId === server.serverId;
              return (
                <div key={server.serverId} data-testid={`mcp-server-${server.serverId}`}>
                  <ConfigEntityCard
                    title={server.serverId}
                    badge={server.transport}
                    statusBadge={server.enabled ? undefined : 'off'}
                    description={serverSummary(server)}
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
                        <div className="flex flex-col gap-1">
                          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                            Tools
                          </p>
                          {live.tools.length === 0 ? (
                            <p className="text-muted-foreground text-xs">
                              No tools on this server.
                            </p>
                          ) : (
                            live.tools.map((tool) => (
                              <div
                                key={tool.name}
                                className="min-w-0 px-1 py-0.5"
                                data-testid={`mcp-tool-${tool.name}`}
                              >
                                <p className="truncate font-mono text-[12px] leading-snug">
                                  {shortToolName(tool.name)}
                                </p>
                                {tool.description ? (
                                  <p className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">
                                    {tool.description}
                                  </p>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                            Resources
                          </p>
                          {live.resources.length === 0 ? (
                            <p className="text-muted-foreground text-xs">No resources exposed.</p>
                          ) : (
                            live.resources.map((resource) => (
                              <div
                                key={resource.uri}
                                className="min-w-0 px-1 py-0.5"
                                data-testid={`mcp-resource-${resource.uri}`}
                              >
                                <p className="truncate font-mono text-[12px] leading-snug">
                                  {resource.name}
                                </p>
                                <p className="wrap-anywhere text-[11px] text-muted-foreground leading-snug">
                                  {[resource.mimeType, resource.uri].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
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

function serverSummary(server: WorkspaceMcpConfigServer): string {
  if (!server.enabled) {
    return `disabled · ${server.toolCount} tools`;
  }
  return `${server.toolCount} tools · ${server.connected ? 'connected' : 'offline'}`;
}

function shortToolName(name: string): string {
  return name.includes('__') ? name.split('__').slice(1).join('__') : name;
}
