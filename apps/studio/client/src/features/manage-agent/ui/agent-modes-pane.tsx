import type { ModePreset } from '@harnesys/studio-shared';
import { modeFromPreset } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { type UseFormReturn, useFieldArray, useWatch } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { modePresetsQuery, workspaceCapabilitiesQuery, workspaceSkillsQuery } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import { blankModeFields, modeToFields } from '../model/agent-mode-fields';
import { AgentModeEditor } from './agent-mode-editor';
import { ConfigEntityCard, initialsFromLabel } from './config-entity-card';

type AgentModesPaneProps = {
  form: UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;
  workspaceId: string;
  activeAgent: Agent | null;
  active: boolean;
};

export function AgentModesPane({ form, workspaceId, activeAgent, active }: AgentModesPaneProps) {
  const modes = useFieldArray({ control: form.control, name: 'modes' });
  const rows = useWatch({ control: form.control, name: 'modes' }) ?? [];
  const defaultModeId = useWatch({ control: form.control, name: 'defaultModeId' });
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId),
    enabled: active && Boolean(workspaceId),
  });
  const packsQuery = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId),
    enabled: active && Boolean(workspaceId),
  });
  const presetsQuery = useQuery({ ...modePresetsQuery, enabled: active });
  const presets = presetsQuery.data ?? [];
  const installedIds = new Set(rows.map((row) => row.id));
  const availablePresets = presets.filter((preset) => !installedIds.has(preset.id));
  const skillNames = (skillsQuery.data?.skills ?? []).map((skill) => skill.name);
  const agentPackNames = enabledPackNames(activeAgent?.capabilities ?? {});
  const packNames = (packsQuery.data?.capabilities ?? [])
    .filter((pack) => !pack.name.endsWith('-memory'))
    .map((pack) => pack.name)
    .filter((name) => agentPackNames.includes(name));

  function setDefault(id: string | null) {
    form.setValue('defaultModeId', id, { shouldDirty: true });
  }

  function toggleExpanded(index: number) {
    setExpandedIndex((current) => (current === index ? null : index));
  }

  function addBlank() {
    modes.append(blankModeFields());
    setExpandedIndex(rows.length);
  }

  function addFromPreset(preset: ModePreset) {
    modes.append(modeToFields(modeFromPreset(preset)));
    setExpandedIndex(rows.length);
  }

  function removeMode(index: number) {
    const removed = rows[index];
    if (removed && removed.id === defaultModeId) {
      setDefault(null);
    }
    modes.remove(index);
    setExpandedIndex(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="agent-modes-pane">
      <ConfigEntityCard
        title="Ask before changes"
        badge="built-in"
        description="Fallback mode · every gate asks before it runs"
        initials="As"
        trailing={
          <ModeDefaultRadio
            title="Ask before changes"
            checked={defaultModeId === null}
            onSetDefault={() => setDefault(null)}
          />
        }
      />
      {modes.fields.map((field, index) => {
        const row = rows[index];
        if (!row) {
          return null;
        }
        const expanded = expandedIndex === index;
        return (
          <ConfigEntityCard
            key={field.id}
            title={row.name || '(unnamed mode)'}
            badge="mode"
            description={row.description || row.id || undefined}
            initials={initialsFromLabel(row.name || row.id || 'mode')}
            expanded={expanded}
            onClick={() => toggleExpanded(index)}
            trailing={
              <>
                <ModeDefaultRadio
                  title={row.name || row.id || `mode ${index + 1}`}
                  checked={defaultModeId === row.id}
                  onSetDefault={() => setDefault(row.id)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${row.name || row.id || 'mode'}`}
                  onClick={() => removeMode(index)}
                  className="opacity-70"
                >
                  <Trash2Icon />
                </Button>
              </>
            }
          >
            {expanded ? (
              <AgentModeEditor
                key={field.id}
                form={form}
                index={index}
                skillNames={skillNames}
                agentSkills={activeAgent?.skills ?? []}
                packNames={packNames}
              />
            ) : null}
          </ConfigEntityCard>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addBlank}>
          <PlusIcon />
          Add
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <SparklesIcon />
            Add from preset
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {availablePresets.length === 0 ? (
              <DropdownMenuItem disabled>
                {presetsQuery.isLoading ? 'Loading…' : 'All presets installed'}
              </DropdownMenuItem>
            ) : (
              availablePresets.map((preset) => (
                <DropdownMenuItem key={preset.id} onClick={() => addFromPreset(preset)}>
                  <SparklesIcon className="size-3" />
                  {preset.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ModeDefaultRadio({
  title,
  checked,
  onSetDefault,
}: {
  title: string;
  checked: boolean;
  onSetDefault: () => void;
}) {
  return (
    <input
      type="radio"
      name="agent-default-mode"
      checked={checked}
      onChange={onSetDefault}
      aria-label={`Default mode: ${title}`}
      className="size-3.5 shrink-0 accent-primary"
    />
  );
}

function enabledPackNames(caps: Record<string, unknown>): string[] {
  return Object.keys(caps).filter((name) => {
    const config = caps[name];
    if (config === undefined) {
      return name === 'skills';
    }
    return config != null;
  });
}
