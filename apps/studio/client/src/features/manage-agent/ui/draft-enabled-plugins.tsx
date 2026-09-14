import type { PluginListItem } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { pluginsQuery } from '@/shared/api';
import { Row, RowChip, RowList } from '@/shared/ui/capability-rows';
import { Switch } from '@/shared/ui/switch';

/**
 * Per-agent plugin allowlist (closed world): the saved map names the plugins
 * the agent may use; a missing key is off and an empty map means no plugins.
 * A saved map should be complete over the installed catalog (registry
 * semantics: a sparse map disables every plugin missing from it).
 *
 * Controlled by the dialog's capabilities draft; the dialog turns a disabled
 * plugin's skills/servers/tools off in the same patch.
 */
export function DraftEnabledPlugins({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const query = useQuery(pluginsQuery());
  const items = query.data ?? [];

  function toggle(name: string, enable: boolean) {
    const next: Record<string, boolean> = {};
    for (const item of items) {
      next[item.plugin.name] = value[item.plugin.name] ?? false;
    }
    next[name] = enable;
    onChange(next);
  }

  if (!query.isPending && items.length === 0) {
    return <p className="py-6 text-center text-muted-foreground text-sm">No plugins installed.</p>;
  }

  return (
    <RowList data-testid="draft-enabled-plugins">
      {items.map((item) => (
        <PluginRow
          key={item.plugin.name}
          item={item}
          workspaceId={workspaceId}
          enabled={value[item.plugin.name] ?? false}
          onToggle={(enable) => toggle(item.plugin.name, enable)}
        />
      ))}
    </RowList>
  );
}

function PluginRow({
  item,
  workspaceId,
  enabled,
  onToggle,
}: {
  item: PluginListItem;
  workspaceId: string;
  enabled: boolean;
  onToggle: (enable: boolean) => void;
}) {
  const plugin = item.plugin;
  const workspaceEnabled = plugin.enabledWorkspaceIds.includes(workspaceId);
  const inventory = `${plugin.skillCount} skills · ${plugin.hookCount} hooks · ${plugin.agentCount} agents · ${plugin.commandCount} commands`;
  return (
    <Row
      testId={`draft-plugin-${plugin.name}`}
      title={plugin.name}
      muted={!enabled}
      summary={
        workspaceEnabled
          ? inventory
          : 'Disabled in workspace — enable it in Settings → Plugins first'
      }
      chips={
        <>
          <RowChip>{plugin.format === 'unknown' ? 'unattested' : plugin.format}</RowChip>
          {!workspaceEnabled ? <RowChip tone="danger">workspace off</RowChip> : null}
        </>
      }
      actions={
        <Switch size="sm" checked={enabled} onCheckedChange={(next) => onToggle(Boolean(next))} />
      }
      alwaysShowActions
    />
  );
}
