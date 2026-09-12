import { useDeleteWorkspace, useWorkspaces } from '@/entities/workspace';
import { confirmDeleteWorkspace } from '@/features/create-workspace';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';

export function WorkspacePane() {
  const { workspaceId } = useStudioLocation();
  const workspacesQuery = useWorkspaces();
  const workspace = (workspacesQuery.data ?? []).find((item) => item.id === workspaceId) ?? null;
  const removeWorkspace = useDeleteWorkspace();
  const { leaveWorkspace } = useStudioNavigation();

  const handleDelete = () => {
    if (!workspace) {
      return;
    }
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
    <div className="flex flex-col gap-6" data-testid="workspace-pane">
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
            disabled={!workspace || removeWorkspace.isPending}
            onClick={handleDelete}
            data-testid="workspace-delete"
          >
            Delete
          </Button>
        </div>
      </section>
    </div>
  );
}
