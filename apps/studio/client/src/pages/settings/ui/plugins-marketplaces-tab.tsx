import type { PluginRegistrySummary } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';

import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
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

export function PluginsMarketplacesTab() {
  const queryClient = useQueryClient();
  const registriesQuery = useQuery(pluginRegistriesQuery());
  const items = registriesQuery.data ?? [];

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
    <div className="flex flex-col gap-4" data-testid="plugins-marketplaces-tab">
      <div className="flex h-8 items-center gap-1">
        <p className="font-medium text-sm">Marketplaces</p>
        <div className="ml-auto flex items-center gap-1">
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
        </div>
      </div>

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
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <RegistryRow
                key={item.id}
                item={item}
                busy={refresh.isPending || remove.isPending}
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
          </div>
        ))}
    </div>
  );
}

function registryStatus(item: PluginRegistrySummary): string {
  if (item.lastError) {
    return 'error';
  }
  if (item.lastSyncAt) {
    return 'synced';
  }
  return 'pending';
}

function RegistryRow({
  item,
  busy,
  onRefresh,
  onRemove,
}: {
  item: PluginRegistrySummary;
  busy: boolean;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const description = item.lastError ? `${item.source} · ${item.lastError}` : item.source;
  return (
    <div data-testid={`registry-${item.id}`}>
      <ConfigEntityCard
        title={item.name}
        badge={item.kind}
        statusBadge={registryStatus(item)}
        description={description}
        initials={initialsFromLabel(item.name)}
        monoTitle
        trailing={
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
              className="opacity-70"
              aria-label={`Remove ${item.name}`}
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2Icon />
            </Button>
          </>
        }
      />
    </div>
  );
}
