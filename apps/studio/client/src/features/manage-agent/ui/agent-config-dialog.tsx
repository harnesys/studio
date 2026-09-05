import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { Agent } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

import type { AgentCapabilitiesDraft, AgentConfigResult } from '../model/agent-config';
import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  agentFieldsFrom,
  agentFieldsSchema,
  emptyAgentFields,
  sanitizeForModel,
  toAgentDraft,
} from '../model/agent-fields';
import { AgentIdentityPane, AgentInstructionsPane, AgentModelPane } from './agent-config-panes';
import { DraftCapabilities, type DraftCapabilitiesSection } from './draft-capabilities';
import { DraftCompaction } from './draft-compaction';
import { DraftMemory } from './draft-memory';

function capabilitiesSection(category: AgentConfigCategory): DraftCapabilitiesSection {
  if (category === 'tools') {
    return 'tools';
  }
  if (category === 'mcp') {
    return 'mcp';
  }
  return 'skills';
}

export type AgentConfigCategory =
  | 'identity'
  | 'model'
  | 'instructions'
  | 'compaction'
  | 'memory'
  | 'skills'
  | 'tools'
  | 'mcp';

export const AGENT_CONFIG_CATEGORIES: { id: AgentConfigCategory; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'model', label: 'Model' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'compaction', label: 'Compaction' },
  { id: 'memory', label: 'Memory' },
  { id: 'skills', label: 'Skills' },
  { id: 'tools', label: 'Tools' },
  { id: 'mcp', label: 'MCP' },
];

function initialCapabilities(agent: Agent | null): AgentCapabilitiesDraft {
  return {
    skills: agent?.skills ?? [],
    tools: agent?.tools ?? [],
    mcpServers: agent?.mcpServers ?? [],
    compaction: agent?.compaction,
    memory: agent?.memory,
  };
}

export function AgentConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<AgentConfigResult, { agent: Agent | null; workspaceId: string }>) {
  const agent = data?.agent ?? null;
  const workspaceId = data?.workspaceId ?? '';
  const [category, setCategory] = useState<AgentConfigCategory>('identity');
  const providers = useQuery(providersQuery).data ?? [];
  const capabilitiesRef = useRef<AgentCapabilitiesDraft>(initialCapabilities(agent));
  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    resolver: zodResolver(agentFieldsSchema),
    defaultValues: agent ? agentFieldsFrom(agent) : emptyAgentFields(),
  });
  const nameValue = useWatch({ control: form.control, name: 'name' }) ?? '';

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        const draft = toAgentDraft(values);
        const sanitized = sanitizeForModel(
          draft.modelId,
          draft.effort,
          draft.generation,
          providers,
        );
        onResolve?.({
          fields: { ...draft, ...sanitized },
          capabilities: capabilitiesRef.current,
        });
      })}
    >
      <div className="flex min-h-0 flex-1 gap-4">
        <nav className="flex w-40 shrink-0 flex-col gap-0.5">
          {AGENT_CONFIG_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={cn(
                'rounded-md px-2 py-1.5 text-left text-sm',
                category === item.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className={cn(category !== 'identity' && 'hidden')}>
            <AgentIdentityPane form={form} />
          </div>
          <div className={cn(category !== 'model' && 'hidden')}>
            <AgentModelPane form={form} />
          </div>
          <div className={cn(category !== 'instructions' && 'hidden')}>
            <AgentInstructionsPane form={form} />
          </div>
          <div className={cn(category !== 'compaction' && 'hidden')}>
            <DraftCompaction
              agent={agent}
              onChange={(compaction) => {
                capabilitiesRef.current = { ...capabilitiesRef.current, compaction };
              }}
            />
          </div>
          <div className={cn(category !== 'memory' && 'hidden')}>
            <DraftMemory
              agent={agent}
              onChange={(memory) => {
                capabilitiesRef.current = { ...capabilitiesRef.current, memory };
              }}
            />
          </div>
          <div
            className={cn(
              category !== 'skills' && category !== 'tools' && category !== 'mcp' && 'hidden',
            )}
          >
            <DraftCapabilities
              agent={agent}
              workspaceId={workspaceId}
              section={capabilitiesSection(category)}
              onChange={(snapshot) => {
                capabilitiesRef.current = { ...capabilitiesRef.current, ...snapshot };
              }}
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={nameValue.trim().length === 0}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
