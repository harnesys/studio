import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  getGitFileStatus,
  getGitStatus,
  gitFileStatusQueryKey,
  gitStatusQueryKey,
} from '@/shared/api/git';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldError } from '@/shared/ui/field';
import { Textarea } from '@/shared/ui/textarea';

import {
  type CommitDialogResult,
  type CommitInput,
  commitSchema,
  emptyCommit,
} from '../model/git-commit';
import { GitCommitDiffView } from './git-commit-diff-view';
import { GitCommitFileList } from './git-commit-file-list';

type DialogData = {
  workspaceId: string;
  message?: string;
  focusPath?: string;
};

export function GitCommitDialog({
  onResolve,
  data,
}: DialogComponentProps<CommitDialogResult, DialogData>) {
  const workspaceId = data?.workspaceId ?? '';
  const form = useForm<CommitInput, unknown, CommitDialogResult>({
    resolver: zodResolver(commitSchema),
    defaultValues: data?.message ? { message: data.message } : emptyCommit(),
  });

  const statusQuery = useQuery({
    queryKey: gitFileStatusQueryKey(workspaceId),
    queryFn: () => getGitFileStatus(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const gitStatusQuery = useQuery({
    queryKey: gitStatusQueryKey(workspaceId),
    queryFn: () => getGitStatus(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const hasRemote = Boolean(gitStatusQuery.data?.isGit && gitStatusQuery.data.remote);

  const statusMap = statusQuery.data?.map ?? {};
  const files = Object.entries(statusMap)
    .filter(([, s]) => s !== 'ignored')
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const [selected, setSelected] = useState<string | null>(data?.focusPath ?? null);

  useEffect(() => {
    if (files.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !files.some((f) => f.path === selected)) {
      setSelected(files[0]?.path ?? null);
    }
  }, [files, selected]);

  const hasChanges = files.length > 0;

  const handleCommit = form.handleSubmit((values) => onResolve?.({ ...values, push: false }));
  const handleCommitPush = form.handleSubmit((values) => onResolve?.({ ...values, push: true }));

  return (
    <form className="flex min-h-0 flex-col gap-4" onSubmit={handleCommit}>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
        <div className="flex h-[56vh] min-h-[340px] flex-col sm:flex-row">
          <div className="flex min-h-0 w-full shrink-0 flex-col border-b bg-card sm:w-[320px] sm:border-r sm:border-b-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <GitCommitFileList
                files={files}
                selectedPath={selected}
                onSelect={setSelected}
                isLoading={statusQuery.isPending}
              />
            </div>
            <div className="flex shrink-0 flex-col gap-1 border-t bg-card p-3">
              <Controller
                control={form.control}
                name="message"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <Textarea
                      {...field}
                      id="git-commit-message"
                      placeholder={hasChanges ? 'Commit message' : 'No changes to commit'}
                      rows={4}
                      autoFocus
                      className="min-h-[80px] resize-y text-sm"
                      aria-invalid={fieldState.invalid || undefined}
                    />
                    {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
                  </Field>
                )}
              />
              {!hasRemote ? (
                <p className="text-[11px] text-muted-foreground">No remote — push disabled</p>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-[240px] flex-1 flex-col bg-background sm:min-h-0">
            <GitCommitDiffView workspaceId={workspaceId} path={selected} />
          </div>
        </div>
      </div>

      <DialogFooter>
        <div className="mr-auto hidden min-w-0 flex-1 items-center sm:flex">
          {selected ? (
            <span
              className="truncate font-mono text-[10px] text-muted-foreground leading-tight"
              title={selected}
            >
              {selected}
            </span>
          ) : null}
        </div>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleCommitPush}
          disabled={!hasChanges || !hasRemote}
          title={!hasRemote ? 'No remote configured' : 'Commit and push to remote'}
        >
          Commit & Push
        </Button>
        <Button type="button" onClick={handleCommit} disabled={!hasChanges}>
          Commit{hasChanges ? ` · ${files.length}` : ''}
        </Button>
      </DialogFooter>
    </form>
  );
}
