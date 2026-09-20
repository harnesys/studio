import { useQuery } from '@tanstack/react-query';
import { BotIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { agentColorTintClass, initialsFromName } from '@/entities/agent';
import { type AgentPresetRecord, listAgentPresets } from '@/shared/api';
import { ENTITY_COLOR_NAMES } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

type PickerData = {
  workspaceId: string;
};
type PickerKind = 'blank' | 'preset';
type PickerChoice =
  | {
      kind: 'blank';
    }
  | {
      kind: 'preset';
      preset: AgentPresetRecord;
    };
type PickerEntry = {
  id: string;
  kind: PickerKind;
  preset?: AgentPresetRecord;
};
function AgentCreatePickerDialog({
  onResolve,
}: DialogComponentProps<PickerChoice | null, PickerData>) {
  const presetsQuery = useQuery({
    queryKey: ['agent-presets'],
    queryFn: listAgentPresets,
    staleTime: 60000,
  });
  const presets = presetsQuery.data ?? [];
  const entries: PickerEntry[] = [
    { id: '__blank__', kind: 'blank' },
    ...presets.map((preset) => ({ id: preset.id, kind: 'preset' as const, preset })),
  ];
  const [selectedId, setSelectedId] = useState(entries[0].id);
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const create = () => {
    if (!selected) {
      return;
    }
    if (selected.kind === 'blank') {
      onResolve?.({ kind: 'blank' });
      return;
    }
    if (selected.preset) {
      onResolve?.({ kind: 'preset', preset: selected.preset });
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-80 grid-cols-[13rem_1fr] gap-3">
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-0.5">
          {entries.map((entry) => (
            <PickerRow
              key={entry.id}
              entry={entry}
              selected={entry.id === selectedId}
              onSelect={() => setSelectedId(entry.id)}
              onCreate={create}
            />
          ))}
          {presetsQuery.isLoading ? (
            <p className="px-2 py-2 text-muted-foreground text-xs">Loading presets…</p>
          ) : null}
        </div>
        <div
          className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border p-3"
          data-testid="agent-create-preview"
        >
          {selected?.kind === 'blank' ? <BlankDossier /> : null}
          {selected?.kind === 'preset' && selected.preset ? (
            <PresetDossier preset={selected.preset} />
          ) : null}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
        <Button type="button" data-testid="agent-create-confirm" onClick={create}>
          Create
        </Button>
      </DialogFooter>
    </div>
  );
}
function PickerRow({
  entry,
  selected,
  onSelect,
  onCreate,
}: {
  entry: PickerEntry;
  selected: boolean;
  onSelect: () => void;
  onCreate: () => void;
}) {
  const preset = entry.preset;
  return (
    <button
      type="button"
      data-testid={
        entry.kind === 'blank' ? 'agent-create-blank' : `agent-create-preset-${entry.id}`
      }
      onClick={onSelect}
      onDoubleClick={onCreate}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border p-2 text-left transition-colors',
        selected ? 'border-border/80 bg-accent' : 'border-transparent hover:bg-accent/60',
      )}
    >
      {preset ? (
        <PresetAvatar name={preset.name} size="md" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
          <BotIcon className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">
          {preset ? preset.name : 'Blank agent'}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {preset ? preset.role : 'Start empty'}
        </span>
      </span>
    </button>
  );
}
function PresetAvatar({ name, size }: { name: string; size: 'md' | 'xl' }) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100000;
  }
  const color = ENTITY_COLOR_NAMES[hash % ENTITY_COLOR_NAMES.length];
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        size === 'xl' ? 'size-10 text-sm' : 'size-9 text-xs',
        agentColorTintClass(color),
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}
function PresetDossier({ preset }: { preset: AgentPresetRecord }) {
  const capabilities = Object.keys(preset.capabilities ?? {}).filter(
    (name) => preset.capabilities?.[name] !== null,
  );
  return (
    <>
      <div className="flex shrink-0 items-center gap-3">
        <PresetAvatar name={preset.name} size="xl" />
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{preset.name}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{preset.role}</p>
        </div>
        <SparklesIcon className="ml-auto size-4 shrink-0 text-muted-foreground/60" />
      </div>
      {capabilities.length > 0 || (preset.skills?.length ?? 0) > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1">
          {capabilities.map((name) => (
            <Badge key={name} variant="secondary" className="font-mono text-[10px]">
              {name}
            </Badge>
          ))}
          {(preset.skills ?? []).map((name) => (
            <Badge key={name} variant="outline" className="font-mono text-[10px]">
              skill: {name}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/40 p-2.5">
        <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
          {preset.instructions}
        </p>
      </div>
      <BudgetLine preset={preset} />
    </>
  );
}
function BlankDossier() {
  return (
    <>
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
          <BotIcon className="size-4" />
        </span>
        <div>
          <p className="font-medium text-sm">Blank agent</p>
          <p className="text-[11px] text-muted-foreground">No preset</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-md bg-muted/40 p-3">
        <p className="max-w-56 text-center text-muted-foreground text-xs leading-relaxed">
          Empty identity, no capabilities. Configure the agent yourself after creation.
        </p>
      </div>
    </>
  );
}
function BudgetLine({ preset }: { preset: AgentPresetRecord }) {
  const budget = preset.budget;
  if (!budget || (budget.maxSteps === undefined && budget.deadlineMs === undefined)) {
    return null;
  }
  const parts: string[] = [];
  if (budget.maxSteps !== undefined) {
    parts.push(`${budget.maxSteps} steps`);
  }
  if (budget.deadlineMs !== undefined) {
    parts.push(formatDeadline(budget.deadlineMs));
  }
  return (
    <p className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{parts.join(' · ')}</p>
  );
}
function formatDeadline(deadlineMs: number): string {
  const minutes = Math.round(deadlineMs / 60000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}
export function openAgentCreatePicker(workspaceId: string) {
  return dialog.open(AgentCreatePickerDialog, {
    title: 'New agent',
    description: 'Pick a preset or start blank.',
    className: 'sm:max-w-2xl',
    testId: 'agent-create-picker',
    data: { workspaceId },
  });
}
