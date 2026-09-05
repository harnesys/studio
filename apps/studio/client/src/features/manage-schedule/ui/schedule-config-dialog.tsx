import { useState } from 'react';

import type { Agent } from '@/entities/agent';
import {
  PERMISSION_MODES,
  SCHEDULE_STATUSES,
  type Schedule,
  scheduleStatusLabel,
} from '@/entities/schedule';
import type { DialogComponentProps } from '@/shared/services/overlay';
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
import { Textarea } from '@/shared/ui/textarea';
import {
  draftFrom,
  emptyScheduleDraft,
  MODE_LABELS,
  type ScheduleFormDraft,
} from '../model/schedule-draft';
import { CronComposer } from './cron-composer';
import { ScheduleHistoryFields } from './schedule-history-fields';
import { ScheduleThreadField } from './schedule-thread-field';

export type ScheduleConfigData = {
  agents: Agent[];
  workspaceId: string;
  schedule: Schedule | null;
};

export function ScheduleConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<ScheduleFormDraft, ScheduleConfigData>) {
  const agents = data?.agents ?? [];
  const workspaceId = data?.workspaceId ?? '';
  const schedule = data?.schedule ?? null;
  const [draft, setDraft] = useState<ScheduleFormDraft>(() =>
    schedule ? draftFrom(schedule) : emptyScheduleDraft(agents),
  );
  const canSave = draft.name.trim().length > 0 && draft.cron.trim().length > 0 && agents.length > 0;

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
        {schedule ? (
          <Field>
            <FieldLabel htmlFor="schedule-status">Status</FieldLabel>
            <Select
              items={SCHEDULE_STATUSES.map((status) => ({
                value: status,
                label: scheduleStatusLabel(status),
              }))}
              value={draft.status}
              onValueChange={(value) => {
                if (value === 'active' || value === 'paused' || value === 'failed') {
                  setDraft({ ...draft, status: value });
                }
              }}
            >
              <SelectTrigger id="schedule-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SCHEDULE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {scheduleStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="schedule-agent">Target agent</FieldLabel>
          <Select
            items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
            value={draft.targetAgentId}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setDraft({
                  ...draft,
                  targetAgentId: value,
                  threadId: schedule ? draft.threadId : '',
                });
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
            value={draft.threadId}
            onChange={(threadId) => setDraft({ ...draft, threadId })}
            currentThreadId={schedule?.threadId}
            allowDedicated={!schedule}
          />
        ) : null}
        <Field>
          <FieldLabel htmlFor="schedule-cron-raw">Cron</FieldLabel>
          <CronComposer value={draft.cron} onChange={(cron) => setDraft({ ...draft, cron })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="schedule-mode">Permission mode</FieldLabel>
          <Select
            items={PERMISSION_MODES.map((mode) => ({
              value: mode,
              label: MODE_LABELS[mode],
            }))}
            value={draft.mode}
            onValueChange={(value) => {
              if (
                value === 'ask' ||
                value === 'auto' ||
                value === 'dont_ask' ||
                value === 'bypass'
              ) {
                setDraft({ ...draft, mode: value });
              }
            }}
          >
            <SelectTrigger id="schedule-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PERMISSION_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <ScheduleHistoryFields
          history={draft.history}
          historyLast={draft.historyLast}
          onHistory={(history) => setDraft({ ...draft, history })}
          onHistoryLast={(historyLast) => setDraft({ ...draft, historyLast })}
        />
        <Field>
          <FieldLabel htmlFor="schedule-detail">Notes</FieldLabel>
          <Textarea
            id="schedule-detail"
            value={draft.detail}
            onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
            placeholder="Morning digest, nightly eval, weekend sweep…"
            className="min-h-24"
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={() => onResolve?.(draft)}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
