import type { PluginCatalogEntry } from '@harnesys/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { openInstallCatalogPluginDialog } from '@/features/manage-plugins';
import {
  pluginCatalogQuery,
  pluginCatalogQueryKey,
  pluginRegistriesQuery,
  pluginsQueryKeyFor,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowField, RowList, RowSection } from '@/shared/ui/capability-rows';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';

const FILTER_ALL = 'all';

export function PluginsDiscoverTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(FILTER_ALL);
  const [formatFilter, setFormatFilter] = useState<string>(FILTER_ALL);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

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
  const categories = useMemo(
    () =>
      [
        ...new Set(catalogEntries.map((entry) => entry.category).filter(Boolean)),
      ].toSorted() as string[],
    [catalogEntries],
  );
  const formats = useMemo(
    () => [...new Set(catalogEntries.map((entry) => entry.format ?? 'unknown'))].toSorted(),
    [catalogEntries],
  );
  const entries = catalogEntries.filter(
    (entry) =>
      (categoryFilter === FILTER_ALL || entry.category === categoryFilter) &&
      (formatFilter === FILTER_ALL || (entry.format ?? 'unknown') === formatFilter),
  );

  async function onInstalled(name: string) {
    await queryClient.invalidateQueries({ queryKey: pluginsQueryKeyFor(workspaceId) });
    await queryClient.invalidateQueries({ queryKey: pluginCatalogQueryKey });
    toast.add({ title: 'Plugin installed', description: name });
  }

  const loading = catalogQuery.isPending || registriesQuery.isPending;
  const showSearch = catalogEntries.length > 0;

  return (
    <div className="flex flex-col gap-4" data-testid="plugins-discover-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 max-w-sm grow basis-52">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pr-8 pl-8 font-mono text-sm"
            placeholder="Search plugins…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            data-testid="plugin-search"
          />
          {q ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQ('')}
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Select
          items={[
            { value: FILTER_ALL, label: 'All categories' },
            ...categories.map((category) => ({ value: category, label: category })),
          ]}
          value={categoryFilter}
          onValueChange={(next) => {
            if (typeof next === 'string') {
              setCategoryFilter(next);
            }
          }}
        >
          <SelectTrigger
            className="h-8 w-40"
            data-testid="plugin-category-filter"
            aria-label="Filter by category"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              { value: FILTER_ALL, label: 'All categories' },
              ...categories.map((category) => ({ value: category, label: category })),
            ].map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: FILTER_ALL, label: 'All formats' },
            ...formats.map((format) => ({ value: format, label: format })),
          ]}
          value={formatFilter}
          onValueChange={(next) => {
            if (typeof next === 'string') {
              setFormatFilter(next);
            }
          }}
        >
          <SelectTrigger
            className="h-8 w-36"
            data-testid="plugin-format-filter"
            aria-label="Filter by format"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              { value: FILTER_ALL, label: 'All formats' },
              ...formats.map((format) => ({ value: format, label: format })),
            ].map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading catalog…</p>}

      {!loading && catalogEntries.length === 0 ? (
        <Empty className="min-h-0 border-0 py-8">
          <EmptyHeader>
            <EmptyTitle>No catalog entries</EmptyTitle>
            <EmptyDescription>
              Add a marketplace under Marketplaces, then refresh. Claude Official seeds on first
              open.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!loading && catalogEntries.length > 0 && entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing matches these filters.
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-6 text-xs"
            onClick={() => {
              setQ('');
              setCategoryFilter(FILTER_ALL);
              setFormatFilter(FILTER_ALL);
            }}
          >
            Clear filters
          </Button>
        </p>
      ) : null}

      {!loading && entries.length > 0 ? (
        <>
          {showSearch ? (
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {entries.length} of {catalogEntries.length}
            </p>
          ) : null}
          <RowList>
            {entries.map((entry) => (
              <CatalogRow
                key={`${entry.registryId}:${entry.pluginName}`}
                workspaceId={workspaceId}
                entry={entry}
                registryName={registryNames.get(entry.registryId) ?? entry.registryId}
                expanded={expandedKey === `${entry.registryId}:${entry.pluginName}`}
                onToggle={() =>
                  setExpandedKey((current) =>
                    current === `${entry.registryId}:${entry.pluginName}`
                      ? null
                      : `${entry.registryId}:${entry.pluginName}`,
                  )
                }
                onInstalled={onInstalled}
              />
            ))}
          </RowList>
        </>
      ) : null}
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

/** Where Install would pull from, as label/value lines for the expand area. */
function installSourceLines(entry: PluginCatalogEntry): [string, string][] {
  const source = entry.installSource;
  if (!source) {
    return [];
  }
  switch (source.type) {
    case 'relative':
      return [['path', source.path]];
    case 'github':
      return [
        ['repo', source.repo],
        ...(source.ref ? [['ref', source.ref] as [string, string]] : []),
        ...(source.sha ? [['sha', source.sha.slice(0, 12)] as [string, string]] : []),
      ];
    case 'url':
      return [
        ['url', source.url],
        ...(source.ref ? [['ref', source.ref] as [string, string]] : []),
      ];
    case 'git-subdir':
      return [
        ['url', source.url],
        ['path', source.path],
        ...(source.ref ? [['ref', source.ref] as [string, string]] : []),
      ];
    case 'npm':
      return [
        ['package', source.package],
        ...(source.version ? [['version', source.version] as [string, string]] : []),
        ...(source.registry ? [['registry', source.registry] as [string, string]] : []),
      ];
    case 'archive':
      return [
        ['url', source.url],
        ...(source.sha256 ? [['sha256', source.sha256.slice(0, 12)] as [string, string]] : []),
      ];
  }
}

function CatalogRow({
  workspaceId,
  entry,
  registryName,
  expanded,
  onToggle,
  onInstalled,
}: {
  workspaceId: string;
  entry: PluginCatalogEntry;
  registryName: string;
  expanded: boolean;
  onToggle: () => void;
  onInstalled: (name: string) => Promise<void>;
}) {
  const sourceLines = installSourceLines(entry);
  return (
    <Row
      testId={`catalog-${entry.pluginName}`}
      title={entry.displayName ?? entry.pluginName}
      mono={entry.displayName === undefined}
      meta={entry.version}
      muted={!entry.installable}
      summary={catalogDescription(entry)}
      chips={
        <>
          <RowChip>{registryName}</RowChip>
          {entry.format ? <RowChip>{entry.format}</RowChip> : null}
          {entry.category ? <RowChip tone="accent">{entry.category}</RowChip> : null}
          {!entry.installable ? <RowChip tone="danger">unsupported</RowChip> : null}
        </>
      }
      onToggle={onToggle}
      expanded={expanded}
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!entry.installable}
          onClick={() => {
            void openInstallCatalogPluginDialog({
              workspaceId,
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
    >
      {entry.description ? (
        <RowSection label="Description">
          <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
            {entry.description}
          </p>
        </RowSection>
      ) : null}
      {entry.tags && entry.tags.length > 0 ? (
        <RowSection label="Tags" count={entry.tags.length}>
          <p className="wrap-anywhere px-1 font-mono text-[12px] leading-snug">
            {entry.tags.join(' · ')}
          </p>
        </RowSection>
      ) : null}
      {entry.homepage ? (
        <RowSection label="Homepage">
          <RowField label="url" value={entry.homepage} />
        </RowSection>
      ) : null}
      {sourceLines.length > 0 ? (
        <RowSection label="Install source">
          {sourceLines.map(([label, value]) => (
            <RowField key={label} label={label} value={value} />
          ))}
        </RowSection>
      ) : null}
      {entry.inertComponents && entry.inertComponents.length > 0 ? (
        <RowSection label="Inert here" count={entry.inertComponents.length}>
          <p className="wrap-anywhere px-1 font-mono text-[12px] leading-snug">
            {entry.inertComponents.join(' · ')}
          </p>
        </RowSection>
      ) : null}
      {entry.unsupportedReason ? (
        <RowSection label="Why unsupported">
          <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
            {entry.unsupportedReason}
          </p>
        </RowSection>
      ) : null}
    </Row>
  );
}
