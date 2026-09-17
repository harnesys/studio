import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

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
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowHeader, RowList } from '@/shared/ui/capability-rows';
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
    packs: draft.packs ?? {},
    permissions: draft.permissions,
    installedByDefault: draft.installedByDefault,
  };
}

type PresetEditing =
  | { kind: 'edit'; preset: ModePresetRecord }
  | { kind: 'draft'; preset: ModePresetRecord | null };

export function ModePresetsPane({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const presetsQuery = useQuery(modePresetsQuery);
  const presets = presetsQuery.data ?? [];
  const [editing, setEditing] = useState<PresetEditing | null>(null);
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const packsQuery = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId),
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
    <div className="flex flex-col gap-2" data-testid="mode-presets-pane">
      <RowHeader label="Presets" count={presetsQuery.isPending ? undefined : presets.length}>
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
      </RowHeader>

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
          <RowList>
            {presets.map((preset) => {
              const expanded = editing?.kind === 'edit' && editing.preset.id === preset.id;
              const packCount = Object.keys(preset.packs ?? {}).length;
              const counts = [
                (preset.skills?.length ?? 0) > 0 ? `${preset.skills?.length} skills` : null,
                packCount > 0 ? `${packCount} packs` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={preset.id} data-testid={`mode-preset-${preset.id}`}>
                  <Row
                    title={preset.name}
                    mono={false}
                    meta={preset.builtin ? 'built-in' : undefined}
                    chips={
                      preset.installedByDefault ? <RowChip tone="accent">default</RowChip> : null
                    }
                    summary={
                      expanded
                        ? undefined
                        : [preset.description || preset.id, counts].filter(Boolean).join(' · ')
                    }
                    onToggle={() => toggleEdit(preset)}
                    expanded={expanded}
                    actions={
                      expanded ? undefined : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
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
                            aria-label={`Delete ${preset.name}`}
                            disabled={preset.builtin}
                            onClick={() => confirmRemove(preset)}
                            data-testid={`mode-preset-remove-${preset.id}`}
                          >
                            <Trash2Icon />
                          </Button>
                        </>
                      )
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
                  </Row>
                </div>
              );
            })}
            {draft ? (
              <div data-testid="mode-preset-new">
                <Row
                  title={draft.preset ? `Copy of ${draft.preset.name}` : 'New preset'}
                  mono={false}
                  meta="preset"
                  summary={draft.preset?.description}
                  onToggle={() => setEditing(null)}
                  expanded
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
                </Row>
              </div>
            ) : null}
          </RowList>
        ))}
    </div>
  );
}
