import type { PluginCatalogEntry } from '@harnesys/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
import { openInstallCatalogPluginDialog } from '@/features/manage-plugins';
import {
  pluginCatalogQuery,
  pluginCatalogQueryKey,
  pluginRegistriesQuery,
  pluginsQueryKey,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

export function PluginsDiscoverTab() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const registriesQuery = useQuery(pluginRegistriesQuery());
  const catalogQuery = useQuery(pluginCatalogQuery({ q: debouncedQ || undefined }));
  const registryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const registry of registriesQuery.data ?? []) {
      map.set(registry.id, registry.name);
    }
    return map;
  }, [registriesQuery.data]);

  const entries = catalogQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid="plugins-discover-tab">
      <div className="flex items-center gap-2">
        <Input
          className="max-w-sm font-mono"
          placeholder="Search plugins…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setDebouncedQ(q.trim());
            }
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setDebouncedQ(q.trim())}
        >
          Search
        </Button>
      </div>

      {(catalogQuery.isPending || registriesQuery.isPending) && (
        <p className="text-muted-foreground text-sm">Loading catalog…</p>
      )}

      {!catalogQuery.isPending && entries.length === 0 ? (
        <Empty className="min-h-0 border-0 py-8">
          <EmptyHeader>
            <EmptyTitle>No catalog entries</EmptyTitle>
            <EmptyDescription>
              Add a marketplace under Marketplaces, then refresh. Claude Official seeds on first
              open.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((entry) => (
            <CatalogRow
              key={`${entry.registryId}:${entry.pluginName}`}
              entry={entry}
              registryName={registryNames.get(entry.registryId) ?? entry.registryId}
              onInstalled={async (name) => {
                await queryClient.invalidateQueries({ queryKey: pluginsQueryKey });
                await queryClient.invalidateQueries({ queryKey: pluginCatalogQueryKey });
                toast.add({ title: 'Plugin installed', description: name });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function catalogDescription(entry: PluginCatalogEntry): string {
  if (entry.description) {
    return entry.description;
  }
  if (entry.unsupportedReason) {
    return entry.unsupportedReason;
  }
  if (entry.installSource) {
    return entry.installSource.type;
  }
  return 'No description';
}

function CatalogRow({
  entry,
  registryName,
  onInstalled,
}: {
  entry: PluginCatalogEntry;
  registryName: string;
  onInstalled: (name: string) => Promise<void>;
}) {
  return (
    <div data-testid={`catalog-${entry.pluginName}`}>
      <ConfigEntityCard
        title={entry.displayName ?? entry.pluginName}
        badge={registryName}
        statusBadge={entry.category ?? undefined}
        description={catalogDescription(entry)}
        initials={initialsFromLabel(entry.pluginName)}
        monoTitle
        trailing={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!entry.installable}
            onClick={() => {
              void openInstallCatalogPluginDialog({
                registryId: entry.registryId,
                pluginName: entry.pluginName,
              }).then(async (result) => {
                if (result) {
                  await onInstalled(result.plugin.name);
                }
              });
            }}
          >
            {entry.installable ? 'Install' : 'Unsupported'}
          </Button>
        }
      />
    </div>
  );
}
