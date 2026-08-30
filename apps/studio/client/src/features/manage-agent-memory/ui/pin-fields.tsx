import { type Control, Controller } from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

import type { PinFieldsInput } from '../model/pin-fields';

export function PinFields({
  control,
  keyLocked = false,
}: {
  control: Control<PinFieldsInput>;
  keyLocked?: boolean;
}) {
  return (
    <>
      <Controller
        control={control}
        name="key"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="pin-key">Key</FieldLabel>
            <Input
              {...field}
              id="pin-key"
              className="font-mono"
              placeholder="preferred_name"
              disabled={keyLocked}
              aria-invalid={fieldState.invalid || undefined}
            />
            {keyLocked ? <FieldDescription>Key is fixed after create.</FieldDescription> : null}
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="text"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="pin-text">Text</FieldLabel>
            <Textarea
              {...field}
              id="pin-text"
              className="min-h-24 resize-y text-xs leading-relaxed"
              placeholder="Pinned fact the agent should keep."
              aria-invalid={fieldState.invalid || undefined}
            />
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
    </>
  );
}
