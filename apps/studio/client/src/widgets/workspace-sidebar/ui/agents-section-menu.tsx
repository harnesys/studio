import { useQuery } from '@tanstack/react-query';
import { BotIcon, SparklesIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Agent } from '@/entities/agent';
import {
  AGENTS_THREAD_MODE_HINTS,
  AGENTS_THREAD_MODE_LABELS,
  AGENTS_THREAD_MODES,
  isAgentsThreadMode,
  useAgentsDisplayStore,
  useAgentsSlideStore,
} from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import {
  agentDraftFromPreset,
  createAgent,
  openAgentConfigDialog,
  updateAgentCapabilities,
} from '@/features/manage-agent';
import { listAgentPresets } from '@/shared/api';
import { studioPath } from '@/shared/config/routes';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { SectionMenu } from './section-menu';

export function AgentsSectionActions({ workspaceId }: { workspaceId: string | null }) {
  const navigate = useNavigate();
  const slideAgentId = useAgentsSlideStore((state) => state.agentId);
  const mode = useAgentsDisplayStore((state) => state.mode);
  const setMode = useAgentsDisplayStore((state) => state.setMode);
  const presetsQuery = useQuery({
    queryKey: ['agent-presets'],
    queryFn: listAgentPresets,
    staleTime: 60_000,
  });
  if (slideAgentId) {
    return null;
  }

  const openCreated = async (created: { agent: Agent; thread: { id: string } | null }) => {
    if (!workspaceId || !created.thread) {
      return;
    }
    useIdeStore.getState().openThread(workspaceId, created.agent.id, created.thread.id);
    if (mode === 'inline') {
      useAgentsDisplayStore.getState().expand(created.agent.id);
    } else {
      useAgentsSlideStore.getState().open(created.agent.id);
    }
    await navigate(studioPath.thread(workspaceId, created.thread.id));
  };

  const createAgentFlow = () => {
    void openAgentConfigDialog(null, workspaceId ?? '').then(async (result) => {
      if (!result || !workspaceId) {
        return;
      }
      try {
        const created = await createAgent(workspaceId, result.fields);
        if (created) {
          await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
          await openCreated(created);
        }
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not create agent',
        });
      }
    });
  };

  const createFromPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!workspaceId || !preset) {
      return;
    }
    void openAgentConfigDialog(agentDraftFromPreset(preset), workspaceId).then(async (result) => {
      if (!result || !workspaceId) {
        return;
      }
      try {
        const created = await createAgent(workspaceId, result.fields);
        if (created) {
          await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
        }
      } catch (error) {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not create agent',
        });
      }
    });
  };

  const presets = presetsQuery.data ?? [];

  return (
    <SectionMenu label="Agent actions" contentClassName="w-full">
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={createAgentFlow}>
          <BotIcon className="size-3" />
          Create Agent
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SparklesIcon className="size-3" />
            From Preset
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            {presets.length === 0 ? (
              <DropdownMenuItem disabled>
                {presetsQuery.isLoading ? 'Loading…' : 'No presets found'}
              </DropdownMenuItem>
            ) : (
              presets.map((preset) => (
                <DropdownMenuItem key={preset.id} onClick={() => createFromPreset(preset.id)}>
                  <SparklesIcon className="size-3" />
                  {preset.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Threads</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isAgentsThreadMode(value)) {
              setMode(value);
            }
          }}
        >
          {AGENTS_THREAD_MODES.map((item) => (
            <DropdownMenuRadioItem key={item} value={item} className="flex-col items-start gap-0">
              <span>{AGENTS_THREAD_MODE_LABELS[item]}</span>
              <span className="text-muted-foreground text-xs leading-4">
                {AGENTS_THREAD_MODE_HINTS[item]}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </SectionMenu>
  );
}
