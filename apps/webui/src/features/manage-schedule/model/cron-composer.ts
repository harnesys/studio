export type CronParts = {
  second: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
};
export type CronPreset =
  | 'every-minute'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom';
export type CronComposerOptions = {
  minute: number;
  hour: number;
  dayOfMonth: number;
  dayOfWeek: number;
};
export const CRON_PRESETS: ReadonlyArray<{
  value: CronPreset;
  label: string;
}> = [
  { value: 'every-minute', label: 'Every minute' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];
export const WEEKDAY_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
  short: string;
}> = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];
const FIELD = /^(\*|[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*)(?:\/[0-9]+)?$/;
export function defaultCronOptions(): CronComposerOptions {
  return { minute: 0, hour: 9, dayOfMonth: 1, dayOfWeek: 1 };
}
export function parseCron(expr: string): CronParts | null {
  const tokens = expr.trim().split(/\s+/).filter(Boolean);
  let fields: string[];
  if (tokens.length === 5) {
    fields = ['0', ...tokens];
  } else if (tokens.length === 6) {
    fields = tokens;
  } else {
    return null;
  }
  const [second, minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (
    second === undefined ||
    minute === undefined ||
    hour === undefined ||
    dayOfMonth === undefined ||
    month === undefined ||
    dayOfWeek === undefined ||
    ![second, minute, hour, dayOfMonth, month, dayOfWeek].every((field) => FIELD.test(field))
  ) {
    return null;
  }
  return { second, minute, hour, dayOfMonth, month, dayOfWeek };
}
export function formatCron(parts: CronParts): string {
  return [
    parts.second,
    parts.minute,
    parts.hour,
    parts.dayOfMonth,
    parts.month,
    parts.dayOfWeek,
  ].join(' ');
}
export function normalizeCron(expr: string): string | null {
  const parts = parseCron(expr);
  return parts ? formatCron(parts) : null;
}
export function detectPreset(parts: CronParts): CronPreset {
  if (parts.month !== '*') {
    return 'custom';
  }
  if (
    parts.second === '0' &&
    parts.minute === '*' &&
    parts.hour === '*' &&
    parts.dayOfMonth === '*' &&
    parts.dayOfWeek === '*'
  ) {
    return 'every-minute';
  }
  if (
    parts.second === '0' &&
    isNumber(parts.minute) &&
    parts.hour === '*' &&
    parts.dayOfMonth === '*' &&
    parts.dayOfWeek === '*'
  ) {
    return 'hourly';
  }
  if (
    parts.second === '0' &&
    isNumber(parts.minute) &&
    isNumber(parts.hour) &&
    parts.dayOfMonth === '*' &&
    parts.dayOfWeek === '*'
  ) {
    return 'daily';
  }
  if (
    parts.second === '0' &&
    isNumber(parts.minute) &&
    isNumber(parts.hour) &&
    parts.dayOfMonth === '*' &&
    (parts.dayOfWeek === '1-5' || parts.dayOfWeek === 'MON-FRI')
  ) {
    return 'weekdays';
  }
  if (
    parts.second === '0' &&
    isNumber(parts.minute) &&
    isNumber(parts.hour) &&
    parts.dayOfMonth === '*' &&
    isNumber(parts.dayOfWeek)
  ) {
    return 'weekly';
  }
  if (
    parts.second === '0' &&
    isNumber(parts.minute) &&
    isNumber(parts.hour) &&
    isNumber(parts.dayOfMonth) &&
    parts.dayOfWeek === '*'
  ) {
    return 'monthly';
  }
  return 'custom';
}
export function optionsFromParts(parts: CronParts): CronComposerOptions {
  return {
    minute: clampInt(parts.minute, 0, 59, 0),
    hour: clampInt(parts.hour, 0, 23, 9),
    dayOfMonth: clampInt(parts.dayOfMonth, 1, 31, 1),
    dayOfWeek: clampInt(parts.dayOfWeek, 0, 6, 1),
  };
}
export function cronFromPreset(preset: CronPreset, options: CronComposerOptions): string {
  const minute = String(clamp(options.minute, 0, 59));
  const hour = String(clamp(options.hour, 0, 23));
  const dayOfMonth = String(clamp(options.dayOfMonth, 1, 31));
  const dayOfWeek = String(clamp(options.dayOfWeek, 0, 6));
  switch (preset) {
    case 'every-minute':
      return '0 * * * * *';
    case 'hourly':
      return `0 ${minute} * * * *`;
    case 'daily':
      return `0 ${minute} ${hour} * * *`;
    case 'weekdays':
      return `0 ${minute} ${hour} * * 1-5`;
    case 'weekly':
      return `0 ${minute} ${hour} * * ${dayOfWeek}`;
    case 'monthly':
      return `0 ${minute} ${hour} ${dayOfMonth} * *`;
    case 'custom':
      return `0 ${minute} ${hour} * * *`;
  }
}
export function humanizeCron(expr: string): string {
  const parts = parseCron(expr);
  if (!parts) {
    return 'Unrecognized cron expression';
  }
  const preset = detectPreset(parts);
  const opts = optionsFromParts(parts);
  const time = formatClock(opts.hour, opts.minute, parts.second === '0' ? null : parts.second);
  switch (preset) {
    case 'every-minute':
      return 'Every minute';
    case 'hourly':
      return opts.minute === 0 ? 'Every hour' : `Every hour at minute ${pad(opts.minute)}`;
    case 'daily':
      return `Every day at ${time}`;
    case 'weekdays':
      return `Weekdays at ${time}`;
    case 'weekly': {
      const day = WEEKDAY_OPTIONS.find((item) => item.value === opts.dayOfWeek)?.label ?? 'day';
      return `Every ${day} at ${time}`;
    }
    case 'monthly':
      return `Monthly on day ${opts.dayOfMonth} at ${time}`;
    case 'custom':
      return `Custom · ${formatCron(parts)}`;
  }
}
function isNumber(value: string): boolean {
  return /^\d+$/.test(value);
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
function clampInt(raw: string, min: number, max: number, fallback: number): number {
  if (!isNumber(raw)) {
    return fallback;
  }
  return clamp(Number(raw), min, max);
}
function pad(value: number): string {
  return String(value).padStart(2, '0');
}
function formatClock(hour: number, minute: number, second: string | null): string {
  const base = `${pad(hour)}:${pad(minute)}`;
  return second === null ? base : `${base}:${second.padStart(2, '0')}`;
}
