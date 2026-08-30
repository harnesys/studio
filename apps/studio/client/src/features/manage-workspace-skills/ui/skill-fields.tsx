import { type Control, Controller } from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

import type { SkillFieldsInput } from '../model/skill-fields';

export function SkillFields({ control }: { control: Control<SkillFieldsInput> }) {
  return (
    <>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="skill-name">Name</FieldLabel>
            <Input
              {...field}
              id="skill-name"
              className="font-mono"
              placeholder="code-review"
              aria-invalid={fieldState.invalid || undefined}
            />
            <FieldDescription>Kebab-case folder name under `.agents/skills`.</FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="skill-description">Description</FieldLabel>
            <Input
              {...field}
              id="skill-description"
              placeholder="Reviews pull requests for risk and clarity"
              aria-invalid={fieldState.invalid || undefined}
            />
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="whenToUse"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="skill-when-to-use">When to use</FieldLabel>
            <Input
              {...field}
              id="skill-when-to-use"
              placeholder="When the user asks for a PR review"
              aria-invalid={fieldState.invalid || undefined}
            />
            <FieldDescription>Optional hint for agents choosing this skill.</FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="instructions"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="skill-instructions">Instructions</FieldLabel>
            <Textarea
              {...field}
              id="skill-instructions"
              placeholder="Markdown body for the skill"
              className="min-h-32 resize-y text-xs leading-relaxed"
              aria-invalid={fieldState.invalid || undefined}
            />
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
    </>
  );
}
