import type { ProviderPublic } from '@studio/shared';
import { Controller, type UseFormReturn } from 'react-hook-form';

import type { Agent } from '@/entities/agent';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';

import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  agentFieldsSchema,
  sanitizeForModel,
  toAgentDraft,
} from '../model/agent-fields';
import { updateAgent } from '../model/update-agent';
import { AgentEffortField, AgentGenerationFields } from './agent-generation-fields';
import { AgentToolOutputFields } from './agent-tool-output-fields';
import { ModelSelect } from './model-select';
import { Section } from './section';

type AgentSettingsForm = UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;

export function ConfigModelSection({
  agent,
  workspaceId,
  providers,
  form,
  onCommitSettings,
}: {
  agent: Agent;
  workspaceId: string | undefined;
  providers: ProviderPublic[];
  form: AgentSettingsForm;
  onCommitSettings: () => void;
}) {
  return (
    <Section label="Model">
      <FieldGroup className="gap-3">
        <div className="grid grid-cols-1 gap-3 has-[[data-slot=agent-effort]]:grid-cols-2">
          <Controller
            control={form.control}
            name="modelId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="cfg-model">Model</FieldLabel>
                <ModelSelect
                  id="cfg-model"
                  value={field.value}
                  triggerClassName="w-full"
                  onChange={(modelId) => {
                    applyModelChange({
                      agent,
                      workspaceId,
                      providers,
                      form,
                      fieldOnChange: field.onChange,
                      modelId,
                    });
                  }}
                />
              </Field>
            )}
          />
          <AgentEffortField control={form.control} idPrefix="cfg" onCommit={onCommitSettings} />
        </div>
        <AgentGenerationFields control={form.control} idPrefix="cfg" onCommit={onCommitSettings} />
        <AgentToolOutputFields control={form.control} idPrefix="cfg" onCommit={onCommitSettings} />
      </FieldGroup>
    </Section>
  );
}

function applyModelChange(opts: {
  agent: Agent;
  workspaceId: string | undefined;
  providers: ProviderPublic[];
  form: AgentSettingsForm;
  fieldOnChange: (modelId: string | null) => void;
  modelId: string | null;
}) {
  const { agent, workspaceId, providers, form, fieldOnChange, modelId } = opts;
  if (!workspaceId) {
    return;
  }
  const current = form.getValues();
  const parsed = agentFieldsSchema.safeParse({
    ...current,
    modelId,
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions,
  });
  const generation = parsed.success ? toAgentDraft(parsed.data).generation : agent.generation;
  const sanitized = sanitizeForModel(modelId, current.effort, generation, providers);
  fieldOnChange(modelId);
  form.setValue('effort', sanitized.effort);
  form.setValue('temperature', stringify(sanitized.generation?.temperature));
  form.setValue('topP', stringify(sanitized.generation?.topP));
  form.setValue('topK', stringify(sanitized.generation?.topK));
  form.setValue('frequencyPenalty', stringify(sanitized.generation?.frequencyPenalty));
  form.setValue('presencePenalty', stringify(sanitized.generation?.presencePenalty));
  form.setValue('seed', stringify(sanitized.generation?.seed));
  form.setValue('maxTokens', stringify(sanitized.generation?.maxTokens));
  void updateAgent(workspaceId, agent.id, {
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions,
    modelId,
    effort: sanitized.effort,
    generation: sanitized.generation,
    toolOutput: agent.toolOutput,
  });
}

function stringify(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
