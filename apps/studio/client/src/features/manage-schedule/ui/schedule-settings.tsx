import { CalendarClockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAgentStore } from '@/entities/agent';
import {
  PERMISSION_MODES,
  SCHEDULE_STATUSES,
  type Schedule,
  scheduleInk,
  scheduleStatusLabel,
  scheduleStatusTone,
} from '@/entities/schedule';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
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
import { StatusDot } from '@/shared/ui/status-dot';
import { Textarea } from '@/shared/ui/textarea';
import { humanizeCron } from '../model/cron-composer';
import { draftFrom, isDirty, MODE_LABELS } from '../model/schedule-draft';
import { updateSchedule } from '../model/update-schedule';
import { CronComposer } from './cron-composer';

import { MetaChip, SectionLabel } from './schedule-chrome';
import { ScheduleHistoryFields } from './schedule-history-fields';
import { ScheduleThreadField } from './schedule-thread-field';

export function ScheduleSettings({ schedule: item }: { schedule: Schedule }) {
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((agent) => agent.workspaceId === item.workspaceId)),
  );
  const [draft, setDraft] = useState(() => draftFrom(item));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = isDirty(item, draft);
  const targetAgent = agents.find((agent) => agent.id === draft.targetAgentId);
  const statusTone = scheduleStatusTone(draft.status);

  useEffect(() => {
    setDraft(draftFrom(item));
    setSaved(false);
    setSaving(false);
  }, [item]);

  const nextHint = item.nextRunAt ? `Next run ${formatDayTime(item.nextRunAt)}` : undefined;

  return (
    <div className="relative flex w-full flex-col" data-testid={`schedule-settings-${item.id}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_20%_0%,color-mix(in_oklab,var(--live)_14%,transparent),transparent_55%)]"
      />

      <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-8">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <StatusDot tone={statusTone} />
            <p
              className={cn(
                'font-mono text-[11px] uppercase tracking-[0.2em]',
                scheduleInk(draft.status),
              )}
            >
              {scheduleStatusLabel(draft.status)}
            </p>
          </div>

          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/70 text-live shadow-[0_0_0_1px_color-mix(in_oklab,var(--live)_12%,transparent)]">
              <CalendarClockIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-medium text-[1.45rem] leading-none tracking-tight">
                {draft.name.trim() || item.name}
              </h1>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                {humanizeCron(draft.cron)}
                {targetAgent ? ` · ${targetAgent.name}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <MetaChip label="Cron" value={draft.cron.trim() || '—'} mono />
                {item.nextRunAt ? (
                  <MetaChip label="Next" value={formatDayTime(item.nextRunAt)} />
                ) : (
                  <MetaChip label="Next" value="Not scheduled" />
                )}
                {item.lastFiredAt ? (
                  <MetaChip label="Last" value={formatDayTime(item.lastFiredAt)} />
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <SectionLabel>Identity</SectionLabel>
          <div className="rounded-xl border border-border/80 bg-background/60 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,white_4%,transparent)]">
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="schedule-name">Name</FieldLabel>
                <Input
                  id="schedule-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <Field>
                  <FieldLabel htmlFor="schedule-agent">Target agent</FieldLabel>
                  <Select
                    items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                    value={draft.targetAgentId}
                    onValueChange={(value) => {
                      if (typeof value === 'string') {
                        setDraft({ ...draft, targetAgentId: value });
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
                <div className="sm:col-span-2">
                  <ScheduleThreadField
                    workspaceId={item.workspaceId}
                    agentId={draft.targetAgentId}
                    value={draft.threadId}
                    onChange={(threadId) => {
                      if (threadId) {
                        setDraft({ ...draft, threadId });
                      }
                    }}
                    currentThreadId={item.threadId}
                    allowDedicated={false}
                  />
                </div>
                <Field className="sm:col-span-2">
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
              </div>
            </FieldGroup>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>Timing</SectionLabel>
          <div className="rounded-xl border border-border/80 bg-background/60 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,white_4%,transparent)]">
            <CronComposer
              value={draft.cron}
              onChange={(cron) => setDraft({ ...draft, cron })}
              hint={nextHint}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>Model</SectionLabel>
          <div className="rounded-xl border border-border/80 bg-background/60 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,white_4%,transparent)]">
            <ScheduleHistoryFields
              history={draft.history}
              historyLast={draft.historyLast}
              onHistory={(history) => setDraft({ ...draft, history })}
              onHistoryLast={(historyLast) => setDraft({ ...draft, historyLast })}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>Notes</SectionLabel>
          <div className="rounded-xl border border-border/80 bg-background/60 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,white_4%,transparent)]">
            <Field>
              <FieldLabel htmlFor="schedule-detail">What this schedule is for</FieldLabel>
              <Textarea
                id="schedule-detail"
                value={draft.detail}
                onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
                placeholder="Morning digest, nightly eval, weekend sweep…"
                className="min-h-24"
              />
            </Field>
          </div>
        </section>

        <div className="flex items-center gap-3 pb-4">
          <Button
            disabled={
              saving || !dirty || draft.name.trim().length === 0 || draft.cron.trim().length === 0
            }
            onClick={() => {
              void (async () => {
                setSaving(true);
                try {
                  const updated = await updateSchedule(item.workspaceId, item.id, draft);
                  if (updated) {
                    setSaved(true);
                  }
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? 'Saving…' : 'Save schedule'}
          </Button>
          {saved && !dirty && (
            <span className="font-mono text-[11px] text-muted-foreground tracking-wide">Saved</span>
          )}
          {dirty && (
            <span className="font-mono text-[11px] text-live/80 tracking-wide">Unsaved</span>
          )}
        </div>
      </div>
    </div>
  );
}
