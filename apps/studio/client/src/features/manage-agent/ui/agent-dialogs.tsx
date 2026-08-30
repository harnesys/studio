import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';

import type { Agent } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  agentFieldsFrom,
  agentFieldsSchema,
  emptyAgentFields,
  sanitizeForModel,
  toAgentDraft,
} from '../model/agent-fields';
import { AgentEffortField, AgentGenerationFields } from './agent-generation-fields';
import { ModelSelect } from './model-select';

export function CreateAgentDialog({
  onResolve,
}: DialogComponentProps<ReturnType<typeof toAgentDraft>>) {
  return <AgentDialogForm onResolve={onResolve} />;
}

export function EditAgentDialog({
  onResolve,
  data,
}: DialogComponentProps<ReturnType<typeof toAgentDraft>, { agent: Agent }>) {
  const agent = data?.agent;
  return (
    <AgentDialogForm onResolve={onResolve} initial={agent ? agentFieldsFrom(agent) : undefined} />
  );
}

function AgentDialogForm({
  onResolve,
  initial,
}: {
  onResolve?: (value?: ReturnType<typeof toAgentDraft>) => void;
  initial?: AgentFieldsInput;
}) {
  const providers = useQuery(providersQuery).data ?? [];
  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    resolver: zodResolver(agentFieldsSchema),
    defaultValues: initial ?? emptyAgentFields(),
  });
  const nameValue = useWatch({ control: form.control, name: 'name' }) ?? '';

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        const draft = toAgentDraft(values);
        const sanitized = sanitizeForModel(
          draft.modelId,
          draft.effort,
          draft.generation,
          providers,
        );
        onResolve?.({ ...draft, ...sanitized });
      })}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
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
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </Field>
          )}
        />
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
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={nameValue.trim().length === 0}>
          {initial ? 'Save agent' : 'Create agent'}
        </Button>
      </DialogFooter>
    </form>
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
