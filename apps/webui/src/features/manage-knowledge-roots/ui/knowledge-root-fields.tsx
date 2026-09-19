import { type Control, Controller } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import type { KnowledgeRootFieldsInput } from '../model/knowledge-root-fields';
export function KnowledgeRootFields({ control }: { control: Control<KnowledgeRootFieldsInput> }) {
  return (
    <>
      <Controller
        control={control}
        name="path"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="knowledge-root-path">Path</FieldLabel>
            <Input
              {...field}
              id="knowledge-root-path"
              className="font-mono"
              placeholder="docs"
              aria-invalid={fieldState.invalid || undefined}
            />
            <FieldDescription>
              Relative to the workspace folder (file or directory).
            </FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="enabled"
        render={({ field }) => (
          <Field orientation="horizontal" className="rounded-md px-2 py-2">
            <FieldLabel htmlFor="knowledge-root-enabled" className="font-normal">
              Enabled
            </FieldLabel>
            <Switch
              id="knowledge-root-enabled"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </Field>
        )}
      />
    </>
  );
}
