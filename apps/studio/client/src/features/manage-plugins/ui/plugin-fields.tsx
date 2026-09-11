import { type Control, Controller } from 'react-hook-form';

import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

import type { InstallPluginFieldsInput } from '../model/plugin-fields';

export function InstallPluginFields({ control }: { control: Control<InstallPluginFieldsInput> }) {
  return (
    <>
      <Controller
        control={control}
        name="source"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="plugin-source">Source</FieldLabel>
            <Input
              {...field}
              id="plugin-source"
              className="font-mono"
              placeholder="obra/superpowers"
              aria-invalid={fieldState.invalid || undefined}
            />
            <FieldDescription>`owner/repo` or a full git URL.</FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="trust"
        render={({ field }) => (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="plugin-trust"
              checked={field.value}
              onCheckedChange={(value) => field.onChange(value === true)}
            />
            <Label htmlFor="plugin-trust" className="font-normal text-sm">
              Trust on install
            </Label>
          </div>
        )}
      />
    </>
  );
}
