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
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;

type BudgetField = 'budgetMaxSteps' | 'budgetMaxTokens' | 'budgetDeadlineSec';

const FIELDS: { name: BudgetField; label: string }[] = [
  { name: 'budgetMaxSteps', label: 'Max steps' },
  { name: 'budgetMaxTokens', label: 'Max tokens' },
  { name: 'budgetDeadlineSec', label: 'Deadline, sec' },
];

export function AgentBudgetFields({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <FieldSet className="gap-2" data-testid={`${idPrefix}-budget-fields`}>
      <FieldLegend className="font-medium text-muted-foreground text-xs">Limits</FieldLegend>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Hard stop for looping graphs. On limit the run pauses for confirmation (ask) or fails
        (error).
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
      <Controller
        control={control}
        name="budgetPolicy"
        render={({ field }) => (
          <Field>
            <FieldLabel>On limit</FieldLabel>
            <ToggleGroup
              variant="segment"
              value={[field.value]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === 'ask' || next === 'error') {
                  field.onChange(next);
                }
              }}
            >
              <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
              <ToggleGroupItem value="error">Error</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        )}
      />
    </FieldSet>
  );
}
