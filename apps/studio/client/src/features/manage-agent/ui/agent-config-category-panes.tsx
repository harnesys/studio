import { useQuery } from '@tanstack/react-query';
import type { ExplainKind } from 'harnesys';
import type { MutableRefObject } from 'react';
import { useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { agentCapabilitiesQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Pane, Row, RowChip, RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';

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
        <div className="flex flex-col gap-4">
          <DraftGrantedMcpServers
            key={`mcp-${activeAgent?.id ?? 'new'}`}
            workspaceId={workspaceId}
            mcpServers={capabilities.mcpServers ?? []}
            enabledPlugins={capabilities.enabledPlugins ?? {}}
            onChange={(mcpServers) => {
              onCapabilitiesPatch({ mcpServers });
            }}
          />
          <ExplainPreview
            key={`tools-preview-${activeAgent?.id ?? 'new'}`}
            workspaceId={workspaceId}
            agentId={activeAgent?.id ?? null}
            kinds={['tool', 'mcp']}
            label="Tools"
            description="Effective set from GET /api/agents/:id/capabilities; provenance per row."
          />
        </div>
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

const EXPLAIN_STATUS_TONE = {
  granted: 'accent',
  deferred: 'neutral',
  disabled: 'danger',
  'dropped-by-mode': 'danger',
  'denied-by-universe': 'danger',
  'overrode-host': 'neutral',
} as const;

/**
 * Effective-set preview: data ONLY from `GET /api/agents/:id/capabilities`
 * (no local derivation). Search filters by name; each row carries
 * a provenance tooltip (source + status + reason).
 */
function ExplainPreview({
  workspaceId,
  agentId,
  kinds,
  label,
  description,
}: {
  workspaceId: string;
  agentId: string | null;
  kinds: ExplainKind[];
  label: string;
  description: string;
}) {
  const [search, setSearch] = useState('');
  const query = useQuery(agentCapabilitiesQuery(agentId, workspaceId));
  const needle = search.trim().toLowerCase();
  const seen = new Map<string, number>();
  const rows = (query.data?.explain ?? [])
    .filter((entry) => kinds.includes(entry.kind))
    .filter((entry) => needle === '' || entry.item.toLowerCase().includes(needle))
    .sort((a, b) => a.item.localeCompare(b.item))
    .map((entry) => {
      // One item can appear once per chain layer (granted → disabled); keys stay unique.
      const base = `${entry.kind}:${entry.item}:${entry.source}:${entry.status}`;
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      return { entry, key: occurrence === 1 ? base : `${base}:${occurrence}` };
    });

  return (
    <Pane
      testId="explain-preview"
      label={label}
      count={query.isPending ? undefined : rows.length}
      description={description}
    >
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name…"
        aria-label={`Search ${label}`}
        className="h-8 text-xs"
      />
      {agentId === null ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          Save the agent to preview the effective set.
        </p>
      ) : null}
      {agentId !== null && !query.isPending && rows.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          Nothing in the effective set.
        </p>
      ) : null}
      {rows.length > 0 ? (
        <RowList>
          {rows.map(({ entry, key }) => (
            <Row
              key={key}
              testId={`explain-row-${entry.item}`}
              title={entry.item}
              meta={entry.source}
              summary={
                <span title={`${entry.source} · ${entry.status} — ${entry.reason}`}>
                  {entry.reason}
                </span>
              }
              chips={<RowChip tone={EXPLAIN_STATUS_TONE[entry.status]}>{entry.status}</RowChip>}
            />
          ))}
        </RowList>
      ) : null}
    </Pane>
  );
}
