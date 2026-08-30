import { type Control, Controller, useWatch } from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { type McpFieldsInput, TRANSPORT_ITEMS } from '../model/mcp-fields';

export function McpFields({
  control,
  serverIdLocked = false,
}: {
  control: Control<McpFieldsInput>;
  serverIdLocked?: boolean;
}) {
  const transport = useWatch({ control, name: 'transport' }) ?? 'stdio';
  const isStdio = transport === 'stdio';

  return (
    <>
      <Controller
        control={control}
        name="serverId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="mcp-server-id">Server id</FieldLabel>
            <Input
              {...field}
              id="mcp-server-id"
              className="font-mono"
              placeholder="filesystem"
              disabled={serverIdLocked}
              aria-invalid={fieldState.invalid || undefined}
            />
            {serverIdLocked ? <FieldDescription>Id is fixed after create.</FieldDescription> : null}
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="enabled"
        render={({ field }) => (
          <Field orientation="horizontal" className="rounded-md px-2 py-2">
            <FieldLabel htmlFor="mcp-enabled" className="font-normal">
              Enabled
            </FieldLabel>
            <Switch
              id="mcp-enabled"
              size="sm"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="transport"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel id="mcp-transport-label">Transport</FieldLabel>
            <ToggleGroup
              aria-labelledby="mcp-transport-label"
              variant="outline"
              spacing={0}
              value={[field.value]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === 'stdio' || next === 'http' || next === 'sse') {
                  field.onChange(next);
                }
              }}
            >
              {TRANSPORT_ITEMS.map((item) => (
                <ToggleGroupItem key={item.value} value={item.value} className="min-w-[72px]">
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      {isStdio ? (
        <>
          <Controller
            control={control}
            name="command"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="mcp-command">Command</FieldLabel>
                <Input
                  {...field}
                  id="mcp-command"
                  className="font-mono"
                  placeholder="npx"
                  aria-invalid={fieldState.invalid || undefined}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="argsText"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="mcp-args">Args</FieldLabel>
                <Textarea
                  {...field}
                  id="mcp-args"
                  className="min-h-20 resize-y font-mono text-xs leading-relaxed"
                  placeholder={'-y\n@modelcontextprotocol/server-filesystem\n.'}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <FieldDescription>One argument per line.</FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="envText"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="mcp-env">Env</FieldLabel>
                <Textarea
                  {...field}
                  id="mcp-env"
                  className="min-h-16 resize-y font-mono text-xs leading-relaxed"
                  placeholder={'API_KEY=…\nDEBUG=1'}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <FieldDescription>Optional KEY=value lines.</FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        </>
      ) : (
        <>
          <Controller
            control={control}
            name="url"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="mcp-url">URL</FieldLabel>
                <Input
                  {...field}
                  id="mcp-url"
                  className="font-mono"
                  placeholder="https://example.com/mcp"
                  aria-invalid={fieldState.invalid || undefined}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="headersText"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="mcp-headers">Headers</FieldLabel>
                <Textarea
                  {...field}
                  id="mcp-headers"
                  className="min-h-16 resize-y font-mono text-xs leading-relaxed"
                  placeholder={'Authorization: Bearer …\nX-Custom: value'}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <FieldDescription>Optional Key: value lines.</FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        </>
      )}
    </>
  );
}
