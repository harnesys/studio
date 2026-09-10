import type { PackCatalogEntry, PackConfig } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import {
  BotIcon,
  CalendarClockIcon,
  FileTextIcon,
  GlobeIcon,
  LayersIcon,
  type LucideIcon,
  MapIcon,
  MessageSquareIcon,
  SettingsIcon,
  TerminalIcon,
  WebhookIcon,
} from 'lucide-react';
import { useState } from 'react';
import { workspaceCapabilitiesQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent } from '@/shared/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';

import { PackSettingsFields, packHasSettings } from './pack-settings';

const ICON_MAP: Record<string, LucideIcon> = {
  files: FileTextIcon,
  shell: TerminalIcon,
  fetch: GlobeIcon,
  webhook: WebhookIcon,
  threads: MessageSquareIcon,
  agents: BotIcon,
  scheduler: CalendarClockIcon,
  plan: MapIcon,
  layers: LayersIcon,
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
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const query = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const catalog = (query.data?.capabilities ?? []).filter((pack) => !pack.name.endsWith('-memory'));
  const enabledCount = catalog.filter((pack) => isPackEnabled(packs, pack.name)).length;

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
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Capability packs
        </h3>
        {!query.isPending && catalog.length > 0 ? (
          <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {enabledCount}/{catalog.length} on
          </p>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!query.isPending && catalog.length === 0 ? (
        <Empty className="border border-dashed p-4">
          <EmptyHeader>
            <EmptyTitle className="text-sm">No capability packs</EmptyTitle>
            <EmptyDescription className="text-[12px]">
              Workspace runtime has no registered packs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!query.isPending && catalog.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          {catalog.map((pack) => {
            const enabled = isPackEnabled(packs, pack.name);
            const config = enabledConfig(packs, pack.name);
            const settingsAvailable = packHasSettings(pack.name, pack.hasSettings);
            const settingsOpen = openSettings === pack.name;
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
  const Icon = getIcon(pack.icon);
  const configured = hasConfiguredSpec(config);

  return (
    <Collapsible
      open={settingsOpen && enabled && settingsAvailable}
      className={cn(
        'min-w-0 rounded-md border border-l-[3px] transition-colors',
        enabled ? 'border-l-primary bg-card' : 'border-l-transparent bg-muted/20',
      )}
    >
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
              enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <p className="truncate font-medium text-[12px] leading-snug">{pack.name}</p>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  v{pack.version}
                </span>
                {configured ? (
                  <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[9px]">
                    configured
                  </Badge>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {settingsAvailable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!enabled}
                    aria-expanded={settingsOpen}
                    aria-label={`Configure ${pack.name}`}
                    onClick={onToggleSettings}
                    className={cn(settingsOpen && enabled && 'bg-muted')}
                  >
                    <SettingsIcon className="size-3.5" />
                  </Button>
                ) : null}
                <Switch
                  size="sm"
                  checked={enabled}
                  onCheckedChange={(next) => onToggle(pack.name, Boolean(next))}
                />
              </div>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
              {pack.description}
            </p>
          </div>
        </div>

        {pack.tools.length > 0 ? (
          <div className="flex flex-wrap gap-1 pl-9">
            {pack.tools.map((tool) => (
              <Badge
                key={tool.name}
                variant="secondary"
                className="h-5 max-w-full truncate font-mono font-normal text-[10px]"
                title={tool.description || tool.name}
              >
                {tool.name}
              </Badge>
            ))}
          </div>
        ) : null}

        {pack.skills.length > 0 ? (
          <p className="pl-9 text-[10px] text-muted-foreground">
            {pack.skills.length} skill{pack.skills.length === 1 ? '' : 's'}
          </p>
        ) : null}

        <CollapsibleContent>
          <div className="mt-1 rounded-md border bg-muted/30 p-2.5">
            <PackSettingsFields packName={pack.name} config={config} onChange={onConfigChange} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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

function hasConfiguredSpec(config: PackConfig): boolean {
  const spec = config.spec;
  if (spec === undefined) {
    return false;
  }
  return Object.keys(spec).length > 0;
}
