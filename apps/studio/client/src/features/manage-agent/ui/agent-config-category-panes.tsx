import type { MutableRefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';

import type { AgentCapabilitiesDraft } from '../model/agent-config';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import type { StudioGraphDocument } from '../model/agent-graph-document';
import type { AgentConfigCategory } from './agent-config-nav';
import {
  AgentIdentityPane,
  AgentInstructionsPane,
  AgentLimitsPane,
  AgentModelPane,
} from './agent-config-panes';
import { AgentGraphPane } from './agent-graph-pane';
import { AgentSubagentsPane } from './agent-subagents-pane';
import { DraftCapabilities, type DraftCapabilitiesSection } from './draft-capabilities';
import { DraftCapabilityPacks } from './draft-capability-packs';
import { DraftCompaction } from './draft-compaction';

function capabilitiesSection(category: AgentConfigCategory): DraftCapabilitiesSection {
  if (category === 'tools') {
    return 'tools';
  }
  if (category === 'mcp') {
    return 'mcp';
  }
  return 'skills';
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
  onOpenSubagent,
}: AgentConfigCategoryPanesProps) {
  return (
    <div
      className={cn(
        'min-h-0 min-w-0 flex-1',
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
          key={`packs-${activeAgent?.id ?? 'new'}`}
          workspaceId={workspaceId}
          value={activeAgent?.capabilities ?? {}}
          onChange={(capabilities) => {
            capabilitiesRef.current = { ...capabilitiesRef.current, capabilities };
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
      <div
        className={cn(
          category !== 'skills' && category !== 'tools' && category !== 'mcp' && 'hidden',
        )}
      >
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
        <div className="flex h-full min-h-0 min-w-0">
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
