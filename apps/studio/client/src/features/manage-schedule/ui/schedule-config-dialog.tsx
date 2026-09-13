import { type AgentMode, DEFAULT_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { SCHEDULE_STATUSES, type Schedule, scheduleStatusLabel } from '@/entities/schedule';
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
import { draftFrom, emptyScheduleDraft, type ScheduleFormDraft } from '../model/schedule-draft';
import { CronComposer } from './cron-composer';
import { ScheduleHistoryFields } from './schedule-history-fields';
import { ScheduleThreadField } from './schedule-thread-field';

type AgentModesLike = {
  modes?: AgentMode[];
  defaultModeId?: string | null;
};

function hasAgentModes(agent: Agent): agent is Agent & AgentModesLike {
  return 'modes' in agent;
}

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
  const [draft, setDraft] = useState<ScheduleFormDraft>(() => {
    if (schedule) {
      return draftFrom(schedule);
    }
    const base = emptyScheduleDraft(agents);
    const first = agents.find((item) => item.id === base.targetAgentId);
    const defaultModeId = first !== undefined && hasAgentModes(first) ? first.defaultModeId : null;
    return { ...base, modeId: defaultModeId ?? DEFAULT_MODE_ID };
  });
  const agent = agents.find((item) => item.id === draft.targetAgentId);
  const agentModes = agent !== undefined && hasAgentModes(agent) ? (agent.modes ?? []) : [];
  const modeItems = [
    { value: DEFAULT_MODE_ID, label: DEFAULT_MODE.name },
    ...agentModes.map((mode) => ({ value: mode.id, label: mode.name })),
  ];
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
                const next = agents.find((item) => item.id === value);
                const defaultModeId =
                  next !== undefined && hasAgentModes(next) ? next.defaultModeId : null;
                setDraft({
                  ...draft,
                  targetAgentId: value,
                  threadId: schedule ? draft.threadId : '',
                  modeId: defaultModeId ?? DEFAULT_MODE_ID,
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
          <FieldLabel htmlFor="schedule-mode">Mode</FieldLabel>
          <Select
            items={modeItems}
            value={draft.modeId}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setDraft({ ...draft, modeId: value });
              }
            }}
          >
            <SelectTrigger id="schedule-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {modeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
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
