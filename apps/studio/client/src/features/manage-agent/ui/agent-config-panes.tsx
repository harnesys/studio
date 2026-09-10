import { useQuery } from '@tanstack/react-query';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { providersQuery } from '@/shared/api';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  sanitizeForModel,
} from '../model/agent-fields';
import { AgentBudgetFields } from './agent-budget-fields';
import { AgentEffortField, AgentGenerationFields } from './agent-generation-fields';
import { ModelSelect } from './model-select';

type AgentFieldsForm = UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;

export function AgentIdentityPane({ form }: { form: AgentFieldsForm }) {
  return (
    <FieldGroup className="gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="agent-name">Name</FieldLabel>
              <Input
                id="agent-name"
                placeholder="Orion"
                aria-invalid={fieldState.invalid || undefined}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="agent-role">Role</FieldLabel>
              <Input
                id="agent-role"
                placeholder="Staff Engineer"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </Field>
          )}
        />
      </div>
      <Controller
        control={form.control}
        name="instructions"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="agent-instructions">Instructions</FieldLabel>
            <Textarea
              id="agent-instructions"
              placeholder="System prompt for this agent"
              className="min-h-36 resize-y text-xs leading-relaxed"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Injected into every conversation thread as the system prompt.
            </p>
          </Field>
        )}
      />
    </FieldGroup>
  );
}

export function AgentModelPane({ form }: { form: AgentFieldsForm }) {
  const providers = useQuery(providersQuery).data ?? [];
  return (
    <FieldGroup className="gap-3">
      <div className="grid grid-cols-1 gap-3 has-[[data-slot=agent-effort]]:grid-cols-2">
        <Controller
          control={form.control}
          name="modelId"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="agent-model">Model</FieldLabel>
              <ModelSelect
                id="agent-model"
                value={field.value}
                triggerClassName="w-full"
                onChange={(modelId) => {
                  const current = form.getValues();
                  const generation = {
                    temperature: parseOptional(current.temperature),
                    topP: parseOptional(current.topP),
                    topK: parseOptional(current.topK),
                    frequencyPenalty: parseOptional(current.frequencyPenalty),
                    presencePenalty: parseOptional(current.presencePenalty),
                    seed: parseOptional(current.seed),
                    maxTokens: parseOptional(current.maxTokens),
                  };
                  const sanitized = sanitizeForModel(
                    modelId,
                    current.effort,
                    generation,
                    providers,
                  );
                  field.onChange(modelId);
                  form.setValue('effort', sanitized.effort);
                  form.setValue('temperature', stringify(sanitized.generation?.temperature));
                  form.setValue('topP', stringify(sanitized.generation?.topP));
                  form.setValue('topK', stringify(sanitized.generation?.topK));
                  form.setValue(
                    'frequencyPenalty',
                    stringify(sanitized.generation?.frequencyPenalty),
                  );
                  form.setValue(
                    'presencePenalty',
                    stringify(sanitized.generation?.presencePenalty),
                  );
                  form.setValue('seed', stringify(sanitized.generation?.seed));
                  form.setValue('maxTokens', stringify(sanitized.generation?.maxTokens));
                }}
              />
            </Field>
          )}
        />
        <AgentEffortField control={form.control} />
      </div>
      <AgentGenerationFields control={form.control} />
    </FieldGroup>
  );
}

export function AgentLimitsPane({ form }: { form: AgentFieldsForm }) {
  return (
    <FieldGroup className="gap-3">
      <AgentBudgetFields control={form.control} idPrefix="agent" />
    </FieldGroup>
  );
}

function parseOptional(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function stringify(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
