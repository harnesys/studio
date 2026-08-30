import type { UpsertWorkspaceMcpServerRequest, WorkspaceMcpConfigServer } from '@studio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';

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
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';
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
                No servers in `.studio/mcp.json`. Add a server to connect tools.
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
                <div key={server.serverId} className="flex flex-col">
                  <McpServerRow
                    server={server}
                    busy={upsert.isPending || remove.isPending}
                    expanded={expanded}
                    expandable={expandable}
                    onToggle={() =>
                      setExpandedId((current) =>
                        current === server.serverId ? null : server.serverId,
                      )
                    }
                    onEdit={() => {
                      void openEditMcpServerDialog(server).then((draft) => {
                        if (!draft) {
                          return;
                        }
                        upsert.mutate(draft);
                      });
                    }}
                    onDelete={() => {
                      void confirmDeleteMcpServer(server.serverId).then((confirmed) => {
                        if (confirmed) {
                          remove.mutate(server.serverId);
                        }
                      });
                    }}
                  />
                  {expanded && live ? (
                    <div className="mb-1 ml-8 flex flex-col gap-2 border-l pl-3">
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
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function McpServerRow({
  server,
  busy,
  expanded,
  expandable,
  onToggle,
  onEdit,
  onDelete,
}: {
  server: WorkspaceMcpConfigServer;
  busy: boolean;
  expanded: boolean;
  expandable: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = connectionStatus(server);

  return (
    <div
      className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
      data-testid={`mcp-server-${server.serverId}`}
    >
      <StatusDot tone={status.tone} label={status.text} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm">{server.serverId}</span>
          <Badge variant="secondary" className="font-mono">
            {server.transport}
          </Badge>
          {server.enabled ? null : (
            <Badge variant="outline" className="font-mono">
              off
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {status.text}
          {server.connected ? ` · ${server.toolCount} tools` : null}
        </p>
      </div>
      {expandable ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${server.serverId}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Edit ${server.serverId}`}
        disabled={busy}
        onClick={onEdit}
      >
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${server.serverId}`}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
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

function connectionStatus(server: WorkspaceMcpConfigServer): {
  tone: StatusDotTone;
  text: string;
} {
  if (!server.enabled) {
    return { tone: 'off', text: 'disabled' };
  }
  if (server.connected) {
    return { tone: 'live', text: 'connected' };
  }
  return { tone: 'idle', text: 'disconnected' };
}
