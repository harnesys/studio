import { DEFAULT_MODE_ID, type ModePreset, modeFromPreset } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { type UseFormReturn, useFieldArray, useWatch } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import {
  agentCapabilitiesQuery,
  modePresetsQuery,
  workspaceCapabilitiesQuery,
  workspaceSkillsQuery,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Pane, Row, RowChip, RowList } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import { blankModeFields, modeToFields } from '../model/agent-mode-fields';
import { isSourceGranted, type PackAssignmentMap } from '../model/draft-overrides';
import { AgentModeEditor } from './agent-mode-editor';

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
  const permissionsBase = useWatch({ control: form.control, name: 'permissions' }) ?? null;
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
  const explainQuery = useQuery({
    ...agentCapabilitiesQuery(activeAgent?.id ?? null, workspaceId),
    enabled: active && Boolean(activeAgent?.id),
  });
  const presets = presetsQuery.data ?? [];
  const installedIds = new Set(rows.map((row) => row.id));
  const availablePresets = presets.filter((preset) => !installedIds.has(preset.id));
  const skillNames = (skillsQuery.data?.skills ?? []).map((skill) => skill.name);
  const agentPackNames = enabledPackNames(activeAgent?.capabilities ?? {});
  const packNames = (packsQuery.data?.capabilities ?? [])
    .filter((pack) => !pack.name.endsWith('-memory'))
    .map((pack) => pack.name)
    .filter((name) => agentPackNames.includes(name));

  function isDefaultOf(index: number): boolean {
    const row = rows[index];
    if (!row) {
      return false;
    }
    if (row.id === DEFAULT_MODE_ID) {
      return defaultModeId === DEFAULT_MODE_ID || defaultModeId === null;
    }
    return defaultModeId === row.id;
  }

  function setDefaultOf(index: number, next: boolean) {
    const row = rows[index];
    if (!row) {
      return;
    }
    // Off always falls back to the builtin 'ask' chain (defaultModeId = null).
    form.setValue('defaultModeId', next ? row.id : null, { shouldDirty: true });
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
    if (removed && defaultModeId === removed.id) {
      form.setValue('defaultModeId', null, { shouldDirty: true });
    }
    modes.remove(index);
    setExpandedIndex(null);
  }

  return (
    <Pane
      testId="agent-modes-pane"
      label="Modes"
      count={rows.length}
      description="Execution modes with their own instructions and permission gates."
      extra={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={addBlank}>
            <PlusIcon />
            Add
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
              <SparklesIcon />
              From preset
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
        </>
      }
    >
      {modes.fields.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          No modes yet. Add one, or install from a preset.
        </p>
      ) : (
        <RowList>
          {modes.fields.map((field, index) => {
            const row = rows[index];
            if (!row) {
              return null;
            }
            const expanded = expandedIndex === index;
            const title = row.name || '(unnamed mode)';
            return (
              <Row
                key={field.id}
                testId={`draft-mode-${field.id}`}
                title={title}
                mono={false}
                meta={row.id === DEFAULT_MODE_ID ? 'built-in' : undefined}
                chips={isDefaultOf(index) ? <RowChip tone="accent">default</RowChip> : null}
                summary={expanded ? undefined : row.description || row.id || undefined}
                onToggle={() => toggleExpanded(index)}
                expanded={expanded}
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${title}`}
                    onClick={() => removeMode(index)}
                  >
                    <Trash2Icon />
                  </Button>
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
                    capabilitiesView={explainQuery.data}
                    isDefault={isDefaultOf(index)}
                    onSetDefault={(next) => setDefaultOf(index, next)}
                    base={permissionsBase}
                  />
                ) : null}
              </Row>
            );
          })}
        </RowList>
      )}
    </Pane>
  );
}

function enabledPackNames(caps: PackAssignmentMap): string[] {
  return Object.keys(caps).filter((name) => isSourceGranted(caps[name]));
}
