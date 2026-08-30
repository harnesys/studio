import type { DiscoveredModelView } from '@studio/shared';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { catalogQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { alert, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Switch } from '@/shared/ui/switch';

import {
  useAttachProviderModel,
  useCreateProvider,
  useDeleteProvider,
  useDetachProviderModel,
  useDiscoverProviderModels,
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

  const selected = providers.find((item) => item.id === settingsProviderId) ?? null;
  const found = selected ? (foundByProvider[selected.id] ?? null) : null;

  function openProvider(id: string, replace = false) {
    if (!workspaceId) {
      return;
    }
    setShowKey(false);
    void navigate(studioPath.settings(workspaceId, 'providers', id), { replace });
  }

  useEffect(() => {
    if (!workspaceId || providers.length === 0) {
      return;
    }
    if (settingsProviderId && providers.some((item) => item.id === settingsProviderId)) {
      return;
    }
    openProvider(providers[0].id, true);
  }, [workspaceId, settingsProviderId, providers]);

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
