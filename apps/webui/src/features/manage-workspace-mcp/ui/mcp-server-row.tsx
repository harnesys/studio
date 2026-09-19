import type { WorkspaceMcpConfigServer, WorkspaceMcpServer } from '@harnesys/studio-shared';
import {
  CheckIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PuzzleIcon,
  RotateCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { pluginStatusBadge } from '@/features/manage-agent';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowField, RowItem, RowSection } from '@/shared/ui/capability-rows';
import type { StatusDotTone } from '@/shared/ui/status-dot';
import {
  pluginServerPointer,
  pluginServerTitle,
  serverStatusHint,
  serverSummary,
  shortToolName,
} from '../model/mcp-server-status';
export type McpServerRowProps = {
  server: WorkspaceMcpConfigServer;
  live?: WorkspaceMcpServer;
  expanded: boolean;
  onToggle: () => void;
  stateBusy: boolean;
  editBusy: boolean;
  onApprove: (pluginName: string, pointer: string) => void;
  onSetState: (serverId: string, enabled: boolean) => void;
  onRestart: (serverId: string) => void;
  onEdit: (server: WorkspaceMcpConfigServer) => void;
  onDelete: (serverId: string) => void;
};
export function McpServerRow({
  server,
  live,
  expanded,
  onToggle,
  stateBusy,
  editBusy,
  onApprove,
  onSetState,
  onRestart,
  onEdit,
  onDelete,
}: McpServerRowProps) {
  const { origin } = server;
  const plugin = origin.kind === 'plugin';
  const needsApproval =
    plugin &&
    origin.status === 'blocked_by_grant' &&
    origin.inertReason === 'needs_server_approval';
  const statusChip = plugin && origin.status !== 'native' ? pluginStatusBadge(origin) : undefined;
  const toggleable = (plugin && (origin.status === 'native' || server.disabledByUser)) || !plugin;
  const restartable = server.enabled && (!plugin || (plugin && origin.status === 'native'));
  return (
    <Row
      testId={`mcp-server-${server.serverId}`}
      title={plugin ? pluginServerTitle(server.serverId, origin.pluginName) : server.serverId}
      muted={!server.enabled}
      meta={server.transport}
      status={serverStatus(server.enabled, live)}
      chips={
        <>
          {plugin ? (
            <RowChip testId="mcp-origin-chip">
              <PuzzleIcon className="size-2.5" />
              {origin.pluginName}
            </RowChip>
          ) : null}
          {statusChip ? (
            <RowChip tone={statusChip === 'invalid' ? 'danger' : 'accent'}>{statusChip}</RowChip>
          ) : null}
        </>
      }
      summary={serverSummary(server, live, statusChip)}
      onToggle={onToggle}
      expanded={expanded}
      actions={
        <>
          {needsApproval && plugin ? (
            <Button
              variant="outline"
              size="xs"
              disabled={stateBusy}
              onClick={() =>
                onApprove(
                  origin.pluginName,
                  pluginServerPointer(server.serverId, origin.pluginName),
                )
              }
            >
              <CheckIcon />
              Approve
            </Button>
          ) : null}
          {toggleable ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${server.enabled ? 'Stop' : 'Start'} ${server.serverId}`}
              title={server.enabled ? 'Stop' : 'Start'}
              disabled={stateBusy}
              onClick={() => onSetState(server.serverId, !server.enabled)}
            >
              {server.enabled ? <PauseIcon /> : <PlayIcon />}
            </Button>
          ) : null}
          {restartable ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Restart ${server.serverId}`}
              title="Restart"
              disabled={stateBusy}
              onClick={() => onRestart(server.serverId)}
            >
              <RotateCwIcon />
            </Button>
          ) : null}
          {!plugin ? (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Edit ${server.serverId}`}
                disabled={editBusy}
                onClick={() => onEdit(server)}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${server.serverId}`}
                disabled={editBusy}
                onClick={() => onDelete(server.serverId)}
              >
                <Trash2Icon />
              </Button>
            </>
          ) : null}
        </>
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
      ) : (
        <PluginStatusSection
          server={server}
          busy={stateBusy}
          onApprove={() =>
            onApprove(origin.pluginName, pluginServerPointer(server.serverId, origin.pluginName))
          }
        />
      )}
      {live ? (
        <>
          <RowSection label="Tools" count={live.tools.length}>
            {live.tools.length === 0 ? (
              <p className="px-1 text-muted-foreground text-xs">No tools on this server.</p>
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
              <p className="px-1 text-muted-foreground text-xs">No resources exposed.</p>
            ) : (
              live.resources.map((resource) => (
                <RowItem
                  key={resource.uri}
                  testId={`mcp-resource-${resource.uri}`}
                  title={resource.name}
                  description={[resource.mimeType, resource.uri].filter(Boolean).join(' · ')}
                />
              ))
            )}
          </RowSection>
        </>
      ) : null}
      {!live ? (
        <RowSection label="Live status">
          <p className="px-1 text-muted-foreground text-xs">{serverStatusHint(server)}</p>
        </RowSection>
      ) : null}
    </Row>
  );
}
function PluginStatusSection({
  server,
  busy,
  onApprove,
}: {
  server: WorkspaceMcpConfigServer;
  busy: boolean;
  onApprove: () => void;
}) {
  const { origin } = server;
  if (origin.kind !== 'plugin') {
    return null;
  }
  if (server.disabledByUser) {
    return (
      <RowSection label="Status">
        <RowField label="State" value="Stopped by you, approval kept" />
      </RowSection>
    );
  }
  if (origin.status === 'blocked_by_grant' && origin.inertReason === 'needs_server_approval') {
    return (
      <RowSection label="Status">
        <RowField label="State" value="Needs one-time server approval" />
        <div className="px-1 pt-1">
          <Button type="button" variant="outline" size="xs" disabled={busy} onClick={onApprove}>
            <CheckIcon />
            Approve and start
          </Button>
        </div>
      </RowSection>
    );
  }
  if (origin.status === 'blocked_by_grant') {
    return (
      <RowSection label="Status">
        <RowField
          label="State"
          value={`Needs grant${server.requiredGrant ? `: ${server.requiredGrant}` : ''} — allow it in the Plugins tab`}
        />
      </RowSection>
    );
  }
  return null;
}
function serverStatus(
  enabled: boolean,
  live:
    | {
        connected: boolean;
      }
    | undefined,
): {
  tone: StatusDotTone;
  label: string;
} {
  if (!enabled) {
    return { tone: 'off', label: 'Disabled' };
  }
  if (!live) {
    return { tone: 'idle', label: 'Not connected' };
  }
  return live.connected
    ? { tone: 'live', label: 'Connected' }
    : { tone: 'danger', label: 'Offline' };
}
