import type { ModeOp, ModeOpGate } from '@harnesys/studio-shared';
import { MODE_OPS } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import {
  createModePreset,
  deleteModePreset,
  type ModePresetPatch,
  type ModePresetRecord,
  modePresetsQuery,
  modePresetsQueryKey,
  updateModePreset,
} from '@/shared/api';
import { alert, dialog } from '@/shared/services/overlay';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';

import { ModePresetDialog } from './mode-preset-dialog';
import type { ModePresetDraft } from './mode-preset-draft';

const OP_LABELS: Record<ModeOp, string> = {
  'fs.write': 'writes',
  process: 'shell',
  network: 'network',
  mcp: 'mcp',
};

const GATE_VARIANTS: Record<ModeOpGate, 'secondary' | 'outline' | 'destructive'> = {
  allow: 'secondary',
  ask: 'outline',
  deny: 'destructive',
};

const FALLBACK_GATE: ModeOpGate = 'ask';

function contentPatch(draft: ModePresetDraft): ModePresetPatch {
  return {
    name: draft.name,
    description: draft.description ?? '',
    instructions: draft.instructions ?? '',
    skills: draft.skills ?? [],
    packs: draft.packs ?? [],
    permissions: draft.permissions,
    installedByDefault: draft.installedByDefault,
  };
}

export function ModePresetsPane() {
  const queryClient = useQueryClient();
  const presetsQuery = useQuery(modePresetsQuery);
  const presets = presetsQuery.data ?? [];

  function replaceInCache(updated: ModePresetRecord) {
    queryClient.setQueryData<ModePresetRecord[]>(modePresetsQueryKey, (current) =>
      (current ?? []).map((preset) => (preset.id === updated.id ? updated : preset)),
    );
  }

  async function refreshCache() {
    await queryClient.invalidateQueries({ queryKey: modePresetsQueryKey });
  }

  const setInstalled = useMutation({
    mutationFn: (input: { id: string; installedByDefault: boolean }) =>
      updateModePreset(input.id, { installedByDefault: input.installedByDefault }),
    onSuccess: replaceInCache,
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not update preset',
      });
    },
  });

  const create = useMutation({
    mutationFn: (draft: ModePresetDraft) => createModePreset({ ...draft }),
    onSuccess: async (created) => {
      await refreshCache();
      toast.add({ title: 'Mode preset created', description: created.id });
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not create preset',
      });
    },
  });

  const update = useMutation({
    mutationFn: (input: { preset: ModePresetRecord; draft: ModePresetDraft }) =>
      updateModePreset(
        input.preset.id,
        input.preset.builtin
          ? { installedByDefault: input.draft.installedByDefault }
          : contentPatch(input.draft),
      ),
    onSuccess: async (updated) => {
      await refreshCache();
      toast.add({ title: 'Mode preset saved', description: updated.id });
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not save preset',
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteModePreset(id),
    onSuccess: async () => {
      await refreshCache();
      toast.add({ title: 'Mode preset deleted' });
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not delete preset',
      });
    },
  });

  function openCreate() {
    void dialog
      .open(ModePresetDialog, {
        title: 'New mode preset',
        className: 'sm:max-w-lg',
        testId: 'mode-preset-dialog',
      })
      .then((draft) => {
        if (draft) {
          create.mutate(draft);
        }
      });
  }

  function openDuplicate(preset: ModePresetRecord) {
    void dialog
      .open(ModePresetDialog, {
        title: `Duplicate ${preset.name}`,
        className: 'sm:max-w-lg',
        testId: 'mode-preset-dialog',
        data: { preset: { ...preset, id: `${preset.id}-copy`, builtin: false } },
      })
      .then((draft) => {
        if (draft) {
          create.mutate(draft);
        }
      });
  }

  function openEdit(preset: ModePresetRecord) {
    void dialog
      .open(ModePresetDialog, {
        title: `Edit ${preset.name}`,
        className: 'sm:max-w-lg',
        testId: 'mode-preset-dialog',
        data: { preset },
      })
      .then((draft) => {
        if (draft) {
          update.mutate({ preset, draft });
        }
      });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="mode-presets-pane">
      <div className="flex h-8 items-center gap-1">
        <p className="font-medium text-sm">Catalog</p>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={create.isPending}
            onClick={openCreate}
            data-testid="mode-presets-create"
          >
            <PlusIcon />
            New preset
          </Button>
        </div>
      </div>

      {presetsQuery.isPending && <p className="text-muted-foreground text-sm">Loading presets…</p>}
      {!presetsQuery.isPending &&
        (presets.length === 0 ? (
          <Empty className="min-h-0 border-0 py-8">
            <EmptyHeader>
              <EmptyTitle>No mode presets</EmptyTitle>
              <EmptyDescription>
                Presets install as agent modes; built-in ones seed the catalog.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex flex-col gap-1 rounded-md border px-3 py-2"
                data-testid={`mode-preset-${preset.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{preset.name}</span>
                  {preset.builtin ? <Badge variant="secondary">built-in</Badge> : null}
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {preset.id}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit ${preset.name}`}
                      onClick={() => openEdit(preset)}
                      data-testid={`mode-preset-edit-${preset.id}`}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Duplicate ${preset.name}`}
                      onClick={() => openDuplicate(preset)}
                      data-testid={`mode-preset-duplicate-${preset.id}`}
                    >
                      <CopyIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${preset.name}`}
                      disabled={preset.builtin}
                      onClick={() => {
                        void alert
                          .confirm({
                            title: `Delete ${preset.name}?`,
                            description: 'Agents keep their installed copies.',
                            confirmText: 'Delete',
                            variant: 'destructive',
                          })
                          .then((confirmed) => {
                            if (confirmed) {
                              remove.mutate(preset.id);
                            }
                          });
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
                {preset.description ? (
                  <p className="text-muted-foreground text-sm">{preset.description}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-1">
                  {MODE_OPS.map((op) => {
                    const gate = preset.permissions?.[op] ?? FALLBACK_GATE;
                    return (
                      <Badge key={op} variant={GATE_VARIANTS[gate]}>
                        {OP_LABELS[op]} {gate}
                      </Badge>
                    );
                  })}
                  {(preset.packs ?? []).map((pack) => (
                    <Badge key={pack} variant="outline">
                      pack: {pack}
                    </Badge>
                  ))}
                  {(preset.skills ?? []).length > 0 ? (
                    <Badge variant="outline">{(preset.skills ?? []).length} skills</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    size="sm"
                    checked={preset.installedByDefault}
                    disabled={setInstalled.isPending && setInstalled.variables?.id === preset.id}
                    onCheckedChange={(checked) =>
                      setInstalled.mutate({
                        id: preset.id,
                        installedByDefault: Boolean(checked),
                      })
                    }
                  />
                  <span className="text-muted-foreground text-xs">Install by default</span>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
