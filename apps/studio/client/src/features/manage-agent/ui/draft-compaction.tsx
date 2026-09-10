import type { PortRef } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
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

const SAME_AS_AGENT = '__same_as_agent__';

export function DraftCompaction({
  agent,
  onChange,
}: {
  agent: Agent | null;
  onChange: (compaction: PortRef | null) => void;
}) {
  const providers = useQuery(providersQuery).data ?? [];
  const groups = modelGroups(providers);
  const items = modelOptions(groups);
  const [draft, setDraft] = useState(() => compactionDraftFrom(agent?.compaction ?? null));

  function patch(partial: Partial<CompactionDraft>) {
    const next = { ...draft, ...partial };
    setDraft(next);
    onChange(toCompactionPortRef(next));
  }

  const summaryValue = summarySelectValue(draft, items);
  const summaryLabel =
    summaryValue === SAME_AS_AGENT
      ? 'Same as agent'
      : (items.find((item) => item.value === summaryValue)?.name ?? 'Same as agent');

  return (
    <FieldGroup className="gap-2">
      <Field orientation="horizontal" className="items-center justify-between gap-2">
        <FieldLabel htmlFor="draft-compaction-enabled" className="font-normal text-xs">
          Enabled
        </FieldLabel>
        <Switch
          id="draft-compaction-enabled"
          size="sm"
          checked={draft.enabled}
          onCheckedChange={(value) => patch({ enabled: Boolean(value) })}
        />
      </Field>
      {draft.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              id="draft-compaction-threshold"
              label="Threshold"
              value={draft.thresholdRatio}
              placeholder="0.8"
              onChange={(thresholdRatio) => patch({ thresholdRatio })}
            />
            <NumberField
              id="draft-compaction-protect"
              label="Protect recent"
              value={draft.protectRecentRatio}
              placeholder="0.1"
              onChange={(protectRecentRatio) => patch({ protectRecentRatio })}
            />
            <NumberField
              id="draft-compaction-reserve"
              label="Output reserve"
              value={draft.outputReserveTokens}
              placeholder="0"
              onChange={(outputReserveTokens) => patch({ outputReserveTokens })}
            />
            <Field orientation="horizontal" className="items-center gap-2 pt-5">
              <FieldLabel htmlFor="draft-compaction-auto" className="font-normal text-xs">
                Auto
              </FieldLabel>
              <Switch
                id="draft-compaction-auto"
                size="sm"
                checked={draft.auto}
                onCheckedChange={(value) => patch({ auto: Boolean(value) })}
              />
            </Field>
          </div>
          <FieldDescription className="text-[11px] text-muted-foreground leading-snug">
            Output reserve — tokens kept free for the model reply. Threshold uses context_length −
            reserve.
          </FieldDescription>
          <Field>
            <FieldLabel htmlFor="draft-compaction-summary-model">Summary model</FieldLabel>
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
                  patch({ summaryProvider: '', summaryModel: '' });
                  return;
                }
                const option = items.find((item) => item.value === next);
                if (!option) {
                  return;
                }
                patch({ summaryProvider: option.provider, summaryModel: option.name });
              }}
              disabled={items.length === 0}
            >
              <SelectTrigger id="draft-compaction-summary-model" size="sm" className="w-full">
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
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
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
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}
