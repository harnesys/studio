import { useState } from 'react';

import {
  useDeleteWorkspace,
  usePickWorkspaceFolder,
  useUpdateWorkspace,
  useWorkspaces,
  type Workspace,
} from '@/entities/workspace';
import { confirmDeleteWorkspace, WorkspaceFields } from '@/features/create-workspace';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';

export function WorkspacePane() {
  const { workspaceId } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const workspace = (workspacesQuery.data ?? []).find((item) => item.id === workspaceId) ?? null;

  if (!workspace) {
    return null;
  }
  return (
    <div className="flex flex-col gap-6" data-testid="workspace-pane">
      <GeneralSection key={workspace.id} workspace={workspace} />
      <DangerSection workspace={workspace} />
    </div>
  );
}

function GeneralSection({ workspace }: { workspace: Workspace }) {
  const [name, setName] = useState(workspace.name);
  const [path, setPath] = useState(workspace.path);
  const update = useUpdateWorkspace();
  const pick = usePickWorkspaceFolder();
  const invalid = name.trim().length === 0 || path.trim().length === 0;
  const dirty = name.trim() !== workspace.name || path.trim() !== workspace.path;
  const busy = update.isPending || pick.isPending;

  const save = () => {
    void update
      .mutateAsync({
        id: workspace.id,
        name: name.trim(),
        path: path.trim(),
      })
      .then((next) => {
        setName(next.name);
        setPath(next.path);
      });
  };

  return (
    <section className="flex flex-col gap-4" data-testid="workspace-general">
      <h2 className="font-medium text-sm">General</h2>
      <WorkspaceFields
        name={name}
        path={path}
        nameRequired
        pathRequired
        picking={pick.isPending}
        onNameChange={setName}
        onPick={() => {
          void pick.mutateAsync().then((picked) => {
            if (picked?.path) {
              setPath(picked.path);
            }
          });
        }}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || invalid || busy} onClick={save}>
          Save
        </Button>
        {dirty ? <span className="text-muted-foreground text-xs">Unsaved changes</span> : null}
      </div>
    </section>
  );
}

function DangerSection({ workspace }: { workspace: Workspace }) {
  const removeWorkspace = useDeleteWorkspace();
  const { leaveWorkspace } = useStudioNavigation();

  const handleDelete = () => {
    void confirmDeleteWorkspace(workspace).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      void removeWorkspace.mutateAsync(workspace.id).then(() => {
        leaveWorkspace();
      });
    });
  };

  return (
    <section className="flex flex-col gap-2" data-testid="workspace-danger">
      <h2 className="font-medium text-destructive text-sm">Danger</h2>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 px-3 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">Delete workspace</span>
          <span className="text-muted-foreground text-xs">
            Removes this workspace from Studio. The folder on disk stays untouched.
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={removeWorkspace.isPending}
          onClick={handleDelete}
          data-testid="workspace-delete"
        >
          Delete
        </Button>
      </div>
    </section>
  );
}
