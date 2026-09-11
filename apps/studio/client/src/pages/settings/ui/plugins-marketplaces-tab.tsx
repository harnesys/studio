import type { PluginRegistrySummary } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';

import { confirmRemoveRegistry, openAddRegistryDialog } from '@/features/manage-plugins';
import {
  pluginCatalogQueryKey,
  pluginRegistriesQuery,
  pluginRegistriesQueryKey,
  refreshPluginRegistry,
  removePluginRegistry,
} from '@/shared/api';
import { Badge } from '@/shared/ui/badge';
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

function RegistryStatusBadge({ item }: { item: PluginRegistrySummary }) {
  if (item.lastError) {
    return (
      <Badge variant="destructive" className="font-mono">
        error
      </Badge>
    );
  }
  if (item.lastSyncAt) {
    return (
      <Badge variant="secondary" className="font-mono">
        synced
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono">
      pending
    </Badge>
  );
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
  return (
    <div
      className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
      data-testid={`registry-${item.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm">{item.name}</span>
          <Badge variant="outline" className="font-mono">
            {item.kind}
          </Badge>
          <RegistryStatusBadge item={item} />
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {item.source}
          {item.lastError ? ` · ${item.lastError}` : null}
        </p>
      </div>
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
    </div>
  );
}
