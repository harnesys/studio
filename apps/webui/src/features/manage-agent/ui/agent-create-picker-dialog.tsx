import { useQuery } from '@tanstack/react-query';
import { BotIcon, SparklesIcon } from 'lucide-react';
import { type AgentPresetRecord, listAgentPresets } from '@/shared/api';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

type PickerData = {
  workspaceId: string;
};
type PickerChoice =
  | {
      kind: 'blank';
    }
  | {
      kind: 'preset';
      preset: AgentPresetRecord;
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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          type="button"
          data-testid="agent-create-blank"
          onClick={() => onResolve?.({ kind: 'blank' })}
          className="flex min-h-24 flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-accent"
        >
          <BotIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Blank agent</span>
          <span className="text-muted-foreground text-xs">Start empty, configure yourself</span>
        </button>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`agent-create-preset-${preset.id}`}
            onClick={() => onResolve?.({ kind: 'preset', preset })}
            className="flex min-h-24 flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
          >
            <SparklesIcon className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">{preset.name}</span>
            <span className="line-clamp-2 text-muted-foreground text-xs">
              {preset.role || 'Preset'}
            </span>
          </button>
        ))}
      </div>
      {presetsQuery.isLoading ? (
        <p className="text-muted-foreground text-xs">Loading presets…</p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}
export function openAgentCreatePicker(workspaceId: string) {
  return dialog.open(AgentCreatePickerDialog, {
    title: 'New agent',
    description: 'Pick a preset or start blank.',
    className: 'sm:max-w-lg',
    testId: 'agent-create-picker',
    data: { workspaceId },
  });
}
