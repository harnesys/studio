import type { DiscoveredModelView, ProviderExportBundle } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, PlusIcon, UploadIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { initialsFromLabel } from '@/features/manage-agent';
import { catalogQuery } from '@/shared/api';
import { alert, dialog } from '@/shared/services/overlay';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import {
  useAttachProviderModel,
  useCreateProvider,
  useDeleteProvider,
  useDetachProviderModel,
  useDiscoverProviderModels,
  useExportProviders,
  useImportProviders,
  useProviders,
  useUpdateProvider,
  useUpdateProviderModel,
} from '../model/use-providers';
import { ProviderForm } from './provider-form';
import { ProviderModelsSection } from './provider-models-section';
import { ProviderSettingsFields } from './provider-settings-fields';

export function ModelsPane({ workspaceId }: { workspaceId: string }) {
  const catalog = useQuery(catalogQuery).data;
  const providersQuery = useProviders(workspaceId);
  const providers = providersQuery.data ?? [];
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [foundByProvider, setFoundByProvider] = useState<Record<string, DiscoveredModelView[]>>({});
  const create = useCreateProvider(workspaceId);
  const update = useUpdateProvider(workspaceId);
  const remove = useDeleteProvider(workspaceId);
  const discover = useDiscoverProviderModels(workspaceId);
  const attach = useAttachProviderModel(workspaceId);
  const patchModel = useUpdateProviderModel(workspaceId);
  const detach = useDetachProviderModel(workspaceId);
  const exportProviders = useExportProviders(workspaceId);
  const importProviders = useImportProviders(workspaceId);
  const importFileRef = useRef<HTMLInputElement>(null);

  const selected = providers.find((item) => item.id === selectedProviderId) ?? null;
  const found = selected ? (foundByProvider[selected.id] ?? null) : null;

  useEffect(() => {
    if (!workspaceId || providers.length === 0) {
      return;
    }
    if (selectedProviderId && providers.some((item) => item.id === selectedProviderId)) {
      return;
    }
    setSelectedProviderId(providers[0].id);
  }, [workspaceId, selectedProviderId, providers]);

  async function handleExport() {
    try {
      const bundle = await exportProviders.mutateAsync();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'harnesys-providers.json';
      anchor.click();
      URL.revokeObjectURL(url);
      toast.add({
        title: 'Providers exported',
        description: `${bundle.providers.length} providers`,
      });
    } catch (err) {
      toast.add({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const bundle = JSON.parse(await file.text()) as ProviderExportBundle;
      const result = await importProviders.mutateAsync(bundle);
      toast.add({
        title: 'Providers imported',
        description: `providers: ${result.providersCreated} created, ${result.providersUpdated} updated; models: ${result.modelsCreated} created, ${result.modelsUpdated} updated`,
      });
    } catch (err) {
      toast.add({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'invalid file',
      });
    }
  }

  function handleDeleteProvider(id: string, name: string) {
    void alert
      .confirm({
        title: `Delete ${name}?`,
        description: 'Stored models on this provider leave the list.',
        confirmText: 'Delete',
        variant: 'destructive',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        void remove.mutateAsync(id).then(() => {
          setFoundByProvider((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
          setSelectedProviderId(providers.find((item) => item.id !== id)?.id ?? null);
        });
      });
  }

  return (
    <div
      className="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-x-10 md:gap-y-2"
      data-testid="models-pane"
    >
      <div className="flex h-8 items-center gap-1 px-1 md:col-start-1 md:row-start-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
          Providers
        </p>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Export providers"
            data-testid="providers-export"
            disabled={exportProviders.isPending || providers.length === 0}
            onClick={() => void handleExport()}
          >
            <DownloadIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Import providers"
            data-testid="providers-import"
            disabled={importProviders.isPending}
            onClick={() => importFileRef.current?.click()}
          >
            <UploadIcon />
          </Button>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="providers-import-file"
            onChange={(event) => void handleImportFile(event)}
          />
        </div>
      </div>

      <aside className="w-full min-w-0 md:col-start-1 md:row-start-2">
        <div className="flex flex-col gap-0.5">
          {providers.map((item) => {
            const active = item.id === selected?.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`provider-${item.name}`}
                className={
                  active
                    ? 'flex h-11 items-center gap-2 rounded-md bg-muted px-2 text-left'
                    : 'flex h-11 items-center gap-2 rounded-md px-2 text-left hover:bg-muted/60'
                }
                onClick={() => setSelectedProviderId(item.id)}
              >
                <Avatar size="sm" className="-mt-1.5 shrink-0 after:hidden">
                  <AvatarFallback className="bg-[color-mix(in_oklab,var(--live)_12%,transparent)] text-[9px]">
                    {initialsFromLabel(item.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={
                      item.enabled ? 'truncate text-sm' : 'truncate text-muted-foreground text-sm'
                    }
                  >
                    {item.name}
                  </span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {item.enabled ? `${item.models.length} models` : 'off'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          className="mt-2 w-full justify-start rounded-lg border border-dashed text-muted-foreground"
          onClick={() => {
            void dialog
              .open(ProviderForm, {
                title: 'Add provider',
                description: 'Pick the driver and the API, Coding Plan, or region host.',
                className: 'sm:max-w-sm',
              })
              .then((draft) => {
                if (!draft) {
                  return;
                }
                void create.mutateAsync(draft).then((provider) => {
                  setSelectedProviderId(provider.id);
                });
              });
          }}
        >
          <PlusIcon />
          Add provider
        </Button>
      </aside>

      {selected ? (
        <>
          <div className="flex h-8 min-w-0 items-center gap-3 md:col-start-2 md:row-start-1">
            <h2 className="truncate font-medium text-sm">{selected.name}</h2>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
              {selected.driver}
            </span>
            <span className="ml-auto inline-flex items-center gap-2 text-sm">
              <Switch
                size="sm"
                checked={selected.enabled}
                onCheckedChange={(enabled) =>
                  update.mutate({ id: selected.id, enabled: Boolean(enabled) })
                }
              />
              Enabled
            </span>
          </div>

          <div className="min-w-0 md:col-start-2 md:row-start-2">
            <ProviderSettingsFields
              selected={selected}
              catalog={catalog}
              onUpdate={(patch) => update.mutate(patch)}
            />
            <ProviderModelsSection
              selected={selected}
              found={found}
              discovering={discover.isPending}
              onDiscover={() => {
                void discover.mutateAsync(selected.id).then((result) => {
                  setFoundByProvider((current) => ({
                    ...current,
                    [selected.id]: result.found,
                  }));
                });
              }}
              onAttach={(input) => attach.mutate(input)}
              onPatchModel={(input) => patchModel.mutate(input)}
              onDetach={(input) => detach.mutate(input)}
            />
            <section className="mt-8 flex flex-col gap-2" data-testid="provider-danger">
              <h2 className="font-medium text-destructive text-sm">Danger</h2>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/3 px-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm">Delete provider</span>
                  <span className="text-muted-foreground text-xs">
                    Stored models on this provider leave the list.
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => handleDeleteProvider(selected.id, selected.name)}
                  data-testid="provider-delete"
                >
                  Delete
                </Button>
              </div>
            </section>
          </div>
        </>
      ) : (
        providers.length === 0 && (
          <Empty className="min-h-0 border-0 md:col-start-2 md:row-start-2">
            <EmptyHeader>
              <EmptyTitle>No providers</EmptyTitle>
              <EmptyDescription>
                Add a provider to list the models this workspace can run.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}
    </div>
  );
}
