import type { PluginCatalogEntry } from '@harnesys/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';

import { Row, RowChip, RowList } from './capability-rows';

const FORMAT_ALL = 'all';

export function PluginsDiscoverTab() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>(FORMAT_ALL);
  const registriesQuery = useQuery(pluginRegistriesQuery());
  const catalogQuery = useQuery(pluginCatalogQuery({ q: debouncedQ || undefined }));
  const registryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const registry of registriesQuery.data ?? []) {
      map.set(registry.id, registry.name);
    }
    return map;
  }, [registriesQuery.data]);

  const catalogEntries = catalogQuery.data ?? [];
  const formats = useMemo(
    () => [...new Set(catalogEntries.map((entry) => entry.format ?? 'unknown'))].toSorted(),
    [catalogEntries],
  );
  const entries =
    formatFilter === FORMAT_ALL
      ? catalogEntries
      : catalogEntries.filter((entry) => (entry.format ?? 'unknown') === formatFilter);

  async function onInstalled(name: string) {
    await queryClient.invalidateQueries({ queryKey: pluginsQueryKey });
    await queryClient.invalidateQueries({ queryKey: pluginCatalogQueryKey });
    toast.add({ title: 'Plugin installed', description: name });
  }

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
        <Select
          items={formatItems(formats)}
          value={formatFilter}
          onValueChange={(next) => {
            if (typeof next === 'string') {
              setFormatFilter(next);
            }
          }}
        >
          <SelectTrigger
            className="w-44"
            data-testid="plugin-format-filter"
            aria-label="Filter by format"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formatItems(formats).map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(catalogQuery.isPending || registriesQuery.isPending) && (
        <p className="text-muted-foreground text-sm">Loading catalog…</p>
      )}

      {!catalogQuery.isPending && catalogEntries.length === 0 ? (
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
        <CatalogList entries={entries} registryNames={registryNames} onInstalled={onInstalled} />
      )}
    </div>
  );
}

function CatalogList({
  entries,
  registryNames,
  onInstalled,
}: {
  entries: PluginCatalogEntry[];
  registryNames: Map<string, string>;
  onInstalled: (name: string) => Promise<void>;
}) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No entries for this format.</p>;
  }
  return (
    <RowList>
      {entries.map((entry) => (
        <CatalogRow
          key={`${entry.registryId}:${entry.pluginName}`}
          entry={entry}
          registryName={registryNames.get(entry.registryId) ?? entry.registryId}
          onInstalled={onInstalled}
        />
      ))}
    </RowList>
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

function formatItems(formats: string[]): { value: string; label: string }[] {
  return [
    { value: FORMAT_ALL, label: 'All formats' },
    ...formats.map((format) => ({ value: format, label: `Format: ${format}` })),
  ];
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
  const unsupportedDetail = entry.installable
    ? null
    : (entry.unsupportedReason ?? 'This marketplace entry cannot be installed.');
  return (
    <Row
      testId={`catalog-${entry.pluginName}`}
      title={entry.displayName ?? entry.pluginName}
      meta={entry.version}
      muted={!entry.installable}
      summary={unsupportedDetail ?? catalogDescription(entry)}
      chips={
        <>
          <RowChip>{entry.format ?? 'unknown'}</RowChip>
          <RowChip>{registryName}</RowChip>
          {entry.category ? <RowChip tone="accent">{entry.category}</RowChip> : null}
          {!entry.installable ? <RowChip tone="danger">unsupported</RowChip> : null}
        </>
      }
      actions={
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
          Install
        </Button>
      }
    />
  );
}
