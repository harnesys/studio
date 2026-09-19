import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useDeleteWorkspace,
  usePickWorkspaceFolder,
  useUpdateWorkspace,
  useWipeWorkspace,
  useWorkspaces,
  type Workspace,
} from '@/entities/workspace';
import { WorkspaceFields } from '@/features/create-workspace';
import { useWorkspaceTabsStore } from '@/features/desk';
import { navigateAfterPark } from '@/features/ide';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
export function GeneralPane({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const workspacesQuery = useWorkspaces();
  const workspace = (workspacesQuery.data ?? []).find((item) => item.id === workspaceId) ?? null;
  if (!workspace) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="workspace-general-missing">
        Workspace is not on this host.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6" data-testid="workspace-general-pane">
      <GeneralSection key={workspace.id} workspace={workspace} />
      <LifecycleSection workspace={workspace} onClose={onClose} />
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
        toast.add({ title: 'Workspace saved' });
      })
      .catch((error: unknown) => {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not save workspace',
        });
      });
  };
  return (
    <section className="flex flex-col gap-4" data-testid="workspace-general">
      <WorkspaceFields
        mode="edit"
        name={name}
        path={path}
        nameRequired
        pathRequired
        picking={pick.isPending}
        onNameChange={setName}
        onPathChange={setPath}
        onPick={() => {
          void pick.mutateAsync().then((picked) => {
            if (picked?.path) {
              setPath(picked.path);
            }
          });
        }}
      />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="workspace-id">Id</FieldLabel>
          <Input id="workspace-id" value={workspace.id} readOnly />
          <FieldDescription>Assigned by the host. Read-only.</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || invalid || busy} onClick={save}>
          Save
        </Button>
        {dirty ? <span className="text-muted-foreground text-xs">Unsaved changes</span> : null}
      </div>
    </section>
  );
}
function LifecycleSection({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const navigate = useNavigate();
  const removeWorkspace = useDeleteWorkspace();
  const wipeWorkspace = useWipeWorkspace();
  const toggle = useWorkspaceTabsStore((state) => state.toggle);
  const selected = useWorkspaceTabsStore((state) => state.selected);
  const inWindow = selected.includes(workspace.id);
  const parkAfterRemove = () => {
    if (useWorkspaceTabsStore.getState().selected.includes(workspace.id)) {
      toggle(workspace.id);
      const remaining = useWorkspaceTabsStore.getState().selected;
      navigateAfterPark(
        (to) => {
          void navigate(to);
        },
        workspace.id,
        remaining,
      );
    }
    onClose();
  };
  const removeFromWindow = () => {
    if (!inWindow) {
      onClose();
      return;
    }
    toggle(workspace.id);
    const remaining = useWorkspaceTabsStore.getState().selected;
    navigateAfterPark(
      (to) => {
        void navigate(to);
      },
      workspace.id,
      remaining,
    );
    onClose();
  };
  const removeFromHost = () => {
    void alert
      .confirm({
        title: `Remove ${workspace.name} from host?`,
        description:
          'Stops listing this node on the host. The folder on disk stays. Studio does not wipe workspace files here.',
        confirmText: 'Remove from host',
        variant: 'destructive',
        testId: 'remove-workspace-from-host-dialog',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        void removeWorkspace
          .mutateAsync(workspace.id)
          .then(parkAfterRemove)
          .catch((error: unknown) => {
            toast.add({
              title: error instanceof Error ? error.message : 'Could not remove workspace',
            });
          });
      });
  };
  const wipeData = () => {
    void alert
      .confirm({
        title: `Delete ${workspace.name} workspace.db?`,
        description:
          'Stops the node and deletes `<path>/.harnesys/workspace.db`. The folder stays unless you confirm the next step.',
        confirmText: 'Delete workspace.db',
        variant: 'destructive',
        testId: 'wipe-workspace-db-dialog',
      })
      .then((confirmedDb) => {
        if (!confirmedDb) {
          return;
        }
        void alert
          .confirm({
            title: `Also delete the folder ${workspace.path}?`,
            description:
              'Optional. Default is to keep the user folder and only remove workspace.db / host registration.',
            confirmText: 'Delete folder too',
            cancelText: 'Keep folder',
            variant: 'destructive',
            testId: 'wipe-workspace-folder-dialog',
          })
          .then((wipeFolder) => {
            void wipeWorkspace
              .mutateAsync({ id: workspace.id, wipeFolder: wipeFolder === true })
              .then(parkAfterRemove)
              .catch((error: unknown) => {
                toast.add({
                  title: error instanceof Error ? error.message : 'Could not wipe workspace',
                });
              });
          });
      });
  };
  return (
    <section className="flex flex-col gap-3" data-testid="workspace-lifecycle">
      <h2 className="font-medium text-sm">Lifecycle</h2>
      <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">Remove from window</span>
          <span className="text-muted-foreground text-xs">
            Drops this node from the desk selection. It stays on the host.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!inWindow}
          onClick={removeFromWindow}
          data-testid="workspace-remove-from-window"
        >
          Remove from window
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/3 px-3 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">Remove from host</span>
          <span className="text-muted-foreground text-xs">
            Unregisters the node. The folder on disk stays.
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={removeWorkspace.isPending || wipeWorkspace.isPending}
          onClick={removeFromHost}
          data-testid="workspace-remove-from-host"
        >
          Remove from host
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/3 px-3 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">Delete workspace data</span>
          <span className="text-muted-foreground text-xs">
            Deletes workspace.db. Optional second confirm removes the folder.
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={removeWorkspace.isPending || wipeWorkspace.isPending}
          onClick={wipeData}
          data-testid="workspace-wipe-data"
        >
          Delete data
        </Button>
      </div>
    </section>
  );
}
