import { useQuery } from '@tanstack/react-query';
import { GitBranchIcon } from 'lucide-react';
import { getGitStatus, gitStatusQueryKey } from '@/shared/api/git';
import { Badge } from '@/shared/ui/badge';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

type DecorationsMode = 'auto' | 'on' | 'off';
function getDecorationsMode(): DecorationsMode {
  try {
    const v = localStorage.getItem('git-decorations');
    if (v === 'on' || v === 'off' || v === 'auto') {
      return v;
    }
  } catch {}
  return 'auto';
}
export function GitPane({ workspaceId }: { workspaceId: string }) {
  const statusQuery = useQuery({
    queryKey: gitStatusQueryKey(workspaceId),
    queryFn: () => getGitStatus(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const status = statusQuery.data;
  const isGit = status?.isGit === true;
  const handleDecorationsChange = (value: string) => {
    try {
      localStorage.setItem('git-decorations', value);
    } catch {}
  };
  if (!workspaceId) {
    return (
      <FieldGroup>
        <Field>
          <FieldLabel>Git</FieldLabel>
          <FieldDescription>No workspace selected.</FieldDescription>
        </Field>
      </FieldGroup>
    );
  }
  if (statusQuery.isLoading) {
    return (
      <FieldGroup>
        <div className="text-muted-foreground text-sm">Loading git status...</div>
      </FieldGroup>
    );
  }
  return (
    <FieldGroup className="gap-5">
      <Field>
        <FieldLabel>Workspace Git</FieldLabel>
        <FieldDescription>
          Read-only diagnostics for current workspace. Branch switching lives in the left sidebar
          above Settings.
        </FieldDescription>
      </Field>

      {!isGit ? (
        <Field>
          <div className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-sm">
            This workspace is not a git repository. Initialize with <code>git init</code> to enable
            branch UI and file decorations.
          </div>
          {status &&
          'gitVersion' in status &&
          (
            status as {
              gitVersion?: string | null;
            }
          ).gitVersion ? (
            <FieldDescription>
              Git{' '}
              {
                (
                  status as {
                    gitVersion?: string;
                  }
                ).gitVersion
              }
            </FieldDescription>
          ) : (
            <FieldDescription>Git not found on server.</FieldDescription>
          )}
        </Field>
      ) : (
        <>
          <div className="grid gap-3 rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <GitBranchIcon className="size-4 text-muted-foreground" />
              <span className="font-medium">
                {(() => {
                  let branchLabel: string;
                  if (status.noCommits) {
                    branchLabel = `${status.branch ?? 'HEAD'} (no commits)`;
                  } else if (status.detached) {
                    branchLabel = `detached at ${status.head?.slice(0, 7)}`;
                  } else {
                    branchLabel = status.branch ?? 'HEAD';
                  }
                  return branchLabel;
                })()}
              </span>
              {status.dirty ? (
                <Badge variant="secondary" className="text-amber-700">
                  dirty • {status.dirtyCount}
                </Badge>
              ) : (
                <Badge variant="outline">clean</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Ahead</span> {status.ahead}
              </div>
              <div>
                <span className="text-muted-foreground">Behind</span> {status.behind}
              </div>
              <div>
                <span className="text-muted-foreground">Remote</span> {status.remote ?? '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Git</span> {status.gitVersion ?? 'unknown'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">user.name</span>{' '}
                {status.gitUser?.name ?? '—'}
              </div>
              <div>
                <span className="text-muted-foreground">user.email</span>{' '}
                {status.gitUser?.email ?? '—'}
              </div>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Branches</span>{' '}
              {status.branches?.local.length ?? 0} local, {status.branches?.recent.length ?? 0}{' '}
              recent
            </div>
          </div>

          <Field>
            <Label>File decorations</Label>
            <Select
              defaultValue={getDecorationsMode()}
              onValueChange={(v: string | null) => handleDecorationsChange(v ?? 'auto')}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (large repo off)</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Auto disables per-file colors when `git status` exceeds 800ms (large repo). Expand a
              folder to load lazily.
            </FieldDescription>
          </Field>
        </>
      )}
    </FieldGroup>
  );
}
