import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { Agent } from '@/entities/agent';
import { useAgentStore } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import { type DialogComponentProps, patchOverlayOptions } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';

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
import { updateAgent, updateAgentCapabilities } from '../model/update-agent';
import { AgentConfigCategoryPanes } from './agent-config-category-panes';
import {
  AGENT_CONFIG_CATEGORIES,
  type AgentConfigCategory,
  AgentConfigCategoryNav,
  GraphContentNavToggle,
} from './agent-config-nav';

export type { AgentConfigCategory } from './agent-config-nav';
export { AGENT_CONFIG_CATEGORIES } from './agent-config-nav';

const GRAPH_DIALOG_CLASS =
  'flex min-h-0 h-[min(90vh,768px)] w-[min(90vw,1024px)] max-w-[min(90vw,1024px)] sm:max-w-[min(90vw,1024px)] overflow-hidden';
const DEFAULT_DIALOG_CLASS =
  'flex min-h-0 h-[min(78vh,48rem)] w-full max-w-3xl sm:max-w-3xl overflow-hidden';

function initialCapabilities(agent: Agent | null): AgentCapabilitiesDraft {
  return {
    skills: agent?.skills ?? [],
    tools: agent?.tools ?? [],
    mcpServers: agent?.mcpServers ?? [],
    compaction: agent?.compaction,
    capabilities: agent?.capabilities ?? {},
  };
}

export function AgentConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<AgentConfigResult, { agent: Agent | null; workspaceId: string }>) {
  const rootAgent = data?.agent ?? null;
  const workspaceId = data?.workspaceId ?? '';
  const [focusAgentId, setFocusAgentId] = useState<string | null>(rootAgent?.id ?? null);
  const [returnParentId, setReturnParentId] = useState<string | null>(null);
  const [category, setCategory] = useState<AgentConfigCategory>('identity');
  const [navOpen, setNavOpen] = useState(true);
  const [graphDoc, setGraphDoc] = useState<StudioGraphDocument>(
    () => rootAgent?.graph ?? defaultReactGraph(),
  );
  const graphDocRef = useRef(graphDoc);
  graphDocRef.current = graphDoc;
  const graphTouchedRef = useRef(false);
  const providers = useQuery(providersQuery).data ?? [];
  const capabilitiesRef = useRef<AgentCapabilitiesDraft>(initialCapabilities(rootAgent));
  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    resolver: zodResolver(agentFieldsSchema),
    defaultValues: rootAgent ? agentFieldsFrom(rootAgent) : emptyAgentFields(),
  });
  const nameValue = useWatch({ control: form.control, name: 'name' }) ?? '';
  const storeFocus = useAgentStore((state) =>
    focusAgentId ? (state.byId(focusAgentId) ?? null) : null,
  );
  const storeReturnParent = useAgentStore((state) =>
    returnParentId ? (state.byId(returnParentId) ?? null) : null,
  );
  const activeAgent =
    storeFocus ?? (focusAgentId && focusAgentId === rootAgent?.id ? rootAgent : null);
  const returnParent =
    storeReturnParent ?? (returnParentId && returnParentId === rootAgent?.id ? rootAgent : null);
  const showSubagents = Boolean(activeAgent && !activeAgent.parentId);
  const navCategories = showSubagents
    ? AGENT_CONFIG_CATEGORIES
    : AGENT_CONFIG_CATEGORIES.filter((item) => item.id !== 'subagents');

  useEffect(() => {
    patchOverlayOptions({
      className: category === 'graph' ? GRAPH_DIALOG_CLASS : DEFAULT_DIALOG_CLASS,
    });
    return () => {
      patchOverlayOptions({ className: DEFAULT_DIALOG_CLASS });
    };
  }, [category]);

  useEffect(() => {
    if (category === 'subagents' && !showSubagents) {
      setCategory('identity');
    }
  }, [category, showSubagents]);

  useEffect(() => {
    patchOverlayOptions({
      title: activeAgent ? `Configure ${activeAgent.name}` : 'New agent',
    });
  }, [activeAgent]);

  function selectCategory(next: AgentConfigCategory) {
    if (next === 'graph') {
      graphTouchedRef.current = true;
    } else {
      setNavOpen(true);
    }
    setCategory(next);
  }

  function loadAgentEditors(target: Agent) {
    form.reset(agentFieldsFrom(target));
    capabilitiesRef.current = initialCapabilities(target);
    const nextGraph = target.graph ?? defaultReactGraph();
    graphTouchedRef.current = false;
    graphDocRef.current = nextGraph;
    setGraphDoc(nextGraph);
  }

  function buildResult(values: AgentFieldsOutput): AgentConfigResult {
    const draft = toAgentDraft(values);
    const sanitized = sanitizeForModel(draft.modelId, draft.effort, draft.generation, providers);
    const graph = graphTouchedRef.current ? graphDocRef.current : undefined;
    return {
      fields: { ...draft, ...sanitized, ...(graph !== undefined ? { graph } : {}) },
      capabilities: capabilitiesRef.current,
      ...(graph !== undefined ? { graph } : {}),
    };
  }

  function persistCurrent(): Promise<boolean> {
    if (!activeAgent || !workspaceId) {
      return Promise.resolve(false);
    }
    const agentId = activeAgent.id;
    return new Promise((resolve) => {
      void form.handleSubmit(
        async (values) => {
          const result = buildResult(values);
          try {
            await updateAgent(workspaceId, agentId, result.fields);
            await updateAgentCapabilities(workspaceId, agentId, result.capabilities);
            resolve(true);
          } catch (error) {
            toast.add({
              title: error instanceof Error ? error.message : 'Could not save agent',
            });
            resolve(false);
          }
        },
        () => resolve(false),
      )();
    });
  }

  async function openSubagent(delegate: Agent) {
    const parentId = activeAgent?.id ?? rootAgent?.id ?? null;
    if (!parentId) {
      return;
    }
    const saved = await persistCurrent();
    if (!saved) {
      return;
    }
    setReturnParentId(parentId);
    setFocusAgentId(delegate.id);
    loadAgentEditors(delegate);
    setCategory('identity');
  }

  async function backFromSubagent() {
    const parentId = returnParentId;
    if (!parentId) {
      return;
    }
    const saved = await persistCurrent();
    if (!saved) {
      return;
    }
    const parent = useAgentStore.getState().byId(parentId);
    if (!parent) {
      toast.add({ title: 'Parent agent is gone' });
      return;
    }
    setReturnParentId(null);
    setFocusAgentId(parentId);
    loadAgentEditors(parent);
    setCategory('subagents');
  }

  const categoryNavProps = {
    categories: navCategories,
    category,
    onSelect: selectCategory,
    backLabel: returnParentId
      ? `Back${returnParent?.name ? ` to ${returnParent.name}` : ''}`
      : null,
    onBack: returnParentId
      ? () => {
          void backFromSubagent();
        }
      : undefined,
  };

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        if (returnParentId) {
          const result = buildResult(values);
          if (!activeAgent) {
            return;
          }
          try {
            await updateAgent(workspaceId, activeAgent.id, result.fields);
            await updateAgentCapabilities(workspaceId, activeAgent.id, result.capabilities);
            toast.add({ title: 'Subagent saved' });
          } catch (error) {
            toast.add({
              title: error instanceof Error ? error.message : 'Could not save subagent',
            });
          }
          return;
        }
        onResolve?.(buildResult(values));
      })}
    >
      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        {category !== 'graph' || navOpen ? (
          <AgentConfigCategoryNav {...categoryNavProps} className="pr-1" />
        ) : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {category === 'graph' ? (
            <GraphContentNavToggle open={navOpen} onToggle={() => setNavOpen((open) => !open)} />
          ) : null}
          <AgentConfigCategoryPanes
            category={category}
            form={form}
            workspaceId={workspaceId}
            activeAgent={activeAgent}
            showSubagents={showSubagents}
            graphDoc={graphDoc}
            graphDocRef={graphDocRef}
            graphTouchedRef={graphTouchedRef}
            setGraphDoc={setGraphDoc}
            capabilitiesRef={capabilitiesRef}
            onOpenSubagent={(delegate) => {
              void openSubagent(delegate);
            }}
          />
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
