import { type Control, Controller } from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import type { AddRegistryFieldsInput, InstallPluginFieldsInput } from '../model/plugin-fields';

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
            <FieldDescription>
              GitHub `owner/repo` or a full git URL. Example: `obra/superpowers`.
            </FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="path"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="plugin-path">Subdirectory (optional)</FieldLabel>
            <Input
              {...field}
              id="plugin-path"
              className="font-mono"
              placeholder="plugins/my-plugin"
              aria-invalid={fieldState.invalid || undefined}
            />
            <FieldDescription>
              When the plugin is not at the repo root. Example: `plugins/security-guidance`.
            </FieldDescription>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="ref"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="plugin-ref">Ref (optional)</FieldLabel>
            <Input
              {...field}
              id="plugin-ref"
              className="font-mono"
              placeholder="main or commit sha"
              aria-invalid={fieldState.invalid || undefined}
            />
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
    </>
  );
}

export function AddRegistryFields({ control }: { control: Control<AddRegistryFieldsInput> }) {
  return (
    <Controller
      control={control}
      name="source"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor="registry-source">Marketplace source</FieldLabel>
          <Input
            {...field}
            id="registry-source"
            className="font-mono"
            placeholder="anthropics/claude-plugins-official"
            aria-invalid={fieldState.invalid || undefined}
          />
          <FieldDescription>
            `owner/repo`, git URL, or URL to `marketplace.json`. Example: `zai-org/zcode-plugins`.
          </FieldDescription>
          {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
        </Field>
      )}
    />
  );
}
