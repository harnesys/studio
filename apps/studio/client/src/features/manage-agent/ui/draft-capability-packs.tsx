import type { PackCatalogEntry, PackConfig } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import {
  BoxIcon,
  CodeIcon,
  CpuIcon,
  DatabaseIcon,
  GlobeIcon,
  LayersIcon,
  type LucideIcon,
  NetworkIcon,
  PackageIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  TerminalIcon,
} from 'lucide-react';
import { useState } from 'react';
import { workspaceCapabilitiesQuery } from '@/shared/api';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Switch } from '@/shared/ui/switch';

const ICON_MAP: Record<string, LucideIcon> = {
  box: BoxIcon,
  code: CodeIcon,
  cpu: CpuIcon,
  database: DatabaseIcon,
  globe: GlobeIcon,
  layers: LayersIcon,
  network: NetworkIcon,
  package: PackageIcon,
  server: ServerIcon,
  settings: SettingsIcon,
  shield: ShieldIcon,
  terminal: TerminalIcon,
};

function getIcon(name: string | undefined): LucideIcon {
  if (!name) {
    return LayersIcon;
  }
  return ICON_MAP[name] ?? LayersIcon;
}

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
  const query = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const catalog = (query.data?.capabilities ?? []).filter((pack) => !pack.name.endsWith('-memory'));

  function toggle(name: string, enable: boolean) {
    const next = { ...packs };
    if (enable) {
      next[name] = packs[name] ?? {};
    } else {
      delete next[name];
    }
    setPacks(next);
    onChange(next);
  }

  function openSettings(pack: PackCatalogEntry) {
    void dialog.open(PackSettingsDialog, {
      title: `${pack.name} Settings`,
      data: pack,
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Capability packs
      </h3>
      {!query.isPending &&
        (catalog.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No capability packs.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {catalog.map((pack) => (
              <PackCard
                key={pack.name}
                pack={pack}
                enabled={isPackEnabled(packs, pack.name)}
                onToggle={toggle}
                onSettings={() => openSettings(pack)}
              />
            ))}
          </div>
        ))}
    </section>
  );
}

function PackCard({
  pack,
  enabled,
  onToggle,
  onSettings,
}: {
  pack: PackCatalogEntry;
  enabled: boolean;
  onToggle: (name: string, enable: boolean) => void;
  onSettings: () => void;
}) {
  const Icon = getIcon(pack.icon);
  return (
    <div className="gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-[12px] leading-snug">
                {pack.name} v{pack.version}
              </p>
              <p className="truncate text-[11px] text-muted-foreground leading-snug">
                {pack.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {pack.hasSettings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onSettings}
                  aria-label={`Configure ${pack.name}`}
                >
                  <SettingsIcon className="size-3.5" />
                </Button>
              )}
              <Switch
                size="sm"
                className="mt-0.5 shrink-0"
                checked={enabled}
                onCheckedChange={(next) => onToggle(pack.name, Boolean(next))}
              />
            </div>
          </div>
          {pack.tools.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 pl-7">
              {pack.tools.map((tool) => (
                <div key={tool.name} className="flex items-start gap-2">
                  <TerminalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] leading-snug">{tool.name}</p>
                    {tool.description && (
                      <p className="truncate text-[10px] text-muted-foreground leading-snug">
                        {tool.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {pack.skills.length > 0 && (
            <p className="mt-2 pl-7 text-[11px] text-muted-foreground">
              {pack.skills.length} skill{pack.skills.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PackSettingsDialog({
  onResolve,
  data,
}: {
  onResolve?: () => void;
  data?: PackCatalogEntry;
}) {
  if (!data) {
    return null;
  }
  return (
    <Dialog onOpenChange={onResolve}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{data.name} Settings</DialogTitle>
          <DialogDescription>
            Configure pack settings. Schema: {data.tools.length} tools, {data.skills.length} skills.
          </DialogDescription>
        </DialogHeader>
        <div className="text-muted-foreground text-sm">
          <p>
            Settings form for {data.name} v{data.version} would be rendered here based on
            specSchema.
          </p>
          <p className="mt-1">
            This is a placeholder for the v1 specSchema form (string/number/boolean/enum).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onResolve}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
