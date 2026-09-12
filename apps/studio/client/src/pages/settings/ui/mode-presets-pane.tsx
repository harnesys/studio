import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
import {
  createModePreset,
  deleteModePreset,
  type ModePresetPatch,
  type ModePresetRecord,
  modePresetsQuery,
  modePresetsQueryKey,
  updateModePreset,
  workspaceCapabilitiesQuery,
  workspaceSkillsQuery,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';

import type { ModePresetDraft } from './mode-preset-draft';
import { ModePresetEditor } from './mode-preset-editor';

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

type PresetEditing =
  | { kind: 'edit'; preset: ModePresetRecord }
  | { kind: 'draft'; preset: ModePresetRecord | null };

export function ModePresetsPane() {
  const { workspaceId } = useStudioLocation();
  const queryClient = useQueryClient();
  const presetsQuery = useQuery(modePresetsQuery);
  const presets = presetsQuery.data ?? [];
  const [editing, setEditing] = useState<PresetEditing | null>(null);
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const packsQuery = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const skillNames = (skillsQuery.data?.skills ?? []).map((skill) => skill.name);
  const packNames = (packsQuery.data?.capabilities ?? [])
    .filter((pack) => !pack.name.endsWith('-memory'))
    .map((pack) => pack.name);

  async function refreshCache() {
    await queryClient.invalidateQueries({ queryKey: modePresetsQueryKey });
  }

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

  function confirmRemove(preset: ModePresetRecord) {
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
  }

  function toggleEdit(preset: ModePresetRecord) {
    setEditing((current) =>
      current?.kind === 'edit' && current.preset.id === preset.id ? null : { kind: 'edit', preset },
    );
  }

  const draft = editing?.kind === 'draft' ? editing : null;

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
            onClick={() => setEditing({ kind: 'draft', preset: null })}
            data-testid="mode-presets-create"
          >
            <PlusIcon />
            New preset
          </Button>
        </div>
      </div>

      {presetsQuery.isPending && <p className="text-muted-foreground text-sm">Loading presets…</p>}
      {!presetsQuery.isPending &&
        (presets.length === 0 && !draft ? (
          <Empty className="min-h-0 border-0 py-8">
            <EmptyHeader>
              <EmptyTitle>No mode presets</EmptyTitle>
              <EmptyDescription>
                Presets install as agent modes; built-in ones seed the catalog.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {presets.map((preset) => {
              const expanded = editing?.kind === 'edit' && editing.preset.id === preset.id;
              return (
                <div key={preset.id} data-testid={`mode-preset-${preset.id}`}>
                  <ConfigEntityCard
                    title={preset.name}
                    badge={preset.builtin ? 'built-in' : 'preset'}
                    statusBadge={preset.installedByDefault ? 'By default' : undefined}
                    description={preset.description || preset.id}
                    initials={initialsFromLabel(preset.name || preset.id)}
                    expanded={expanded}
                    onClick={() => toggleEdit(preset)}
                    trailing={
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70"
                          aria-label={`Duplicate ${preset.name}`}
                          onClick={() =>
                            setEditing({
                              kind: 'draft',
                              preset: {
                                ...preset,
                                id: `${preset.id}-copy`,
                                builtin: false,
                              },
                            })
                          }
                          data-testid={`mode-preset-duplicate-${preset.id}`}
                        >
                          <CopyIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-70"
                          aria-label={`Delete ${preset.name}`}
                          disabled={preset.builtin}
                          onClick={() => confirmRemove(preset)}
                          data-testid={`mode-preset-remove-${preset.id}`}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    }
                  >
                    {expanded ? (
                      <ModePresetEditor
                        preset={preset}
                        skillNames={skillNames}
                        packNames={packNames}
                        busy={update.isPending}
                        onSave={(formDraft) =>
                          update.mutate(
                            { preset, draft: formDraft },
                            { onSuccess: () => setEditing(null) },
                          )
                        }
                        onCancel={() => setEditing(null)}
                      />
                    ) : null}
                  </ConfigEntityCard>
                </div>
              );
            })}
            {draft ? (
              <div data-testid="mode-preset-new">
                <ConfigEntityCard
                  title={draft.preset ? `Copy of ${draft.preset.name}` : 'New preset'}
                  badge="preset"
                  description={draft.preset?.description}
                  initials={initialsFromLabel(draft.preset?.name ?? 'new preset')}
                  expanded
                  onClick={() => setEditing(null)}
                >
                  <ModePresetEditor
                    preset={draft.preset}
                    skillNames={skillNames}
                    packNames={packNames}
                    busy={create.isPending}
                    onSave={(formDraft) =>
                      create.mutate(formDraft, { onSuccess: () => setEditing(null) })
                    }
                    onCancel={() => setEditing(null)}
                  />
                </ConfigEntityCard>
              </div>
            ) : null}
          </div>
        ))}
    </div>
  );
}
