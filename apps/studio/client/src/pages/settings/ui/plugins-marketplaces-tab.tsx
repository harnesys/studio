import type { PluginRegistrySummary } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { confirmRemoveRegistry, openAddRegistryDialog } from '@/features/manage-plugins';
import {
  pluginCatalogQueryKey,
  pluginRegistriesQuery,
  pluginRegistriesQueryKey,
  refreshPluginRegistry,
  removePluginRegistry,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';

import { Row, RowChip, RowField, RowHeader, RowList, RowSection } from './capability-rows';

export function PluginsMarketplacesTab() {
  const queryClient = useQueryClient();
  const registriesQuery = useQuery(pluginRegistriesQuery());
  const items = registriesQuery.data ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: pluginRegistriesQueryKey });
    await queryClient.invalidateQueries({ queryKey: pluginCatalogQueryKey });
  }

  const refresh = useMutation({
    mutationFn: (id: string) => refreshPluginRegistry(id),
    onSuccess: async (registry) => {
      await invalidate();
      toast.add({ title: 'Marketplace refreshed', description: registry.name });
    },
    onError: (error) => {
      toast.add({
        title: 'Refresh failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removePluginRegistry(id),
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Marketplace removed' });
    },
  });

  return (
    <div className="flex flex-col gap-2" data-testid="plugins-marketplaces-tab">
      <RowHeader label="Marketplaces" count={registriesQuery.isPending ? undefined : items.length}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            void openAddRegistryDialog().then(async (registry) => {
              if (!registry) {
                return;
              }
              await invalidate();
              toast.add({ title: 'Marketplace added', description: registry.name });
            });
          }}
        >
          <PlusIcon />
          Add
        </Button>
      </RowHeader>

      {registriesQuery.isPending && (
        <p className="text-muted-foreground text-sm">Loading marketplaces…</p>
      )}

      {!registriesQuery.isPending &&
        (items.length === 0 ? (
          <Empty className="min-h-0 border-0 py-8">
            <EmptyHeader>
              <EmptyTitle>No marketplaces</EmptyTitle>
              <EmptyDescription>
                Add `anthropics/claude-plugins-official` or another repo with `marketplace.json`.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <RowList>
            {items.map((item) => (
              <RegistryRow
                key={item.id}
                item={item}
                busy={refresh.isPending || remove.isPending}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                onRefresh={() => refresh.mutate(item.id)}
                onRemove={() => {
                  void confirmRemoveRegistry(item.name).then((confirmed) => {
                    if (confirmed) {
                      remove.mutate(item.id);
                    }
                  });
                }}
              />
            ))}
          </RowList>
        ))}
    </div>
  );
}

function registryStatus(item: PluginRegistrySummary): {
  label: string;
  tone: 'neutral' | 'accent' | 'danger';
} {
  if (item.lastError) {
    return { label: 'error', tone: 'danger' };
  }
  if (item.lastSyncAt) {
    return { label: 'synced', tone: 'neutral' };
  }
  return { label: 'pending', tone: 'accent' };
}

function syncLabel(item: PluginRegistrySummary): string {
  if (item.lastError) {
    return item.lastError;
  }
  if (item.lastSyncAt) {
    return new Date(item.lastSyncAt).toLocaleString();
  }
  return 'Never synced';
}

function RegistryRow({
  item,
  busy,
  expanded,
  onToggle,
  onRefresh,
  onRemove,
}: {
  item: PluginRegistrySummary;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const status = registryStatus(item);
  return (
    <Row
      testId={`registry-${item.id}`}
      title={item.name}
      meta={item.kind}
      summary={item.lastError ? `${item.source} — ${item.lastError}` : item.source}
      chips={<RowChip tone={status.tone}>{status.label}</RowChip>}
      onToggle={onToggle}
      expanded={expanded}
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCwIcon />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${item.name}`}
            disabled={busy}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        </>
      }
    >
      <RowSection label="Source">
        <RowField label="repo" value={item.source} />
        <RowField label="path" value={item.path} />
        {item.revision ? <RowField label="revision" value={item.revision.slice(0, 12)} /> : null}
      </RowSection>
      <RowSection label="Sync">
        <RowField label="last sync" value={syncLabel(item)} />
        <RowField label="added" value={new Date(item.createdAt).toLocaleDateString()} />
      </RowSection>
    </Row>
  );
}
