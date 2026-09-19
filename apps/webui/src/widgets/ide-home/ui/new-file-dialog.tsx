import { useState } from 'react';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
export function NewFileDialog({ onResolve }: DialogComponentProps<string>) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const isValid = trimmed.length > 0 && !trimmed.includes('..');
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed) {
      setError('File name is required');
      return;
    }
    if (trimmed.includes('..')) {
      setError('File name cannot contain ".."');
      return;
    }
    onResolve?.(trimmed);
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="new-file-name">File name</FieldLabel>
        <Input
          id="new-file-name"
          placeholder="notes.md"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          autoFocus
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid}>
          Create file
        </Button>
      </DialogFooter>
    </form>
  );
}
