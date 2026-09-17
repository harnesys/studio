import { useQuery } from '@tanstack/react-query';

import { type Agent, findModelLabel, formatContextWindow } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useDesk, useSelectedThread, useThreadEvents } from '@/features/desk';
import { providersQuery } from '@/shared/api';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Badge } from '@/shared/ui/badge';

import { FactRow } from './fact-row';
import { McpInspector } from './mcp-inspector';
import { PlanInspector } from './plan-inspector';
import { Section } from './section';
import { SkillsInspector } from './skills-inspector';

export function InspectorPane({ agent }: { agent: Agent }) {
  const { workspace } = useDesk();
  const thread = useSelectedThread();
  const events = useThreadEvents(thread?.id ?? null);
  const streaming = useSessionStore(
    (state) => thread !== null && Boolean(state.activeRuns[thread.id]),
  );
  const providers = useQuery(providersQuery(workspace?.id ?? '')).data ?? [];
  const modelLabel = findModelLabel(agent.modelId, providers);
  const resolvedModel = providers
    .flatMap((provider) =>
      provider.models.map((model) => ({ ...model, providerName: provider.name })),
    )
    .find((model) => model.id === agent.modelId);

  return (
    <>
      <PlanInspector />
      <Section label="Model">
        {resolvedModel ? (
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="font-medium text-[13px]">{resolvedModel.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {resolvedModel.providerName}
                {resolvedModel.kind ? ` · ${resolvedModel.kind}` : ''}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              {resolvedModel.contextWindow ? (
                <FactRow label="Context" mono>
                  {formatContextWindow(resolvedModel.contextWindow)}
                </FactRow>
              ) : null}
              {resolvedModel.top_provider?.max_completion_tokens ? (
                <FactRow label="Max out" mono>
                  {formatContextWindow(resolvedModel.top_provider.max_completion_tokens)}
                </FactRow>
              ) : null}
              {resolvedModel.pricing?.prompt !== undefined ? (
                <FactRow label="In $/1M" mono>
                  ${resolvedModel.pricing.prompt}
                </FactRow>
              ) : null}
              {resolvedModel.pricing?.completion !== undefined ? (
                <FactRow label="Out $/1M" mono>
                  ${resolvedModel.pricing.completion}
                </FactRow>
              ) : null}
            </div>

            {resolvedModel.supported_parameters && resolvedModel.supported_parameters.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {resolvedModel.supported_parameters.map((param) => (
                  <Badge
                    key={param}
                    variant="secondary"
                    className="px-1.5 py-0 font-normal text-[10px]"
                  >
                    {param}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[13px] text-muted-foreground">{modelLabel}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Assign a model in Config to chat.
            </p>
          </div>
        )}
      </Section>

      {agent.instructions.trim() ? (
        <Section label="Instructions">
          <p className="line-clamp-8 whitespace-pre-wrap text-[12px] text-foreground/90 leading-relaxed">
            {agent.instructions}
          </p>
        </Section>
      ) : null}

      <SkillsInspector agent={agent} />
      <McpInspector agent={agent} />

      {thread ? (
        <Section label="Thread" hint={streaming ? 'running' : undefined}>
          <div className="flex flex-col gap-1">
            <FactRow label="Title">{thread.title || 'Untitled'}</FactRow>
            <FactRow label="Entries" mono>
              {events.length}
            </FactRow>
            <FactRow label="Updated">{formatDayTime(thread.updatedAt)}</FactRow>
            {streaming ? (
              <FactRow label="Run">
                <span className="text-live">Streaming</span>
              </FactRow>
            ) : null}
          </div>
        </Section>
      ) : (
        <Section label="Thread">
          <p className="text-[12px] text-muted-foreground">No thread selected.</p>
        </Section>
      )}

      {workspace ? (
        <Section label="Workspace">
          <div className="flex flex-col gap-1">
            <FactRow label="Name">{workspace.name}</FactRow>
            <FactRow label="Path" mono>
              <span title={workspace.path}>{workspace.path}</span>
            </FactRow>
          </div>
        </Section>
      ) : null}
    </>
  );
}
