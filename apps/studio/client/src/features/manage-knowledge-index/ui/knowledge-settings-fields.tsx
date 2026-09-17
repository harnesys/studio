import type {
  KnowledgeRootRecord,
  KnowledgeSettings,
  MemorySearchBackend,
} from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  listWorkspaceFiles,
  watchWorkspaceFiles,
  writeWorkspaceFileContent,
} from '@/shared/api/files';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';

import { EmbedModelSelect } from './embed-model-select';
import { KnowledgeRootsList } from './knowledge-roots-list';

const BACKENDS: MemorySearchBackend[] = ['fts', 'vector'];

const BACKEND_LABELS: Record<MemorySearchBackend, string> = {
  fts: 'FTS',
  vector: 'Vector',
};

type KnowledgeRootUpsert = {
  path: string;
  enabled: boolean;
};

type KnowledgeSettingsFieldsProps = {
  workspaceId?: string;
  settings: KnowledgeSettings;
  disabled?: boolean;
  roots: KnowledgeRootRecord[];
  rootsLoading?: boolean;
  onUpsertRoot: (body: KnowledgeRootUpsert) => void;
  onRemoveRoot: (path: string) => void;
  onPatch: (patch: {
    entireWorkspace?: boolean;
    backend?: MemorySearchBackend;
    embedProvider?: string | null;
    embedModel?: string | null;
    watchEnabled?: boolean;
  }) => void;
};

export function KnowledgeSettingsFields({
  workspaceId,
  settings,
  disabled,
  roots,
  rootsLoading,
  onUpsertRoot,
  onRemoveRoot,
  onPatch,
}: KnowledgeSettingsFieldsProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<KnowledgeSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const patchDraft = (patch: Partial<KnowledgeSettings>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const rootFilesQuery = useQuery({
    queryKey: ['workspace-files', workspaceId],
    queryFn: () => listWorkspaceFiles(workspaceId as string),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    return watchWorkspaceFiles(workspaceId, () => {
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
    });
  }, [workspaceId, qc]);

  const names = new Set((rootFilesQuery.data ?? []).map((entry) => entry.name));
  const hasGitIgnore = names.has('.gitignore');
  const hasHarnesysIgnore = names.has('.harnesysignore');
  const showGitLink = Boolean(workspaceId) && rootFilesQuery.isSuccess && !hasGitIgnore;
  const showHarnesysLink = Boolean(workspaceId) && rootFilesQuery.isSuccess && !hasHarnesysIgnore;

  const createIgnoreFile = useMutation({
    mutationFn: (path: '.gitignore' | '.harnesysignore') =>
      writeWorkspaceFileContent(workspaceId as string, { path, content: '' }),
    onSuccess: (_data, path) => {
      void qc.invalidateQueries({ queryKey: ['workspace-files', workspaceId] });
      toast.add({ title: `${path} created` });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Request failed';
      toast.add({ title: 'Failed to create file', description: message });
    },
  });

  const hasEmbed = Boolean(draft.embedProvider?.trim()) && Boolean(draft.embedModel?.trim());
  const vectorNeedsEmbed = draft.backend === 'vector' && !hasEmbed;
  const dirty =
    draft.entireWorkspace !== settings.entireWorkspace ||
    draft.backend !== settings.backend ||
    draft.embedProvider !== settings.embedProvider ||
    draft.embedModel !== settings.embedModel ||
    draft.watchEnabled !== settings.watchEnabled;

  const save = () => {
    onPatch({
      entireWorkspace: draft.entireWorkspace,
      backend: draft.backend,
      embedProvider: draft.embedProvider,
      embedModel: draft.embedModel,
      watchEnabled: draft.watchEnabled,
    });
  };

  return (
    <FieldGroup className="gap-1">
      <Field orientation="horizontal" className="rounded-md px-2 py-2 hover:bg-muted/60">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <FieldLabel htmlFor="knowledge-entire-workspace" className="font-normal">
            Entire workspace
          </FieldLabel>
          <FieldDescription>Index every text file under the workspace root.</FieldDescription>
        </div>
        <Switch
          id="knowledge-entire-workspace"
          checked={draft.entireWorkspace}
          disabled={disabled}
          onCheckedChange={(entireWorkspace) => patchDraft({ entireWorkspace })}
        />
      </Field>

      {!draft.entireWorkspace ? (
        <KnowledgeRootsList
          roots={roots}
          loading={rootsLoading}
          busy={false}
          disabled={disabled}
          onUpsert={onUpsertRoot}
          onRemove={onRemoveRoot}
        />
      ) : null}

      <Field orientation="horizontal" className="rounded-md px-2 py-2 hover:bg-muted/60">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <FieldLabel htmlFor="knowledge-watch" className="font-normal">
            Watch
          </FieldLabel>
          <FieldDescription>Reindex when watched files change.</FieldDescription>
        </div>
        <Switch
          id="knowledge-watch"
          checked={draft.watchEnabled}
          disabled={disabled}
          onCheckedChange={(watchEnabled) => patchDraft({ watchEnabled })}
        />
      </Field>

      <Field className="gap-1.5 rounded-md px-2 py-2">
        <FieldLabel htmlFor="knowledge-backend">Backend</FieldLabel>
        <FieldDescription>Full-text or vector recall.</FieldDescription>
        <Select
          items={BACKENDS.map((value) => ({ value, label: BACKEND_LABELS[value] }))}
          value={draft.backend}
          onValueChange={(next) => {
            if (next === 'fts' || next === 'vector') {
              patchDraft({ backend: next });
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger id="knowledge-backend" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {BACKENDS.map((value) => (
              <SelectItem key={value} value={value}>
                {BACKEND_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {draft.backend === 'vector' && (
        <Field className="gap-1.5 rounded-md px-2 py-2">
          <FieldLabel
            htmlFor="knowledge-embed-model"
            className={vectorNeedsEmbed ? 'text-destructive' : undefined}
          >
            Embed model
          </FieldLabel>
          <FieldDescription>Model for vector chunks.</FieldDescription>
          {vectorNeedsEmbed ? (
            <FieldDescription className="text-destructive">
              Pick an embed model before saving the vector backend.
            </FieldDescription>
          ) : null}
          <div className={vectorNeedsEmbed ? 'rounded-md ring-2 ring-destructive/60' : undefined}>
            <EmbedModelSelect
              id="knowledge-embed-model"
              workspaceId={workspaceId ?? ''}
              embedProvider={draft.embedProvider}
              embedModel={draft.embedModel}
              disabled={disabled}
              onChange={(next) => patchDraft(next)}
            />
          </div>
        </Field>
      )}

      <FieldDescription className="px-2 py-1">
        Indexing respects{' '}
        {showGitLink ? (
          <button
            type="button"
            className="font-mono text-primary underline underline-offset-2 hover:text-primary/80 disabled:opacity-50"
            disabled={createIgnoreFile.isPending || Boolean(disabled)}
            onClick={() => createIgnoreFile.mutate('.gitignore')}
            data-testid="create-gitignore"
          >
            .gitignore
          </button>
        ) : (
          <span className="font-mono">.gitignore</span>
        )}{' '}
        and{' '}
        {showHarnesysLink ? (
          <button
            type="button"
            className="font-mono text-primary underline underline-offset-2 hover:text-primary/80 disabled:opacity-50"
            disabled={createIgnoreFile.isPending || Boolean(disabled)}
            onClick={() => createIgnoreFile.mutate('.harnesysignore')}
            data-testid="create-harnesysignore"
          >
            .harnesysignore
          </button>
        ) : (
          <span className="font-mono">.harnesysignore</span>
        )}
        .
      </FieldDescription>

      <div className="flex items-center justify-end gap-2 px-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !dirty}
          onClick={() => setDraft(settings)}
        >
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !dirty || vectorNeedsEmbed}
          onClick={save}
          data-testid="knowledge-settings-save"
        >
          Save
        </Button>
      </div>
    </FieldGroup>
  );
}
