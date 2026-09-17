import { useState } from 'react';

import {
  useCreateWorkspace,
  usePickWorkspaceFolder,
  useUpdateWorkspace,
  type Workspace,
} from '@/entities/workspace';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

import { folderNameFromPath, LOCAL_HOST_ID } from '../model/hosts.store';
import { WorkspaceFields } from './workspace-fields';

/**
 * One form for workspace details: host → name → folder. Create and edit share it.
 * The host is fixed in edit mode; agents move between hosts in a later version.
 */
export function WorkspaceDetailsDialog({
  onResolve,
  data,
}: DialogComponentProps<Workspace, { workspace?: Workspace }>) {
  const workspace = data?.workspace ?? null;
  const editing = workspace !== null;
  const [hostId, setHostId] = useState<string>(LOCAL_HOST_ID);
  const [name, setName] = useState(workspace?.name ?? '');
  const [path, setPath] = useState(workspace?.path ?? '');
  const [nameTouched, setNameTouched] = useState(editing);
  const create = useCreateWorkspace();
  const update = useUpdateWorkspace();
  const pick = usePickWorkspaceFolder();

  const trimmedName = name.trim();
  const trimmedPath = path.trim();
  const invalid = editing
    ? trimmedName.length === 0 || trimmedPath.length === 0
    : trimmedName.length === 0 && trimmedPath.length === 0;
  const busy = create.isPending || update.isPending || pick.isPending;

  const applyPath = (next: string) => {
    setPath(next);
    if (!nameTouched) {
      setName(folderNameFromPath(next));
    }
  };

  return (
    <>
      <WorkspaceFields
        mode={editing ? 'edit' : 'create'}
        hostId={hostId}
        name={name}
        path={path}
        nameRequired={!editing && trimmedPath.length === 0}
        pathRequired={editing}
        picking={pick.isPending}
        onHostChange={setHostId}
        onPaired={(host) => setHostId(host.id)}
        onNameChange={(value) => {
          setNameTouched(true);
          setName(value);
        }}
        onPathChange={applyPath}
        onPick={() => {
          void pick.mutateAsync().then((picked) => {
            if (picked?.path) {
              applyPath(picked.path);
            }
          });
        }}
      />
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          disabled={invalid || busy || (!editing && hostId !== LOCAL_HOST_ID)}
          onClick={() => {
            if (editing) {
              if (!workspace) {
                return;
              }
              void update
                .mutateAsync({
                  id: workspace.id,
                  name: trimmedName,
                  path: trimmedPath,
                })
                .then((next) => onResolve?.(next));
              return;
            }
            void create
              .mutateAsync({
                ...(trimmedPath ? { path: trimmedPath } : {}),
                ...(trimmedName ? { name: trimmedName } : {}),
              })
              .then((created) => onResolve?.(created));
          }}
        >
          {editing ? 'Save' : 'Add workspace'}
        </Button>
      </DialogFooter>
    </>
  );
}
