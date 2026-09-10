import {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
} from '@harnesys/studio-shared';
import { type Control, Controller } from 'react-hook-form';

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;

type ToolOutputField = 'toolOutputMaxChars' | 'toolOutputHeadChars' | 'toolOutputTailChars';

const FIELDS: {
  name: ToolOutputField;
  label: string;
  placeholder: string;
}[] = [
  {
    name: 'toolOutputMaxChars',
    label: 'Spill after (chars)',
    placeholder: String(DEFAULT_TOOL_OUTPUT_MAX_CHARS),
  },
  {
    name: 'toolOutputHeadChars',
    label: 'Keep head',
    placeholder: String(DEFAULT_TOOL_OUTPUT_HEAD_CHARS),
  },
  {
    name: 'toolOutputTailChars',
    label: 'Keep tail',
    placeholder: String(DEFAULT_TOOL_OUTPUT_TAIL_CHARS),
  },
];

export function AgentToolOutputFields({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <FieldSet className="gap-2" data-testid={`${idPrefix}-tool-output-fields`}>
      <FieldLegend className="font-medium text-muted-foreground text-xs">Tool output</FieldLegend>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Long results spill to a workspace file. The model gets head + tail and stats; empty fields
        use defaults.
      </p>
      <FieldGroup className="grid grid-cols-3 gap-2">
        {FIELDS.map((item) => (
          <Controller
            key={item.name}
            control={control}
            name={item.name}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={`${idPrefix}-${item.name}`}>{item.label}</FieldLabel>
                <Input
                  id={`${idPrefix}-${item.name}`}
                  inputMode="numeric"
                  placeholder={item.placeholder}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={() => {
                    field.onBlur();
                    onCommit?.();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        ))}
      </FieldGroup>
    </FieldSet>
  );
}
