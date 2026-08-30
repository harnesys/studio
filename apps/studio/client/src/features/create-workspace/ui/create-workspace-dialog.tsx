import { useState } from 'react';

import { useCreateWorkspace, usePickWorkspaceFolder, type Workspace } from '@/entities/workspace';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

import { WorkspaceFields } from './workspace-fields';

export function CreateWorkspaceDialog({ onResolve }: DialogComponentProps<Workspace>) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const create = useCreateWorkspace();
  const pick = usePickWorkspaceFolder();
  const trimmedName = name.trim();
  const trimmedPath = path.trim();
  const invalid = trimmedName.length === 0 && trimmedPath.length === 0;
  const nameRequired = trimmedPath.length === 0;
  const busy = create.isPending || pick.isPending;

  return (
    <>
      <WorkspaceFields
        name={name}
        path={path}
        nameRequired={nameRequired}
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
          disabled={invalid || busy}
          onClick={() => {
            void create
              .mutateAsync({
                ...(trimmedPath ? { path: trimmedPath } : {}),
                ...(trimmedName ? { name: trimmedName } : {}),
              })
              .then((workspace) => onResolve?.(workspace));
          }}
        >
          Create workspace
        </Button>
      </DialogFooter>
    </>
  );
}
