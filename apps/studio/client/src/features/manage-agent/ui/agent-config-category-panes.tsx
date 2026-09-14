import type { MutableRefObject } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { Pane } from '@/shared/ui/capability-rows';

import type { AgentCapabilitiesDraft } from '../model/agent-config';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import type { StudioGraphDocument } from '../model/agent-graph-document';
import type { AgentConfigCategory } from './agent-config-nav';
import { AgentIdentityPane, AgentLimitsPane, AgentModelPane } from './agent-config-panes';
import { AgentGraphPane } from './agent-graph-pane';
import { AgentHooksPane } from './agent-hooks-pane';
import { AgentModesPane } from './agent-modes-pane';
import { AgentPermissionsPane } from './agent-permissions-pane';
import { AgentSubagentsPane } from './agent-subagents-pane';
import { DraftCapabilities, type DraftCapabilitiesSection } from './draft-capabilities';
import { DraftCapabilityPacks } from './draft-capability-packs';
import { DraftCompaction } from './draft-compaction';
import { DraftEnabledPlugins } from './draft-enabled-plugins';

function capabilitiesSection(category: AgentConfigCategory): DraftCapabilitiesSection {
  return category === 'mcp' ? 'mcp' : 'skills';
}

type AgentConfigCategoryPanesProps = {
  category: AgentConfigCategory;
  form: UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;
  workspaceId: string;
  activeAgent: Agent | null;
  showSubagents: boolean;
  isDelegate: boolean;
  graphDoc: StudioGraphDocument;
  graphDocRef: MutableRefObject<StudioGraphDocument>;
  graphTouchedRef: MutableRefObject<boolean>;
  setGraphDoc: (next: StudioGraphDocument) => void;
  capabilities: AgentCapabilitiesDraft;
  onCapabilitiesPatch: (patch: Partial<AgentCapabilitiesDraft>) => void;
  onOpenSubagent: (agent: Agent) => void;
};

export function AgentConfigCategoryPanes({
  category,
  form,
  workspaceId,
  activeAgent,
  showSubagents,
  isDelegate,
  graphDoc,
  graphDocRef,
  graphTouchedRef,
  setGraphDoc,
  capabilities,
  onCapabilitiesPatch,
  onOpenSubagent,
}: AgentConfigCategoryPanesProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        category === 'graph' || category === 'identity'
          ? 'overflow-hidden'
          : 'overflow-y-auto pr-1',
      )}
    >
      <Pane
        sticky={false}
        className={cn(category === 'identity' ? 'min-h-0 flex-1 pr-1' : 'hidden')}
        label="Identity"
        description="Name, role and system prompt of this agent."
      >
        <AgentIdentityPane form={form} />
      </Pane>
      <Pane
        className={cn(category !== 'model' && 'hidden')}
        label="Model"
        description="Model, effort and generation parameters."
      >
        <AgentModelPane form={form} />
      </Pane>
      <div className={cn(category !== 'permissions' && 'hidden')}>
        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <AgentPermissionsPane
              value={field.value ?? null}
              isDelegate={isDelegate}
              onChange={(next) => field.onChange(next)}
            />
          )}
        />
      </div>
      <div className={cn(category !== 'modes' && 'hidden')}>
        <AgentModesPane
          form={form}
          workspaceId={workspaceId}
          activeAgent={activeAgent}
          active={category === 'modes'}
        />
      </div>
      <div className={cn(category !== 'capabilities' && 'hidden')}>
        <div className="flex flex-col gap-4">
          <Pane label="Packs" description="Capability packs loaded into this agent.">
            <DraftCapabilityPacks
              key={`packs-${activeAgent?.id ?? 'new'}`}
              workspaceId={workspaceId}
              isDelegate={isDelegate}
              value={capabilities.capabilities ?? {}}
              onChange={(nextCapabilities) => {
                onCapabilitiesPatch({ capabilities: nextCapabilities });
              }}
            />
          </Pane>
          <Pane
            label="Plugins"
            description="Plugins this agent may use; empty selection means none."
          >
            <DraftEnabledPlugins
              key={`plugins-${activeAgent?.id ?? 'new'}`}
              workspaceId={workspaceId}
              value={capabilities.enabledPlugins ?? {}}
              onChange={(enabledPlugins) => {
                onCapabilitiesPatch({ enabledPlugins });
              }}
            />
          </Pane>
        </div>
      </div>
      <div className={cn(category !== 'hooks' && 'hidden')}>
        <AgentHooksPane
          key={`hooks-${activeAgent?.id ?? 'new'}`}
          value={capabilities.hooks ?? []}
          onChange={(hooks) => {
            onCapabilitiesPatch({ hooks });
          }}
        />
      </div>
      <Pane
        className={cn(category !== 'compaction' && 'hidden')}
        label="Compaction"
        description="Context compaction policy for this agent."
      >
        <DraftCompaction
          key={`compaction-${activeAgent?.id ?? 'new'}`}
          agent={activeAgent}
          onChange={(compaction) => {
            onCapabilitiesPatch({ compaction });
          }}
        />
      </Pane>
      <div className={cn(category !== 'skills' && category !== 'mcp' && 'hidden')}>
        <DraftCapabilities
          key={`caps-${activeAgent?.id ?? 'new'}`}
          workspaceId={workspaceId}
          section={capabilitiesSection(category)}
          capabilities={capabilities}
          onPatch={onCapabilitiesPatch}
        />
      </div>
      <Pane
        className={cn(category !== 'limits' && 'hidden')}
        label="Limits"
        description="Budget limits for a single run."
      >
        <AgentLimitsPane form={form} />
      </Pane>
      <div className={cn(category !== 'subagents' && 'hidden')}>
        {activeAgent && showSubagents ? (
          <AgentSubagentsPane
            workspaceId={workspaceId}
            parentId={activeAgent.id}
            enabledPlugins={capabilities.enabledPlugins ?? {}}
            onConfigure={onOpenSubagent}
          />
        ) : null}
      </div>
      {category === 'graph' ? (
        <Pane
          sticky={false}
          className="min-h-0 flex-1"
          label="Graph"
          description="ReAct graph of this agent."
        >
          <AgentGraphPane
            value={graphDoc}
            onChange={(next) => {
              graphTouchedRef.current = true;
              graphDocRef.current = next;
              setGraphDoc(next);
            }}
          />
        </Pane>
      ) : null}
    </div>
  );
}
