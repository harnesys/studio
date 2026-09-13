import type { MutableRefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
import { RowHeader } from '@/shared/ui/capability-rows';

import type { AgentCapabilitiesDraft, AgentConfigResult } from '../model/agent-config';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import type { StudioGraphDocument } from '../model/agent-graph-document';
import type { AgentConfigCategory } from './agent-config-nav';
import { AgentIdentityPane, AgentLimitsPane, AgentModelPane } from './agent-config-panes';
import { AgentGraphPane } from './agent-graph-pane';
import { AgentHooksPane } from './agent-hooks-pane';
import { AgentModesPane } from './agent-modes-pane';
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
  graphDoc: StudioGraphDocument;
  graphDocRef: MutableRefObject<StudioGraphDocument>;
  graphTouchedRef: MutableRefObject<boolean>;
  setGraphDoc: (next: StudioGraphDocument) => void;
  capabilitiesRef: MutableRefObject<AgentCapabilitiesDraft>;
  openAgentDialog: (agent: Agent | null, workspaceId: string) => Promise<AgentConfigResult | null>;
  onOpenSubagent: (agent: Agent) => void;
};

export function AgentConfigCategoryPanes({
  category,
  form,
  workspaceId,
  activeAgent,
  showSubagents,
  graphDoc,
  graphDocRef,
  graphTouchedRef,
  setGraphDoc,
  capabilitiesRef,
  openAgentDialog,
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
      <div className={cn(category === 'identity' ? 'flex min-h-0 flex-1 flex-col pr-1' : 'hidden')}>
        <AgentIdentityPane form={form} />
      </div>
      <div className={cn(category !== 'model' && 'hidden')}>
        <AgentModelPane form={form} />
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
          <div className="flex flex-col gap-1">
            <RowHeader label="Packs" />
            <DraftCapabilityPacks
              key={`packs-${activeAgent?.id ?? 'new'}`}
              workspaceId={workspaceId}
              value={activeAgent?.capabilities ?? {}}
              onChange={(capabilities) => {
                capabilitiesRef.current = { ...capabilitiesRef.current, capabilities };
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <RowHeader label="Plugins" />
            <DraftEnabledPlugins
              key={`plugins-${activeAgent?.id ?? 'new'}`}
              workspaceId={workspaceId}
              value={activeAgent?.enabledPlugins ?? {}}
              onChange={(enabledPlugins) => {
                capabilitiesRef.current = { ...capabilitiesRef.current, enabledPlugins };
              }}
            />
          </div>
        </div>
      </div>
      <div className={cn(category !== 'hooks' && 'hidden')}>
        <AgentHooksPane
          key={`hooks-${activeAgent?.id ?? 'new'}`}
          value={activeAgent?.hooks ?? []}
          onChange={(hooks) => {
            capabilitiesRef.current = { ...capabilitiesRef.current, hooks };
          }}
        />
      </div>
      <div className={cn(category !== 'compaction' && 'hidden')}>
        <DraftCompaction
          key={`compaction-${activeAgent?.id ?? 'new'}`}
          agent={activeAgent}
          onChange={(compaction) => {
            capabilitiesRef.current = { ...capabilitiesRef.current, compaction };
          }}
        />
      </div>
      <div className={cn(category !== 'skills' && category !== 'mcp' && 'hidden')}>
        <DraftCapabilities
          key={`caps-${activeAgent?.id ?? 'new'}`}
          agent={activeAgent}
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
      <div className={cn(category !== 'subagents' && 'hidden')}>
        {activeAgent && showSubagents ? (
          <AgentSubagentsPane
            workspaceId={workspaceId}
            parentId={activeAgent.id}
            openAgentDialog={openAgentDialog}
            onConfigure={onOpenSubagent}
            onConfirmDelete={(delegate) =>
              alert.confirm({
                title: `Delete ${delegate.name}?`,
                description:
                  'This subagent is removed from the parent. Spawn history on threads is kept.',
                confirmText: 'Delete subagent',
                variant: 'destructive',
                testId: 'delete-subagent-dialog',
              })
            }
          />
        ) : null}
      </div>
      {category === 'graph' ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
  );
}
