import type { DiscoveredModelView, ProviderExportBundle } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, PlusIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { catalogQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { alert, dialog } from '@/shared/services/overlay';
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

export function ModelsPane() {
  const navigate = useNavigate();
  const { workspaceId, settingsProviderId } = useStudioLocation();
  const catalog = useQuery(catalogQuery).data;
  const providersQuery = useProviders();
  const providers = providersQuery.data ?? [];
  const [foundByProvider, setFoundByProvider] = useState<Record<string, DiscoveredModelView[]>>({});
  const [showKey, setShowKey] = useState(false);
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const remove = useDeleteProvider();
  const discover = useDiscoverProviderModels();
  const attach = useAttachProviderModel();
  const patchModel = useUpdateProviderModel();
  const detach = useDetachProviderModel();
  const exportProviders = useExportProviders();
  const importProviders = useImportProviders();
  const importFileRef = useRef<HTMLInputElement>(null);

  const selected = providers.find((item) => item.id === settingsProviderId) ?? null;
  const found = selected ? (foundByProvider[selected.id] ?? null) : null;

  const openProvider = useCallback(
    (id: string, replace = false) => {
      if (!workspaceId) {
        return;
      }
      setShowKey(false);
      void navigate(studioPath.settings(workspaceId, 'providers', id), { replace });
    },
    [workspaceId, navigate],
  );

  useEffect(() => {
    if (!workspaceId || providers.length === 0) {
      return;
    }
    if (settingsProviderId && providers.some((item) => item.id === settingsProviderId)) {
      return;
    }
    openProvider(providers[0].id, true);
  }, [workspaceId, settingsProviderId, providers, openProvider]);

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

  return (
    <div
      className="grid gap-8 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-x-10 md:gap-y-2"
      data-testid="models-pane"
    >
      <p className="flex h-8 items-center px-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em] md:col-start-1 md:row-start-1">
        Providers
      </p>
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
                    ? 'flex h-8 items-center justify-between rounded-md bg-muted px-2 text-left font-medium text-sm'
                    : 'flex h-8 items-center justify-between rounded-md px-2 text-left text-muted-foreground text-sm hover:bg-muted/60 hover:text-foreground'
                }
                onClick={() => openProvider(item.id)}
              >
                <span className="truncate">{item.name}</span>
                <span
                  className={
                    item.enabled
                      ? 'font-mono text-[10px] text-live'
                      : 'font-mono text-[10px] text-muted-foreground'
                  }
                >
                  {item.enabled ? 'on' : 'off'}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground"
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
                  openProvider(provider.id);
                });
              });
          }}
        >
          <PlusIcon />
          Add provider
        </Button>
        <div className="mt-1 flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-muted-foreground"
            data-testid="providers-export"
            disabled={exportProviders.isPending || providers.length === 0}
            onClick={() => void handleExport()}
          >
            <DownloadIcon />
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-muted-foreground"
            data-testid="providers-import"
            disabled={importProviders.isPending}
            onClick={() => importFileRef.current?.click()}
          >
            <UploadIcon />
            Import
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
      </aside>

      {selected ? (
        <>
          <div className="flex h-8 min-w-0 items-center gap-2 md:col-start-2 md:row-start-1">
            <h2 className="font-medium text-sm">{selected.name}</h2>
            <span className="inline-flex items-center gap-2 text-sm">
              <Switch
                size="sm"
                checked={selected.enabled}
                onCheckedChange={(enabled) =>
                  update.mutate({ id: selected.id, enabled: Boolean(enabled) })
                }
              />
              Enabled
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete provider"
                onClick={() => {
                  void alert
                    .confirm({
                      title: `Delete ${selected.name}?`,
                      description: 'Stored models on this provider leave the list.',
                      confirmText: 'Delete',
                      variant: 'destructive',
                    })
                    .then((confirmed) => {
                      if (!confirmed) {
                        return;
                      }
                      void remove.mutateAsync(selected.id).then(() => {
                        setFoundByProvider((current) => {
                          const next = { ...current };
                          delete next[selected.id];
                          return next;
                        });
                        const next =
                          providers.find((item) => item.id !== selected.id)?.id ?? undefined;
                        if (workspaceId) {
                          void navigate(studioPath.settings(workspaceId, 'providers', next), {
                            replace: true,
                          });
                        }
                      });
                    });
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>

          <div className="min-w-0 md:col-start-2 md:row-start-2">
            <ProviderSettingsFields
              selected={selected}
              catalog={catalog}
              showKey={showKey}
              onToggleKey={() => setShowKey((value) => !value)}
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
