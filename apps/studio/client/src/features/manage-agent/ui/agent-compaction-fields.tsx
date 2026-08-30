import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { Agent } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';

import {
  type CompactionDraft,
  compactionDraftFrom,
  toCompactionPortRef,
} from '../model/agent-compaction';
import { type ModelOption, modelGroups, modelOptions } from '../model/model-groups';
import { updateAgent } from '../model/update-agent';

const SAME_AS_AGENT = '__same_as_agent__';

export function AgentCompactionFields({ agent }: { agent: Agent }) {
  const { workspaceId } = useStudioLocation();
  const providers = useQuery(providersQuery).data ?? [];
  const groups = modelGroups(providers);
  const items = modelOptions(groups);
  const [draft, setDraft] = useState(() => compactionDraftFrom(agent.compaction));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const next = compactionDraftFrom(agent.compaction);
    setDraft(next);
    draftRef.current = next;
  }, [agent.compaction, agent.updatedAt]);

  function commit(next: CompactionDraft) {
    if (!workspaceId) {
      return;
    }
    const compaction = toCompactionPortRef(next);
    if (JSON.stringify(compaction) === JSON.stringify(agent.compaction)) {
      return;
    }
    void updateAgent(workspaceId, agent.id, {
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions,
      modelId: agent.modelId,
      effort: agent.effort,
      generation: agent.generation,
      toolOutput: agent.toolOutput,
      compaction,
      memory: agent.memory,
    });
  }

  function patch(partial: Partial<CompactionDraft>, save = false) {
    setDraft((current) => {
      const next = { ...current, ...partial };
      draftRef.current = next;
      if (save) {
        commit(next);
      }
      return next;
    });
  }

  const summaryValue = summarySelectValue(draft, items);
  const summaryLabel =
    summaryValue === SAME_AS_AGENT
      ? 'Same as agent'
      : (items.find((item) => item.value === summaryValue)?.name ?? 'Same as agent');

  return (
    <FieldGroup className="gap-2" data-testid="agent-compaction-fields">
      <Field orientation="horizontal" className="items-center justify-between gap-2">
        <FieldLabel htmlFor="compaction-enabled" className="font-normal text-xs">
          Enabled
        </FieldLabel>
        <Switch
          id="compaction-enabled"
          size="sm"
          checked={draft.enabled}
          onCheckedChange={(value) => patch({ enabled: Boolean(value) }, true)}
        />
      </Field>
      {draft.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              id="compaction-threshold"
              label="Threshold"
              value={draft.thresholdRatio}
              placeholder="0.8"
              onChange={(thresholdRatio) => patch({ thresholdRatio })}
              onCommit={() => commit(draftRef.current)}
            />
            <NumberField
              id="compaction-protect"
              label="Protect recent"
              value={draft.protectRecentRatio}
              placeholder="0.1"
              onChange={(protectRecentRatio) => patch({ protectRecentRatio })}
              onCommit={() => commit(draftRef.current)}
            />
            <NumberField
              id="compaction-reserve"
              label="Output reserve"
              value={draft.outputReserveTokens}
              placeholder="0"
              onChange={(outputReserveTokens) => patch({ outputReserveTokens })}
              onCommit={() => commit(draftRef.current)}
            />
            <Field orientation="horizontal" className="items-center gap-2 pt-5">
              <FieldLabel htmlFor="compaction-auto" className="font-normal text-xs">
                Auto
              </FieldLabel>
              <Switch
                id="compaction-auto"
                size="sm"
                checked={draft.auto}
                onCheckedChange={(value) => patch({ auto: Boolean(value) }, true)}
              />
            </Field>
          </div>
          <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
            Output reserve — tokens kept free for the model reply. Threshold uses context_length −
            reserve.
          </FieldDescription>
          <Field>
            <FieldLabel htmlFor="compaction-summary-model">Summary model</FieldLabel>
            <Select
              items={[
                { value: SAME_AS_AGENT, label: 'Same as agent' },
                ...items.map((item) => ({ value: item.value, label: item.name })),
              ]}
              value={summaryValue}
              onValueChange={(next) => {
                if (typeof next !== 'string') {
                  return;
                }
                if (next === SAME_AS_AGENT) {
                  patch({ summaryProvider: '', summaryModel: '' }, true);
                  return;
                }
                const option = items.find((item) => item.value === next);
                if (!option) {
                  return;
                }
                patch({ summaryProvider: option.provider, summaryModel: option.name }, true);
              }}
              disabled={items.length === 0}
            >
              <SelectTrigger
                id="compaction-summary-model"
                size="sm"
                className="w-full"
                data-testid="compaction-summary-model"
              >
                {items.length === 0 ? (
                  <SelectValue placeholder="Attach a model first" />
                ) : (
                  <span
                    className={`min-w-0 flex-1 truncate text-left ${summaryValue === SAME_AS_AGENT ? '' : 'font-mono'}`}
                  >
                    {summaryLabel}
                  </span>
                )}
              </SelectTrigger>
              <SelectContent className="w-full" align="start">
                <SelectItem value={SAME_AS_AGENT}>Same as agent</SelectItem>
                {groups.map((group) => (
                  <SelectGroup key={group.provider}>
                    <SelectLabel>{group.provider}</SelectLabel>
                    {group.models.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="font-mono">
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
              Optional. Empty = agent model for the summary call.
            </FieldDescription>
          </Field>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Off — window never compresses.
        </p>
      )}
    </FieldGroup>
  );
}

function summarySelectValue(draft: CompactionDraft, items: ModelOption[]): string {
  if (!draft.summaryProvider || !draft.summaryModel) {
    return SAME_AS_AGENT;
  }
  const found = items.find(
    (item) => item.provider === draft.summaryProvider && item.name === draft.summaryModel,
  );
  return found?.value ?? SAME_AS_AGENT;
}

function NumberField({
  id,
  label,
  value,
  placeholder,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}
