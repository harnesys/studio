import type { PluginListItem } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { agentCapabilitiesQuery, pluginsQuery, workspaceCapabilitiesQuery } from '@/shared/api';
import { RowList } from '@/shared/ui/capability-rows';
import {
  CORE_SOURCE,
  isSourceGranted,
  overrideOfAssignment,
  type PackAssignmentMap,
  setSourceGrant,
  setToolExposure,
  sourceSections,
  sourceToolRows,
  toggleDisabledTool,
} from '../model/draft-overrides';
import { AgentSourceCard } from './agent-source-card';
import { PackSettingsFields, packHasSettings } from './pack-settings';
export function DraftCapabilities({
  workspaceId,
  agentId,
  isDelegate,
  capabilities,
  enabledPlugins,
  onCapabilitiesChange,
  onPluginsChange,
}: {
  workspaceId: string;
  agentId: string | null;
  isDelegate: boolean;
  capabilities: PackAssignmentMap;
  enabledPlugins: Record<string, boolean>;
  onCapabilitiesChange: (next: PackAssignmentMap) => void;
  onPluginsChange: (next: Record<string, boolean>) => void;
}) {
  const packsQuery = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const pluginsListQuery = useQuery(pluginsQuery(workspaceId));
  const explainQuery = useQuery(agentCapabilitiesQuery(agentId, workspaceId));
  const view = explainQuery.data;
  const catalog = (packsQuery.data?.capabilities ?? []).filter(
    (pack) => !(isDelegate && pack.name === 'agents'),
  );
  const plugins = pluginsListQuery.data ?? [];
  function togglePlugin(name: string, enable: boolean) {
    const next: Record<string, boolean> = {};
    for (const item of pluginsListQuery.data ?? []) {
      next[item.plugin.name] = enabledPlugins[item.plugin.name] ?? false;
    }
    next[name] = enable;
    onPluginsChange(next);
  }
  return (
    <div className="flex flex-col gap-4">
      <section className="flex min-w-0 flex-col gap-1">
        <SourceGroupLabel label="Packs" count={packsQuery.isPending ? undefined : catalog.length} />
        {!packsQuery.isPending && catalog.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">No capability packs.</p>
        ) : null}
        <RowList>
          {catalog.map((pack) => {
            const isCore = pack.name === CORE_SOURCE;
            const granted = isCore ? true : isSourceGranted(capabilities[pack.name]);
            const base = overrideOfAssignment(capabilities[pack.name]);
            const settingsAvailable =
              packHasSettings(pack.name, pack.hasSettings) && (isCore || granted);
            return (
              <AgentSourceCard
                key={pack.name}
                kind="pack"
                name={pack.name}
                description={pack.description}
                granted={granted}
                locked={isCore}
                lockLabel={isCore ? 'обязателен' : undefined}
                tools={agentId ? sourceToolRows(view, `pack:${pack.name}`, base) : []}
                toolsHint={
                  agentId
                    ? 'Grant the source and save to tune its tools.'
                    : 'Save the agent to tune per-tool overrides.'
                }
                onToggleGrant={(next) =>
                  onCapabilitiesChange(setSourceGrant(capabilities, pack.name, next))
                }
                onToggleTool={(tool, disable) =>
                  onCapabilitiesChange(toggleDisabledTool(capabilities, pack.name, tool, disable))
                }
                onExposure={(tool, exposure) =>
                  onCapabilitiesChange(setToolExposure(capabilities, pack.name, tool, exposure))
                }
                settings={
                  settingsAvailable ? (
                    <PackSettingsFields
                      packName={pack.name}
                      config={{ spec: base.spec }}
                      onChange={(next) =>
                        onCapabilitiesChange({
                          ...capabilities,
                          [pack.name]: { ...base, spec: next.spec },
                        })
                      }
                    />
                  ) : undefined
                }
              />
            );
          })}
        </RowList>
      </section>
      <section className="flex min-w-0 flex-col gap-1">
        <SourceGroupLabel
          label="Plugins"
          count={pluginsListQuery.isPending ? undefined : plugins.length}
        />
        {!pluginsListQuery.isPending && plugins.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            No workspace-enabled plugins.
          </p>
        ) : null}
        <RowList>
          {plugins.map((item) => (
            <AgentSourceCard
              key={item.plugin.name}
              kind="plugin"
              name={item.plugin.name}
              description={item.plugin.description ?? pluginInventory(item)}
              granted={enabledPlugins[item.plugin.name] ?? false}
              sections={agentId ? sourceSections(view, `plugin:${item.plugin.name}`) : []}
              sectionsEmptyHint={
                agentId
                  ? 'No skills, servers or hooks from this plugin.'
                  : 'Save the agent to list granted skills, servers and hooks.'
              }
              onToggleGrant={(next) => togglePlugin(item.plugin.name, next)}
            />
          ))}
        </RowList>
      </section>
    </div>
  );
}
function pluginInventory(item: PluginListItem): string {
  const plugin = item.plugin;
  return `${plugin.skillCount} skills · ${plugin.hookCount} hooks · ${plugin.agentCount} agents · ${plugin.commandCount} commands`;
}
function SourceGroupLabel({ label, count }: { label: string; count?: number }) {
  return (
    <p className="flex items-baseline gap-1.5 pt-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
      {label}
      {typeof count === 'number' ? (
        <span className="font-mono font-normal normal-case tabular-nums">{count}</span>
      ) : null}
    </p>
  );
}
