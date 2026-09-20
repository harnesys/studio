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
import { DraftCapabilities } from './draft-capabilities';
import { DraftCompaction } from './draft-compaction';
import { DraftGrantedMcpServers, DraftGrantedSkills } from './draft-loose-resources';

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
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-auto',
        // category === 'graph' || category === 'identity' ? 'overflow-hidden' : 'pr-1',
      )}
    >
      <Pane
        sticky={false}
        className={cn(category === 'identity' ? 'min-h-0 flex-1' : 'hidden')}
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
        <AgentModelPane form={form} workspaceId={workspaceId} />
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
        <Pane label="Sources" description="Capability packs and plugins granted to this agent.">
          <DraftCapabilities
            key={`sources-${activeAgent?.id ?? 'new'}`}
            workspaceId={workspaceId}
            agentId={activeAgent?.id ?? null}
            isDelegate={isDelegate}
            capabilities={capabilities.capabilities ?? {}}
            enabledPlugins={capabilities.enabledPlugins ?? {}}
            onCapabilitiesChange={(nextCapabilities) => {
              onCapabilitiesPatch({ capabilities: nextCapabilities });
            }}
            onPluginsChange={(enabledPlugins) => {
              onCapabilitiesPatch({ enabledPlugins });
            }}
          />
        </Pane>
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
      <div className={cn(category !== 'compaction' && 'hidden')}>
        <DraftCompaction
          key={`compaction-${activeAgent?.id ?? 'new'}`}
          agent={activeAgent}
          onChange={(compaction) => {
            onCapabilitiesPatch({ compaction });
          }}
        />
      </div>
      <div className={cn(category !== 'skills' && 'hidden')}>
        <DraftGrantedSkills
          key={`skills-${activeAgent?.id ?? 'new'}`}
          workspaceId={workspaceId}
          skills={capabilities.skills ?? []}
          enabledPlugins={capabilities.enabledPlugins ?? {}}
          onChange={(skills) => {
            onCapabilitiesPatch({ skills });
          }}
        />
      </div>
      <div className={cn(category !== 'mcp' && 'hidden')}>
        <DraftGrantedMcpServers
          key={`mcp-${activeAgent?.id ?? 'new'}`}
          workspaceId={workspaceId}
          mcpServers={capabilities.mcpServers ?? []}
          enabledPlugins={capabilities.enabledPlugins ?? {}}
          onChange={(mcpServers) => {
            onCapabilitiesPatch({ mcpServers });
          }}
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
