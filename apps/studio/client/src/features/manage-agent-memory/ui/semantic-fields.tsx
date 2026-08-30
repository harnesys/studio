import { type Control, Controller } from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { SCOPE_ITEMS, type SemanticFieldsInput } from '../model/semantic-fields';

export function SemanticFields({
  control,
  scopeLocked = false,
}: {
  control: Control<SemanticFieldsInput>;
  scopeLocked?: boolean;
}) {
  return (
    <>
      <Controller
        control={control}
        name="scope"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel id="semantic-scope-label">Scope</FieldLabel>
            <ToggleGroup
              aria-labelledby="semantic-scope-label"
              variant="outline"
              spacing={0}
              value={[field.value]}
              onValueChange={(value) => {
                if (scopeLocked) {
                  return;
                }
                const next = value[0];
                if (next === 'session' || next === 'long') {
                  field.onChange(next);
                }
              }}
            >
              {SCOPE_ITEMS.map((item) => (
                <ToggleGroupItem
                  key={item.value}
                  value={item.value}
                  className="min-w-[72px]"
                  disabled={scopeLocked}
                >
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="key"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="semantic-key">Key</FieldLabel>
            <Input
              {...field}
              id="semantic-key"
              className="font-mono"
              placeholder="optional"
              aria-invalid={fieldState.invalid || undefined}
            />
            <FieldDescription>Optional; keyed rows upsert on save.</FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="text"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="semantic-text">Text</FieldLabel>
            <Textarea
              {...field}
              id="semantic-text"
              className="min-h-24 resize-y text-xs leading-relaxed"
              placeholder="Memory text."
              aria-invalid={fieldState.invalid || undefined}
            />
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
    </>
  );
}
