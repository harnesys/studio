import type { PackCatalogEntry, PackConfig } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { workspaceCapabilitiesQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';

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
      <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Capability packs
      </h3>

      {!query.isPending && catalog.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No capability packs.</p>
      ) : null}

      {!query.isPending && catalog.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2.5">
          {catalog.map((pack) => {
            const enabled = isPackEnabled(packs, pack.name);
            const config = enabledConfig(packs, pack.name);
            const settingsAvailable = packHasSettings(pack.name, pack.hasSettings);
            const settingsOpen = openSettings === pack.name && enabled && settingsAvailable;
            return (
              <PackRow
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

function PackRow({
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
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-start gap-2">
        <Switch
          size="sm"
          className="mt-0.5"
          checked={enabled}
          onCheckedChange={(next) => onToggle(pack.name, Boolean(next))}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <p className="min-w-0 truncate font-medium text-[12px] leading-snug">{pack.name}</p>
            {settingsAvailable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!enabled}
                aria-expanded={settingsOpen}
                aria-label={`Configure ${pack.name}`}
                onClick={onToggleSettings}
                className={cn('shrink-0', settingsOpen && 'bg-muted')}
              >
                <SettingsIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {pack.description ? (
            <p className="truncate text-[11px] text-muted-foreground leading-snug">
              {pack.description}
            </p>
          ) : null}
        </div>
      </div>

      {settingsOpen ? (
        <div className="min-w-0 pl-7">
          <PackSettingsFields packName={pack.name} config={config} onChange={onConfigChange} />
        </div>
      ) : null}
    </div>
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
