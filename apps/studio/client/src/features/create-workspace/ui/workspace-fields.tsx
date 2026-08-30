import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

type WorkspaceFieldsProps = {
  name: string;
  path: string;
  nameRequired?: boolean;
  pathRequired?: boolean;
  picking?: boolean;
  onNameChange: (value: string) => void;
  onPick: () => void;
};

export function WorkspaceFields({
  name,
  path,
  nameRequired = false,
  pathRequired = false,
  picking = false,
  onNameChange,
  onPick,
}: WorkspaceFieldsProps) {
  const nameInvalid = nameRequired && name.trim().length === 0;
  const pathInvalid = pathRequired && path.trim().length === 0;

  return (
    <FieldGroup>
      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Northstar Labs"
          aria-invalid={nameInvalid || undefined}
        />
        {!nameRequired ? (
          <FieldDescription>Leave empty to use the folder name.</FieldDescription>
        ) : null}
      </Field>
      <Field data-invalid={pathInvalid || undefined}>
        <FieldLabel htmlFor="workspace-path">Folder</FieldLabel>
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
        {pathRequired ? (
          <FieldDescription>Must already exist on disk.</FieldDescription>
        ) : (
          <FieldDescription>
            Optional. Leave empty to use <code>~/.harnesys/workspaces/&lt;name&gt;</code>.
          </FieldDescription>
        )}
      </Field>
    </FieldGroup>
  );
}
