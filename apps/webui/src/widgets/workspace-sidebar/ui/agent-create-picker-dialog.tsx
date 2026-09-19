import { useQuery } from '@tanstack/react-query';
import { BotIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAgentsDisplayStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  agentDraftFromPreset,
  createAgent,
  openAgentConfigDialog,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { type AgentPresetRecord, listAgentPresets } from '@/shared/api';
import { studioPath } from '@/shared/config/routes';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';

type PickerData = { workspaceId: string };

type PickerChoice = { kind: 'blank' } | { kind: 'preset'; preset: AgentPresetRecord };

function AgentCreatePickerDialog({
  onResolve,
}: DialogComponentProps<PickerChoice | null, PickerData>) {
  const presetsQuery = useQuery({
    queryKey: ['agent-presets'],
    queryFn: listAgentPresets,
    staleTime: 60_000,
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

function openAgentCreatePicker(workspaceId: string) {
  return dialog.open(AgentCreatePickerDialog, {
    title: 'New agent',
    description: 'Pick a preset or start blank.',
    className: 'sm:max-w-lg',
    testId: 'agent-create-picker',
    data: { workspaceId },
  });
}

export function AgentsSectionCreateButton({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="New agent"
      aria-label="New agent"
      data-testid={`agents-create-${workspaceId}`}
      onClick={() => {
        void (async () => {
          const choice = await openAgentCreatePicker(workspaceId);
          if (!choice) {
            return;
          }
          const draft = choice.kind === 'preset' ? agentDraftFromPreset(choice.preset) : null;
          const result = await openAgentConfigDialog(draft, workspaceId);
          if (!result) {
            return;
          }
          try {
            const created = await createAgent(workspaceId, result.fields);
            if (!created) {
              return;
            }
            await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
            if (created.thread) {
              useIdeStore.getState().openThread(workspaceId, created.agent.id, created.thread.id);
              useAgentsDisplayStore.getState().expand(created.agent.id);
              await navigate(studioPath.thread(workspaceId, created.thread.id));
            }
            onCreated?.();
          } catch (error) {
            toast.add({
              title: error instanceof Error ? error.message : 'Could not create agent',
            });
          }
        })();
      }}
    >
      <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New agent</span>
    </Button>
  );
}
