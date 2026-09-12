import type { PluginListItem } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { pluginsQuery } from '@/shared/api';
import { Switch } from '@/shared/ui/switch';

import { ConfigEntityCard, initialsFromLabel } from './config-entity-card';

/**
 * Per-agent plugin overrides. Missing key means "inherit workspace set";
 * a saved map must be complete over the installed catalog — a sparse map
 * disables every plugin missing from it (registry semantics).
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
      next[item.plugin.name] = value[item.plugin.name] ?? true;
    }
    next[name] = enable;
    onChange(next);
  }

  if (!query.isPending && items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
        No plugins installed.
      </p>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="draft-enabled-plugins">
      {items.map((item) => (
        <PluginRow
          key={item.plugin.name}
          item={item}
          workspaceId={workspaceId}
          enabled={value[item.plugin.name] ?? true}
          onToggle={(enable) => toggle(item.plugin.name, enable)}
        />
      ))}
    </section>
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
  return (
    <ConfigEntityCard
      title={plugin.name}
      badge={plugin.format}
      description={
        workspaceEnabled
          ? (plugin.description ?? 'Enabled in workspace')
          : 'Disabled in workspace — enable it in Settings → Plugins first'
      }
      initials={initialsFromLabel(plugin.name)}
      monoTitle
      trailing={
        <Switch size="sm" checked={enabled} onCheckedChange={(next) => onToggle(Boolean(next))} />
      }
    />
  );
}
