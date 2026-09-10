import type { PackCatalogEntry, PackConfig } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { workspaceCapabilitiesQuery } from '@/shared/api';
import { Switch } from '@/shared/ui/switch';

import { ConfigEntityCard, initialsFromLabel } from './config-entity-card';
import { PackSettingsFields, packHasSettings } from './pack-settings';

export function DraftCapabilityPacks({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: Record<string, PackConfig | null>;
  onChange: (next: Record<string, PackConfig | null>) => void;
}) {
  const [packs, setPacks] = useState(value);
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const query = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const catalog = (query.data?.capabilities ?? []).filter((pack) => !pack.name.endsWith('-memory'));

  function commit(next: Record<string, PackConfig | null>) {
    setPacks(next);
    onChange(next);
  }

  function toggle(name: string, enable: boolean) {
    const next = { ...packs };
    if (enable) {
      next[name] = packs[name] ?? {};
    } else {
      delete next[name];
      if (openSettings === name) {
        setOpenSettings(null);
      }
    }
    commit(next);
  }

  function patchConfig(name: string, config: PackConfig) {
    if (!isPackEnabled(packs, name)) {
      return;
    }
    commit({ ...packs, [name]: config });
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      {!query.isPending && catalog.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
          No capability packs.
        </p>
      ) : null}

      {!query.isPending && catalog.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          {catalog.map((pack) => {
            const enabled = isPackEnabled(packs, pack.name);
            const config = enabledConfig(packs, pack.name);
            const settingsAvailable = packHasSettings(pack.name, pack.hasSettings);
            const settingsOpen = openSettings === pack.name && enabled && settingsAvailable;
            return (
              <PackCard
                key={pack.name}
                pack={pack}
                enabled={enabled}
                config={config}
                settingsAvailable={settingsAvailable}
                settingsOpen={settingsOpen}
                onToggle={toggle}
                onToggleSettings={() =>
                  setOpenSettings((current) => (current === pack.name ? null : pack.name))
                }
                onConfigChange={(next) => patchConfig(pack.name, next)}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function PackCard({
  pack,
  enabled,
  config,
  settingsAvailable,
  settingsOpen,
  onToggle,
  onToggleSettings,
  onConfigChange,
}: {
  pack: PackCatalogEntry;
  enabled: boolean;
  config: PackConfig;
  settingsAvailable: boolean;
  settingsOpen: boolean;
  onToggle: (name: string, enable: boolean) => void;
  onToggleSettings: () => void;
  onConfigChange: (next: PackConfig) => void;
}) {
  return (
    <ConfigEntityCard
      title={pack.name}
      badge="pack"
      description={pack.description}
      initials={initialsFromLabel(pack.name)}
      expanded={settingsOpen}
      onClick={settingsAvailable && enabled ? onToggleSettings : undefined}
      trailing={
        <Switch
          size="sm"
          checked={enabled}
          onCheckedChange={(next) => onToggle(pack.name, Boolean(next))}
        />
      }
    >
      <PackSettingsFields packName={pack.name} config={config} onChange={onConfigChange} />
    </ConfigEntityCard>
  );
}

/**
 * Runtime truth: absent key is default-on for `skills` only, off for the rest;
 * explicit null is off; explicit spec or {} is on.
 */
function isPackEnabled(value: Record<string, PackConfig | null>, name: string): boolean {
  const config = value[name];
  if (config === undefined) {
    return name === 'skills';
  }
  return config != null;
}

function enabledConfig(value: Record<string, PackConfig | null>, name: string): PackConfig {
  const config = value[name];
  return config ?? {};
}
