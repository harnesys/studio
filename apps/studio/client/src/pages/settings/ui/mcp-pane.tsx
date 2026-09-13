import type { UpsertWorkspaceMcpServerRequest } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, PuzzleIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { pluginStatusBadge, pluginStatusText } from '@/features/manage-agent';
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

import {
  Row,
  RowChip,
  RowField,
  RowHeader,
  RowItem,
  RowList,
  RowSection,
} from './capability-rows';

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
            {servers.map((server) => {
              const live = liveServers.get(server.serverId);
              const { origin } = server;
              const plugin = origin.kind === 'plugin';
              const statusChip =
                plugin && origin.status !== 'native' ? pluginStatusBadge(origin) : undefined;
              const expanded = expandedId === server.serverId;
              return (
                <Row
                  key={server.serverId}
                  testId={`mcp-server-${server.serverId}`}
                  title={
                    plugin ? pluginServerTitle(server.serverId, origin.pluginName) : server.serverId
                  }
                  muted={!server.enabled}
                  meta={server.transport}
                  status={
                    !server.enabled
                      ? { tone: 'off', label: 'Disabled' }
                      : live
                        ? live.connected
                          ? { tone: 'live', label: 'Connected' }
                          : { tone: 'danger', label: 'Offline' }
                        : { tone: 'idle', label: 'Not connected' }
                  }
                  chips={
                    <>
                      {plugin ? (
                        <RowChip testId="mcp-origin-chip">
                          <PuzzleIcon className="size-2.5" />
                          {origin.pluginName}
                        </RowChip>
                      ) : null}
                      {statusChip ? (
                        <RowChip tone={statusChip === 'invalid' ? 'danger' : 'accent'}>
                          {statusChip}
                        </RowChip>
                      ) : null}
                    </>
                  }
                  summary={
                    plugin && statusChip
                      ? pluginStatusText(origin)
                      : `${server.toolCount} ${server.toolCount === 1 ? 'tool' : 'tools'}${
                          live?.resources.length ? ` · ${live.resources.length} resources` : ''
                        }${!server.enabled ? ' · disabled in .harnesys/mcp.json' : ''}`
                  }
                  onToggle={() =>
                    setExpandedId((current) => (current === server.serverId ? null : server.serverId))
                  }
                  expanded={expanded}
                  actions={
                    plugin ? undefined : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-xs"
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
                    )
                  }
                >
                  {!plugin ? (
                    <RowSection label="Connection">
                      {server.transport === 'stdio' ? (
                        <RowField
                          label="Command"
                          value={[server.command, ...(server.args ?? [])].filter(Boolean).join(' ')}
                        />
                      ) : (
                        <RowField label="URL" value={server.url} />
                      )}
                      {server.env && Object.keys(server.env).length > 0 ? (
                        <RowField label="Env" value={Object.keys(server.env).join(', ')} />
                      ) : null}
                      {server.headers && Object.keys(server.headers).length > 0 ? (
                        <RowField label="Headers" value={Object.keys(server.headers).join(', ')} />
                      ) : null}
                    </RowSection>
                  ) : null}
                  {live ? (
                    <>
                      <RowSection label="Tools" count={live.tools.length}>
                        {live.tools.length === 0 ? (
                          <p className="px-1 text-muted-foreground text-xs">
                            No tools on this server.
                          </p>
                        ) : (
                          live.tools.map((tool) => (
                            <RowItem
                              key={tool.name}
                              testId={`mcp-tool-${tool.name}`}
                              title={shortToolName(tool.name)}
                              description={tool.description}
                            />
                          ))
                        )}
                      </RowSection>
                      <RowSection label="Resources" count={live.resources.length}>
                        {live.resources.length === 0 ? (
                          <p className="px-1 text-muted-foreground text-xs">
                            No resources exposed.
                          </p>
                        ) : (
                          live.resources.map((resource) => (
                            <RowItem
                              key={resource.uri}
                              testId={`mcp-resource-${resource.uri}`}
                              title={resource.name}
                              description={[resource.mimeType, resource.uri]
                                .filter(Boolean)
                                .join(' · ')}
                            />
                          ))
                        )}
                      </RowSection>
                    </>
                  ) : null}
                  {!live && !plugin ? (
                    <RowSection label="Live status">
                      <p className="px-1 text-muted-foreground text-xs">
                        {server.enabled
                          ? 'Not loaded in this session — reload to connect.'
                          : 'Disabled — enable it to load tools.'}
                      </p>
                    </RowSection>
                  ) : null}
                </Row>
              );
            })}
          </RowList>
        ))}
    </div>
  );
}

function pluginServerTitle(serverId: string, pluginName: string): string {
  const prefix = `plugin:${pluginName}:`;
  return serverId.startsWith(prefix) ? serverId.slice(prefix.length) : serverId;
}

function shortToolName(name: string): string {
  return name.includes('__') ? name.split('__').slice(1).join('__') : name;
}
