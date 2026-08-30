import { useState } from 'react';

import type { Agent } from '@/entities/agent';
import type { ScheduleDraft } from '@/entities/schedule';
import { useStudioLocation } from '@/shared/config/location';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

import { ScheduleThreadField } from './schedule-thread-field';

export function openCreateScheduleDialog(agents: Agent[]) {
  return dialog.open(CreateScheduleDialog, {
    title: 'New schedule',
    description: 'Add a cron schedule. You can finish the details on its page.',
    className: 'sm:max-w-md',
    testId: 'create-schedule-dialog',
    data: { agents },
  });
}

export function CreateScheduleDialog({
  onResolve,
  data,
}: DialogComponentProps<ScheduleDraft, { agents: Agent[] }>) {
  const agents = data?.agents ?? [];
  const { workspaceId } = useStudioLocation();
  const [draft, setDraft] = useState<ScheduleDraft>(() => emptyDraft(agents));

  return (
    <>
      <FieldGroup>
        <Field data-invalid={draft.name.trim().length === 0 || undefined}>
          <FieldLabel htmlFor="schedule-name">Name</FieldLabel>
          <Input
            id="schedule-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Nightly eval sweep"
            aria-invalid={draft.name.trim().length === 0 || undefined}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="schedule-agent">Agent</FieldLabel>
          <Select
            items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
            value={draft.targetAgentId}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setDraft({ ...draft, targetAgentId: value, threadId: undefined });
              }
            }}
          >
            <SelectTrigger id="schedule-agent" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {workspaceId ? (
          <ScheduleThreadField
            workspaceId={workspaceId}
            agentId={draft.targetAgentId}
            value={draft.threadId ?? ''}
            onChange={(threadId) => setDraft({ ...draft, threadId: threadId || undefined })}
            allowDedicated
          />
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          disabled={draft.name.trim().length === 0 || agents.length === 0}
          onClick={() => onResolve?.(draft)}
        >
          Create schedule
        </Button>
      </DialogFooter>
    </>
  );
}

function emptyDraft(agents: Agent[]): ScheduleDraft {
  return {
    name: '',
    targetAgentId: agents[0]?.id ?? '',
  };
}
