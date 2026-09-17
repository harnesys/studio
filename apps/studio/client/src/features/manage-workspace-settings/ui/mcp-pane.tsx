import type { UpsertWorkspaceMcpServerRequest } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';

import {
  confirmDeleteMcpServer,
  McpServerRow,
  openAddMcpServerDialog,
  openEditMcpServerDialog,
} from '@/features/manage-workspace-mcp';
import {
  approvePluginServer,
  deleteWorkspaceMcpServer,
  pluginsQueryKey,
  reloadWorkspaceMcp,
  restartWorkspaceMcpServer,
  setWorkspaceMcpServerState,
  upsertWorkspaceMcpServer,
  workspaceMcpConfigQuery,
  workspaceMcpConfigQueryKey,
  workspaceMcpQuery,
  workspaceMcpQueryKey,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { RowHeader, RowList } from '@/shared/ui/capability-rows';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';
export function McpPane({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    ...workspaceMcpConfigQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const servers = configQuery.data?.servers ?? [];
  const liveQuery = useQuery({
    ...workspaceMcpQuery(workspaceId),
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

  const approve = useMutation({
    mutationFn: (input: { pluginName: string; serverId: string }) =>
      approvePluginServer(input.pluginName, { serverId: input.serverId }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey });
      await invalidateMcp();
      toast.add({ title: 'Server approved', description: input.serverId });
    },
    onError: (error) => {
      toast.add({
        title: 'Approve failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const setState = useMutation({
    mutationFn: (input: { serverId: string; enabled: boolean }) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return setWorkspaceMcpServerState(workspaceId, input.serverId, {
        enabled: input.enabled,
      });
    },
    onSuccess: async (result, input) => {
      if (workspaceId) {
        queryClient.setQueryData(workspaceMcpConfigQueryKey(workspaceId), result);
        await queryClient.invalidateQueries({ queryKey: workspaceMcpQueryKey(workspaceId) });
      }
      toast.add({
        title: input.enabled ? 'MCP server started' : 'MCP server stopped',
        description: input.serverId,
      });
    },
    onError: (error) => {
      toast.add({
        title: 'State change failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const restart = useMutation({
    mutationFn: (serverId: string) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return restartWorkspaceMcpServer(workspaceId, serverId);
    },
    onSuccess: async (result, serverId) => {
      if (workspaceId) {
        queryClient.setQueryData(workspaceMcpConfigQueryKey(workspaceId), result);
        await queryClient.invalidateQueries({ queryKey: workspaceMcpQueryKey(workspaceId) });
      }
      toast.add({ title: 'MCP server restarted', description: serverId });
    },
    onError: (error) => {
      toast.add({
        title: 'Restart failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const stateBusy = setState.isPending || restart.isPending || approve.isPending;
  const editBusy = upsert.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-2" data-testid="mcp-pane">
      <RowHeader label="Servers" count={configQuery.isPending ? undefined : servers.length}>
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
      </RowHeader>

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
          <RowList>
            {servers.map((server) => (
              <McpServerRow
                key={server.serverId}
                server={server}
                live={liveServers.get(server.serverId)}
                expanded={expandedId === server.serverId}
                onToggle={() =>
                  setExpandedId((current) => (current === server.serverId ? null : server.serverId))
                }
                stateBusy={stateBusy}
                editBusy={editBusy}
                onApprove={(pluginName, pointer) =>
                  approve.mutate({ pluginName, serverId: pointer })
                }
                onSetState={(serverId, enabled) => setState.mutate({ serverId, enabled })}
                onRestart={(serverId) => restart.mutate(serverId)}
                onEdit={(row) => {
                  void openEditMcpServerDialog(row).then((draft) => {
                    if (!draft) {
                      return;
                    }
                    upsert.mutate(draft);
                  });
                }}
                onDelete={(serverId) => {
                  void confirmDeleteMcpServer(serverId).then((confirmed) => {
                    if (confirmed) {
                      remove.mutate(serverId);
                    }
                  });
                }}
              />
            ))}
          </RowList>
        ))}
    </div>
  );
}
