import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  hostStatusLabel,
  LOCAL_HOST,
  LOCAL_HOST_ID,
  NEW_HOST_ID,
  type StudioHost,
  useStudioHostsStore,
} from '../model/hosts.store';
import { HostPairFields } from './host-pair-fields';

type WorkspaceFieldsProps = {
  mode: 'create' | 'edit';
  /** Create mode: selected host id, NEW_HOST_ID while pairing. Edit mode pins the local host. */
  hostId?: string;
  name: string;
  path: string;
  nameRequired?: boolean;
  pathRequired?: boolean;
  picking?: boolean;
  onHostChange?: (id: string) => void;
  onPaired?: (host: StudioHost) => void;
  onNameChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onPick: () => void;
};

export function WorkspaceFields({
  mode,
  hostId,
  name,
  path,
  nameRequired = false,
  pathRequired = false,
  picking = false,
  onHostChange,
  onPaired,
  onNameChange,
  onPathChange,
  onPick,
}: WorkspaceFieldsProps) {
  const remotes = useStudioHostsStore((state) => state.remotes);
  const nameInvalid = nameRequired && name.trim().length === 0;
  const pathInvalid = pathRequired && path.trim().length === 0;
  const hostValue = mode === 'edit' ? LOCAL_HOST_ID : (hostId ?? LOCAL_HOST_ID);
  const pairing = mode === 'create' && hostValue === NEW_HOST_ID;
  const remote = mode === 'create' && hostValue !== LOCAL_HOST_ID;
  const hostItems = [
    { value: LOCAL_HOST_ID, label: `${LOCAL_HOST.name} · ${hostStatusLabel(LOCAL_HOST)}` },
    ...remotes.map((host) => ({
      value: host.id,
      label: `${host.name} · ${hostStatusLabel(host)}`,
    })),
    { value: NEW_HOST_ID, label: 'Connect a new host…' },
  ];

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="workspace-host">Host</FieldLabel>
        <Select
          items={hostItems}
          value={hostValue}
          disabled={mode === 'edit'}
          onValueChange={(next) => {
            if (typeof next === 'string') {
              onHostChange?.(next);
            }
          }}
        >
          <SelectTrigger id="workspace-host" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-full" align="start">
            {hostItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === 'edit' ? (
          <FieldDescription>
            The host is fixed. Agents move between hosts in a later version.
          </FieldDescription>
        ) : null}
      </Field>
      {pairing ? <HostPairFields onPaired={(host) => onPaired?.(host)} /> : null}
      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Northstar Labs"
          aria-invalid={nameInvalid || undefined}
        />
        {!nameRequired ? <FieldDescription>Defaults to the folder name.</FieldDescription> : null}
      </Field>
      <Field data-invalid={pathInvalid || undefined}>
        <FieldLabel htmlFor="workspace-path">Folder</FieldLabel>
        {remote ? (
          <Input
            id="workspace-path"
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            placeholder="/srv/work/client"
            autoComplete="off"
            aria-invalid={pathInvalid || undefined}
          />
        ) : (
          <div className="flex gap-2">
            <Input
              id="workspace-path"
              value={path}
              readOnly
              placeholder="Choose a folder"
              aria-invalid={pathInvalid || undefined}
            />
            <Button type="button" variant="outline" disabled={picking} onClick={onPick}>
              {picking ? '…' : 'Choose'}
            </Button>
          </div>
        )}
        <FieldDescription>
          {folderDescription(mode, pairing, remote, pathRequired)}
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

function folderDescription(
  mode: 'create' | 'edit',
  pairing: boolean,
  remote: boolean,
  pathRequired: boolean,
): string {
  if (mode === 'edit') {
    return 'Must already exist on disk.';
  }
  if (pairing) {
    return 'After pairing, enter the folder path on the new host.';
  }
  if (remote) {
    return 'Path on the selected host. Creation on a remote host lands with the host backend.';
  }
  if (pathRequired) {
    return 'Must already exist on disk.';
  }
  return 'Optional. Leave empty to use ~/.harnesys/workspaces/<name>.';
}
