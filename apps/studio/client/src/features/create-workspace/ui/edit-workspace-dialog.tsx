import { useState } from 'react';

import { usePickWorkspaceFolder, useUpdateWorkspace, type Workspace } from '@/entities/workspace';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

import { WorkspaceFields } from './workspace-fields';

export function EditWorkspaceDialog({
  onResolve,
  data,
}: DialogComponentProps<Workspace, { workspace: Workspace }>) {
  const workspace = data?.workspace;
  const [name, setName] = useState(workspace?.name ?? '');
  const [path, setPath] = useState(workspace?.path ?? '');
  const update = useUpdateWorkspace();
  const pick = usePickWorkspaceFolder();
  const invalid = name.trim().length === 0 || path.trim().length === 0;
  const busy = update.isPending || pick.isPending;

  return (
    <>
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
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          disabled={!workspace || invalid || busy}
          onClick={() => {
            if (!workspace) {
              return;
            }
            void update
              .mutateAsync({
                id: workspace.id,
                name: name.trim(),
                path: path.trim(),
              })
              .then((next) => onResolve?.(next));
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
