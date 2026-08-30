import { useMemo } from 'react';

import { cn } from '@/shared/lib/utils';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import {
  CRON_PRESETS,
  type CronComposerOptions,
  type CronPreset,
  cronFromPreset,
  defaultCronOptions,
  detectPreset,
  humanizeCron,
  normalizeCron,
  optionsFromParts,
  parseCron,
  WEEKDAY_OPTIONS,
} from '../model/cron-composer';

type CronComposerProps = {
  value: string;
  onChange: (cron: string) => void;
  hint?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function CronComposer({ value, onChange, hint }: CronComposerProps) {
  const parsed = useMemo(() => parseCron(value), [value]);
  const preset = parsed ? detectPreset(parsed) : 'custom';
  const options = parsed ? optionsFromParts(parsed) : defaultCronOptions();
  const summary = humanizeCron(value);
  const rawInvalid = value.trim().length > 0 && normalizeCron(value) === null;
  let rawDescription = summary;
  if (rawInvalid) {
    rawDescription = 'Need 5 or 6 space-separated cron fields.';
  } else if (hint) {
    rawDescription = `${summary} · ${hint}`;
  }

  function applyPreset(next: CronPreset) {
    if (next === 'custom') {
      return;
    }
    onChange(cronFromPreset(next, options));
  }

  function patchOptions(patch: Partial<CronComposerOptions>) {
    const nextOptions = { ...options, ...patch };
    const nextPreset = preset === 'custom' ? 'daily' : preset;
    onChange(cronFromPreset(nextPreset, nextOptions));
  }

  return (
    <div className="flex flex-col gap-3" data-testid="cron-composer">
      <ToggleGroup
        variant="outline"
        spacing={0}
        className="flex w-full flex-wrap"
        value={[preset]}
        onValueChange={(selected) => {
          const next = selected[0];
          if (
            next === 'every-minute' ||
            next === 'hourly' ||
            next === 'daily' ||
            next === 'weekdays' ||
            next === 'weekly' ||
            next === 'monthly' ||
            next === 'custom'
          ) {
            applyPreset(next);
          }
        }}
      >
        {CRON_PRESETS.filter((item) => item.value !== 'custom').map((item) => (
          <ToggleGroupItem key={item.value} value={item.value} className="min-w-[5.5rem] flex-1">
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {preset !== 'every-minute' && preset !== 'custom' ? (
        <div className="flex flex-wrap items-end gap-2">
          {preset === 'weekly' ? (
            <Field className="min-w-[8rem] flex-1">
              <FieldLabel htmlFor="cron-weekday">Day</FieldLabel>
              <Select
                items={WEEKDAY_OPTIONS.map((day) => ({
                  value: String(day.value),
                  label: day.label,
                }))}
                value={String(options.dayOfWeek)}
                onValueChange={(next) => {
                  if (typeof next === 'string') {
                    patchOptions({ dayOfWeek: Number(next) });
                  }
                }}
              >
                <SelectTrigger id="cron-weekday" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {WEEKDAY_OPTIONS.map((day) => (
                      <SelectItem key={day.value} value={String(day.value)}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {preset === 'monthly' ? (
            <Field className="min-w-[7rem] flex-1">
              <FieldLabel htmlFor="cron-dom">Day of month</FieldLabel>
              <Select
                items={MONTH_DAYS.map((day) => ({ value: String(day), label: String(day) }))}
                value={String(options.dayOfMonth)}
                onValueChange={(next) => {
                  if (typeof next === 'string') {
                    patchOptions({ dayOfMonth: Number(next) });
                  }
                }}
              >
                <SelectTrigger id="cron-dom" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MONTH_DAYS.map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {preset === 'hourly' ? (
            <Field className="min-w-[7rem] flex-1">
              <FieldLabel htmlFor="cron-minute">At minute</FieldLabel>
              <Select
                items={MINUTES.map((minute) => ({
                  value: String(minute),
                  label: String(minute).padStart(2, '0'),
                }))}
                value={String(options.minute)}
                onValueChange={(next) => {
                  if (typeof next === 'string') {
                    patchOptions({ minute: Number(next) });
                  }
                }}
              >
                <SelectTrigger id="cron-minute" className="w-full font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MINUTES.map((minute) => (
                      <SelectItem key={minute} value={String(minute)}>
                        {String(minute).padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <>
              <Field className="min-w-[6.5rem] flex-1">
                <FieldLabel htmlFor="cron-hour">Hour</FieldLabel>
                <Select
                  items={HOURS.map((hour) => ({
                    value: String(hour),
                    label: String(hour).padStart(2, '0'),
                  }))}
                  value={String(options.hour)}
                  onValueChange={(next) => {
                    if (typeof next === 'string') {
                      patchOptions({ hour: Number(next) });
                    }
                  }}
                >
                  <SelectTrigger id="cron-hour" className="w-full font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour} value={String(hour)}>
                          {String(hour).padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="min-w-[6.5rem] flex-1">
                <FieldLabel htmlFor="cron-minute">Minute</FieldLabel>
                <Select
                  items={MINUTES.map((minute) => ({
                    value: String(minute),
                    label: String(minute).padStart(2, '0'),
                  }))}
                  value={String(options.minute)}
                  onValueChange={(next) => {
                    if (typeof next === 'string') {
                      patchOptions({ minute: Number(next) });
                    }
                  }}
                >
                  <SelectTrigger id="cron-minute" className="w-full font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MINUTES.map((minute) => (
                        <SelectItem key={minute} value={String(minute)}>
                          {String(minute).padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
        </div>
      ) : null}

      {preset === 'custom' ? (
        <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground leading-relaxed">
          This expression is outside the presets. Edit the raw field below, or pick a preset to
          rebuild it.
        </p>
      ) : null}

      <Field data-invalid={rawInvalid || undefined}>
        <FieldLabel htmlFor="schedule-cron-raw">Raw expression</FieldLabel>
        <Input
          id="schedule-cron-raw"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          aria-invalid={rawInvalid || undefined}
          className={cn('font-mono text-[13px]', rawInvalid && 'border-destructive')}
          placeholder="0 0 9 * * 1-5"
        />
        <FieldDescription>{rawDescription}</FieldDescription>
      </Field>
    </div>
  );
}
