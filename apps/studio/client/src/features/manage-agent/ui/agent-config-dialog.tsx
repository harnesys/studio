import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  BrainIcon,
  CpuIcon,
  FoldVerticalIcon,
  GaugeIcon,
  LayersIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PuzzleIcon,
  ScrollTextIcon,
  ServerIcon,
  UserRoundIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { Agent } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { type DialogComponentProps, patchOverlayOptions } from '@/shared/services/overlay';
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
import { defaultReactGraph, type StudioGraphDocument } from '../model/agent-graph-document';
import {
  AgentIdentityPane,
  AgentInstructionsPane,
  AgentLimitsPane,
  AgentModelPane,
} from './agent-config-panes';
import { AgentGraphPane } from './agent-graph-pane';
import { DraftCapabilities, type DraftCapabilitiesSection } from './draft-capabilities';
import { DraftCapabilityPacks } from './draft-capability-packs';
import { DraftCompaction } from './draft-compaction';
import { DraftMemory } from './draft-memory';

const GRAPH_DIALOG_CLASS =
  'flex h-[min(78vh,48rem)] w-[min(80vw,64rem)] max-w-[min(80vw,64rem)] overflow-hidden';
const DEFAULT_DIALOG_CLASS = 'sm:max-w-3xl';

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
  | 'capabilities'
  | 'compaction'
  | 'memory'
  | 'skills'
  | 'graph'
  | 'tools'
  | 'mcp'
  | 'limits';

export const AGENT_CONFIG_CATEGORIES: {
  id: AgentConfigCategory;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: 'identity', label: 'Identity', icon: UserRoundIcon },
  { id: 'model', label: 'Model', icon: CpuIcon },
  { id: 'instructions', label: 'Instructions', icon: ScrollTextIcon },
  { id: 'graph', label: 'Graph', icon: WorkflowIcon },
  { id: 'capabilities', label: 'Capabilities', icon: LayersIcon },
  { id: 'compaction', label: 'Compaction', icon: FoldVerticalIcon },
  { id: 'memory', label: 'Memory', icon: BrainIcon },
  { id: 'skills', label: 'Skills', icon: PuzzleIcon },
  { id: 'tools', label: 'Tools', icon: WrenchIcon },
  { id: 'mcp', label: 'MCP', icon: ServerIcon },
  { id: 'limits', label: 'Limits', icon: GaugeIcon },
];

function initialCapabilities(agent: Agent | null): AgentCapabilitiesDraft {
  return {
    skills: agent?.skills ?? [],
    tools: agent?.tools ?? [],
    mcpServers: agent?.mcpServers ?? [],
    compaction: agent?.compaction,
    memory: agent?.memory,
    capabilities: agent?.capabilities ?? {},
  };
}

export function AgentConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<AgentConfigResult, { agent: Agent | null; workspaceId: string }>) {
  const agent = data?.agent ?? null;
  const workspaceId = data?.workspaceId ?? '';
  const [category, setCategory] = useState<AgentConfigCategory>('identity');
  const [navOpen, setNavOpen] = useState(true);
  const [graphDoc, setGraphDoc] = useState<StudioGraphDocument>(
    () => agent?.graph ?? defaultReactGraph(),
  );
  const graphDocRef = useRef(graphDoc);
  graphDocRef.current = graphDoc;
  const graphTouchedRef = useRef(false);
  const providers = useQuery(providersQuery).data ?? [];
  const capabilitiesRef = useRef<AgentCapabilitiesDraft>(initialCapabilities(agent));
  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    resolver: zodResolver(agentFieldsSchema),
    defaultValues: agent ? agentFieldsFrom(agent) : emptyAgentFields(),
  });
  const nameValue = useWatch({ control: form.control, name: 'name' }) ?? '';

  useEffect(() => {
    patchOverlayOptions({
      className: category === 'graph' ? GRAPH_DIALOG_CLASS : DEFAULT_DIALOG_CLASS,
    });
    return () => {
      patchOverlayOptions({ className: DEFAULT_DIALOG_CLASS });
    };
  }, [category]);

  function selectCategory(next: AgentConfigCategory) {
    if (next === 'graph') {
      graphTouchedRef.current = true;
    }
    setCategory(next);
  }

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
        const graph = graphTouchedRef.current ? graphDocRef.current : undefined;
        onResolve?.({
          fields: { ...draft, ...sanitized, ...(graph !== undefined ? { graph } : {}) },
          capabilities: capabilitiesRef.current,
          ...(graph !== undefined ? { graph } : {}),
        });
      })}
    >
      <div className="flex min-h-0 flex-1 gap-4">
        {navOpen ? (
          <nav className="flex w-40 shrink-0 flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              className="mb-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-sidebar-accent/50"
              title="Hide sections"
            >
              <PanelLeftCloseIcon className="size-3.5 shrink-0" />
              Hide
            </button>
            {AGENT_CONFIG_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectCategory(item.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm',
                  category === item.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50',
                )}
              >
                <item.icon className="size-3.5 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
        ) : (
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/50"
            title="Show sections"
          >
            <PanelLeftOpenIcon className="size-3.5" />
          </button>
        )}
        <div
          className={cn(
            'min-h-0 flex-1',
            category === 'graph' ? 'overflow-hidden' : 'overflow-y-auto pr-1',
          )}
        >
          <div className={cn(category !== 'identity' && 'hidden')}>
            <AgentIdentityPane form={form} />
          </div>
          <div className={cn(category !== 'model' && 'hidden')}>
            <AgentModelPane form={form} />
          </div>
          <div className={cn(category !== 'instructions' && 'hidden')}>
            <AgentInstructionsPane form={form} />
          </div>
          <div className={cn(category !== 'capabilities' && 'hidden')}>
            <DraftCapabilityPacks
              workspaceId={workspaceId}
              value={agent?.capabilities ?? {}}
              onChange={(capabilities) => {
                capabilitiesRef.current = { ...capabilitiesRef.current, capabilities };
              }}
            />
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
          <div className={cn(category !== 'limits' && 'hidden')}>
            <AgentLimitsPane form={form} />
          </div>
          {category === 'graph' ? (
            <div className="h-full min-h-0">
              <AgentGraphPane
                value={graphDoc}
                onChange={(next) => {
                  graphTouchedRef.current = true;
                  graphDocRef.current = next;
                  setGraphDoc(next);
                }}
              />
            </div>
          ) : null}
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
