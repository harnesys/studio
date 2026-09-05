import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import type { Agent } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  agentFieldsFrom,
  agentFieldsSchema,
  toAgentDraft,
} from '../model/agent-fields';
import { updateAgent } from '../model/update-agent';
import { AgentCompactionFields } from './agent-compaction-fields';
import { AgentMemoryFields } from './agent-memory-fields';
import { ConfigModelSection } from './config-model-section';
import { McpConfig } from './mcp-config';
import { Section } from './section';
import { SkillsConfig } from './skills-config';
import { ToolsConfig } from './tools-config';

export function ConfigPane({ agent }: { agent: Agent }) {
  const { workspaceId } = useStudioLocation();
  const providers = useQuery(providersQuery).data ?? [];
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [instructions, setInstructions] = useState(agent.instructions);

  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    resolver: zodResolver(agentFieldsSchema),
    defaultValues: agentFieldsFrom(agent),
  });

  useEffect(() => {
    setName(agent.name);
    setRole(agent.role);
    setInstructions(agent.instructions);
    form.reset(agentFieldsFrom(agent));
  }, [agent, form]);

  function commitModelSettings() {
    if (!workspaceId) {
      return;
    }
    const parsed = agentFieldsSchema.safeParse({
      ...form.getValues(),
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions,
    });
    if (!parsed.success) {
      return;
    }
    const draft = toAgentDraft(parsed.data);
    if (
      (agent.effort ?? null) === (draft.effort ?? null) &&
      JSON.stringify(agent.generation ?? null) === JSON.stringify(draft.generation ?? null) &&
      JSON.stringify(agent.toolOutput ?? null) === JSON.stringify(draft.toolOutput ?? null)
    ) {
      return;
    }
    void updateAgent(workspaceId, agent.id, {
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions,
      modelId: agent.modelId,
      effort: draft.effort,
      generation: draft.generation,
      toolOutput: draft.toolOutput,
    });
  }

  function saveField(patch: { name?: string; role?: string; instructions?: string }) {
    if (!workspaceId) {
      return;
    }
    const nextName = patch.name !== undefined ? patch.name.trim() : name.trim();
    const nextRole = patch.role !== undefined ? patch.role.trim() : role.trim();
    const nextInstructions =
      patch.instructions !== undefined ? patch.instructions.trim() : instructions.trim();

    if (!nextName) {
      setName(agent.name);
      return;
    }

    if (
      nextName === agent.name &&
      nextRole === agent.role &&
      nextInstructions === agent.instructions
    ) {
      return;
    }

    void updateAgent(workspaceId, agent.id, {
      name: nextName,
      role: nextRole || 'Operator',
      instructions: nextInstructions,
      modelId: agent.modelId,
      effort: agent.effort,
      generation: agent.generation,
      toolOutput: agent.toolOutput,
    });
  }

  return (
    <>
      <Section label="Identity">
        <FieldGroup className="gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="cfg-name">Name</FieldLabel>
              <Input
                id="cfg-name"
                value={name}
                placeholder="Agent name"
                onChange={(event) => setName(event.target.value)}
                onBlur={() => saveField({ name })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cfg-role">Role</FieldLabel>
              <Input
                id="cfg-role"
                value={role}
                placeholder="e.g. Lead Engineer, Code Reviewer"
                onChange={(event) => setRole(event.target.value)}
                onBlur={() => saveField({ role })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
              />
            </Field>
          </div>
        </FieldGroup>
      </Section>

      <ConfigModelSection
        agent={agent}
        workspaceId={workspaceId ?? undefined}
        providers={providers}
        form={form}
        onCommitSettings={commitModelSettings}
      />

      <Section label="Instructions">
        <FieldGroup className="gap-2">
          <Field>
            <FieldLabel htmlFor="cfg-instructions">Instructions</FieldLabel>
            <Textarea
              id="cfg-instructions"
              value={instructions}
              placeholder="System prompt, tone, behavioral constraints, and instructions for this agent."
              className="min-h-36 resize-y text-xs leading-relaxed"
              onChange={(event) => setInstructions(event.target.value)}
              onBlur={() => saveField({ instructions })}
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Injected into every conversation thread as the system prompt.
            </p>
          </Field>
        </FieldGroup>
      </Section>

      <Section label="Compaction">
        <AgentCompactionFields agent={agent} />
      </Section>

      <Section label="Memory">
        <AgentMemoryFields agent={agent} />
      </Section>

      <SkillsConfig agent={agent} />
      <ToolsConfig agent={agent} />
      <McpConfig agent={agent} />
    </>
  );
}
