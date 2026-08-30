import { useQuery } from '@tanstack/react-query';
import { type Control, Controller, useWatch } from 'react-hook-form';

import { providersQuery } from '@/shared/api';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Slider } from '@/shared/ui/slider';

import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  type AgentGenerationField,
  generationFieldVisible,
  hasGenerationFields,
  modelEfforts,
  modelSupportedParameters,
} from '../model/agent-fields';
import { effortLabel } from './effort-label';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;

type SliderSpec = {
  name: AgentGenerationField;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  format: (value: number) => string;
};

type NumberSpec = {
  name: AgentGenerationField;
  label: string;
  placeholder: string;
};

const SAMPLING_SLIDERS: SliderSpec[] = [
  {
    name: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.01,
    fallback: 1,
    format: (value) => value.toFixed(2),
  },
  {
    name: 'topP',
    label: 'Top P',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 1,
    format: (value) => value.toFixed(2),
  },
  {
    name: 'topK',
    label: 'Top K',
    min: 1,
    max: 100,
    step: 1,
    fallback: 40,
    format: (value) => String(Math.round(value)),
  },
  {
    name: 'frequencyPenalty',
    label: 'Frequency',
    min: -2,
    max: 2,
    step: 0.01,
    fallback: 0,
    format: (value) => value.toFixed(2),
  },
  {
    name: 'presencePenalty',
    label: 'Presence',
    min: -2,
    max: 2,
    step: 0.01,
    fallback: 0,
    format: (value) => value.toFixed(2),
  },
];

const LIMIT_FIELDS: NumberSpec[] = [
  { name: 'maxTokens', label: 'Max tokens', placeholder: '4096' },
  { name: 'seed', label: 'Seed', placeholder: '42' },
];

export function AgentEffortField({
  control,
  idPrefix = 'agent',
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix?: string;
  onCommit?: () => void;
}) {
  const providers = useQuery(providersQuery).data ?? [];
  const modelId = useWatch({ control, name: 'modelId' });
  const levels = modelEfforts(modelId, providers);
  const fieldId = `${idPrefix}-effort`;

  if (levels.length === 0) {
    return null;
  }

  return (
    <Controller
      control={control}
      name="effort"
      render={({ field }) => (
        <Field className="gap-1.5" data-slot="agent-effort">
          <FieldLabel htmlFor={fieldId}>Effort</FieldLabel>
          <Select
            items={levels.map((item) => ({ value: item, label: effortLabel(item) }))}
            value={field.value || null}
            onValueChange={(next) => {
              field.onChange(typeof next === 'string' ? next : null);
              onCommit?.();
            }}
          >
            <SelectTrigger id={fieldId} className="w-full" data-testid={fieldId}>
              {field.value ? (
                <span className="min-w-0 flex-1 truncate text-left">
                  {effortLabel(field.value)}
                </span>
              ) : (
                <SelectValue placeholder="Provider default" />
              )}
            </SelectTrigger>
            <SelectContent className="w-full" align="start">
              {levels.map((item) => (
                <SelectItem key={item} value={item}>
                  {effortLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}

export function AgentGenerationFields({
  control,
  idPrefix = 'agent',
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix?: string;
  onCommit?: () => void;
}) {
  const providers = useQuery(providersQuery).data ?? [];
  const modelId = useWatch({ control, name: 'modelId' });
  const supported = modelSupportedParameters(modelId, providers);
  const sliders = SAMPLING_SLIDERS.filter((item) => generationFieldVisible(supported, item.name));
  const limits = LIMIT_FIELDS.filter((item) => generationFieldVisible(supported, item.name));
  const showGeneration = hasGenerationFields(supported);

  if (!showGeneration) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-generation-fields`}>
      {limits.length > 0 ? (
        <FieldSet className="gap-2.5">
          <FieldLegend variant="label" className="text-muted-foreground text-xs">
            Limits
          </FieldLegend>
          <div className="grid grid-cols-2 gap-3">
            {limits.map((item) => {
              const fieldId = `${idPrefix}-${item.name}`;
              return (
                <Controller
                  key={item.name}
                  control={control}
                  name={item.name}
                  render={({ field, fieldState }) => (
                    <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor={fieldId}>{item.label}</FieldLabel>
                      <Input
                        id={fieldId}
                        inputMode="numeric"
                        placeholder={item.placeholder}
                        aria-invalid={fieldState.invalid || undefined}
                        value={typeof field.value === 'string' ? field.value : ''}
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
                        name={field.name}
                        ref={field.ref}
                      />
                      {fieldState.error ? (
                        <FieldError>{fieldState.error.message}</FieldError>
                      ) : null}
                    </Field>
                  )}
                />
              );
            })}
          </div>
        </FieldSet>
      ) : null}

      {sliders.length > 0 ? (
        <FieldSet className="gap-2.5">
          <FieldLegend variant="label" className="text-muted-foreground text-xs">
            Sampling
          </FieldLegend>
          <FieldGroup className="gap-2.5">
            {sliders.map((item) => {
              const fieldId = `${idPrefix}-${item.name}`;
              return (
                <Controller
                  key={item.name}
                  control={control}
                  name={item.name}
                  render={({ field, fieldState }) => {
                    const parsed = parseOptional(field.value);
                    const display = parsed ?? item.fallback;
                    return (
                      <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
                        <div className="flex items-center justify-between gap-2">
                          <FieldLabel htmlFor={fieldId}>{item.label}</FieldLabel>
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            {parsed === undefined ? 'Default' : item.format(parsed)}
                          </span>
                        </div>
                        <Slider
                          id={fieldId}
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={display}
                          aria-invalid={fieldState.invalid || undefined}
                          onValueChange={(next) => {
                            const value = Array.isArray(next) ? next[0] : next;
                            if (typeof value !== 'number' || !Number.isFinite(value)) {
                              return;
                            }
                            field.onChange(item.format(clamp(value, item.min, item.max)));
                          }}
                          onBlur={field.onBlur}
                          onValueCommitted={() => onCommit?.()}
                        />
                        {fieldState.error ? (
                          <FieldError>{fieldState.error.message}</FieldError>
                        ) : null}
                      </Field>
                    );
                  }}
                />
              );
            })}
          </FieldGroup>
        </FieldSet>
      ) : null}
    </div>
  );
}

function parseOptional(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
