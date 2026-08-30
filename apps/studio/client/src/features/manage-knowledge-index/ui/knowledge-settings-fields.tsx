import type { KnowledgeSettings, MemorySearchBackend } from '@studio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  listWorkspaceFiles,
  watchWorkspaceFiles,
  writeWorkspaceFileContent,
} from '@/shared/api/files';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';

import { EmbedModelSelect } from './embed-model-select';

const BACKENDS: MemorySearchBackend[] = ['fts', 'vector'];

type KnowledgeSettingsFieldsProps = {
  workspaceId?: string;
  settings: KnowledgeSettings;
  disabled?: boolean;
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
  onPatch,
}: KnowledgeSettingsFieldsProps) {
  const qc = useQueryClient();

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

  return (
    <div className="flex flex-col gap-4">
      <Field orientation="horizontal" className="items-center justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel htmlFor="knowledge-entire-workspace">Entire workspace</FieldLabel>
          <FieldDescription>Index every text file under the workspace root.</FieldDescription>
        </div>
        <Switch
          id="knowledge-entire-workspace"
          size="sm"
          checked={settings.entireWorkspace}
          disabled={disabled}
          onCheckedChange={(entireWorkspace) =>
            onPatch({ entireWorkspace: Boolean(entireWorkspace) })
          }
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="knowledge-backend">Backend</FieldLabel>
          <Select
            items={BACKENDS.map((value) => ({ value, label: value }))}
            value={settings.backend}
            onValueChange={(next) => {
              if (next === 'fts' || next === 'vector') {
                onPatch({ backend: next });
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger id="knowledge-backend" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {BACKENDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field className="gap-1.5">
          <FieldLabel htmlFor="knowledge-embed-model">Embed model</FieldLabel>
          <EmbedModelSelect
            id="knowledge-embed-model"
            embedProvider={settings.embedProvider}
            embedModel={settings.embedModel}
            disabled={disabled}
            onChange={(next) => onPatch(next)}
          />
        </Field>
      </div>

      <Field orientation="horizontal" className="items-center justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel htmlFor="knowledge-watch">Watch</FieldLabel>
          <FieldDescription>Reindex when watched files change.</FieldDescription>
        </div>
        <Switch
          id="knowledge-watch"
          size="sm"
          checked={settings.watchEnabled}
          disabled={disabled}
          onCheckedChange={(watchEnabled) => onPatch({ watchEnabled: Boolean(watchEnabled) })}
        />
      </Field>

      <p className="text-muted-foreground text-xs leading-snug">
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
      </p>
    </div>
  );
}
