import { CheckIcon, LaptopIcon, type LucideIcon, MoonIcon, SunIcon } from 'lucide-react';
import {
  UI_ACCENT_SWATCHES,
  UI_ACCENTS,
  UI_SCALE_LABELS,
  UI_SCALES,
} from '@/shared/lib/appearance';
import {
  DEFAULT_GIT_STATUS_COLORS,
  GIT_STATUS_SETTINGS_ROWS,
  GIT_STATUS_STATUSES,
  type GitStatusSettingsRow,
  gitStatusColorClass,
  useGitStatusColors,
} from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { useTheme } from '@/shared/ui/theme-provider';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

type SegmentOption = {
  value: string;
  label: string;
};

type ThemeChoice = 'dark' | 'light' | 'system';

const THEME_CHOICES: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'system', label: 'System', icon: LaptopIcon },
];

const SCALE_OPTIONS: SegmentOption[] = UI_SCALES.map((item) => ({
  value: item,
  label: UI_SCALE_LABELS[item],
}));

export function AppearancePane() {
  const { theme, setTheme, scale, setScale, accent, setAccent } = useTheme();
  const colors = useGitStatusColors((state) => state.colors);
  const resetColors = useGitStatusColors((state) => state.resetColors);

  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel>Theme</FieldLabel>
        <div data-testid="theme-select" className="grid max-w-md grid-cols-3 gap-2">
          {THEME_CHOICES.map(({ value, label, icon: Icon }) => {
            const selected = theme === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                data-testid={`theme-${value}`}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border bg-transparent p-1.5 text-left outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected ? 'border-live' : 'border-border hover:border-foreground/25',
                )}
              >
                <span className="block h-16 overflow-hidden rounded-md border border-border">
                  <ThemePreview choice={value} />
                </span>
                <span className="flex items-center gap-1.5 px-0.5 text-sm">
                  <Icon className="size-3.5 text-muted-foreground" />
                  {label}
                  {selected ? <CheckIcon className="ml-auto size-3.5 text-live" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field>
        <FieldLabel id="accent-label">Accent</FieldLabel>
        <div className="flex flex-wrap items-center gap-3 py-0.5" data-testid="accent-select">
          <div className="flex items-center gap-2">
            {UI_ACCENTS.map((id) => {
              const option = UI_ACCENT_SWATCHES[id];
              const selected = accent === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={option.label}
                  title={option.label}
                  data-testid={`accent-${id}`}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full outline-none',
                    'ring-offset-2 ring-offset-background transition-[transform,opacity,box-shadow]',
                    'focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'ring-2 ring-foreground/25'
                      : 'opacity-65 hover:scale-110 hover:opacity-100',
                  )}
                  style={{ backgroundColor: option.swatch }}
                  onClick={() => setAccent(id)}
                >
                  {selected ? (
                    <CheckIcon className="size-3" style={{ color: option.onSwatch }} />
                  ) : null}
                </button>
              );
            })}
          </div>
          <span className="text-muted-foreground text-xs">{UI_ACCENT_SWATCHES[accent].label}</span>
        </div>
      </Field>
      <Field>
        <FieldLabel id="scale-label">Scale</FieldLabel>
        <Segment
          labelId="scale-label"
          options={SCALE_OPTIONS}
          value={scale}
          testId="scale-select"
          onChange={(next) => {
            if (next === 'small' || next === 'middle' || next === 'large' || next === 'extra') {
              setScale(next);
            }
          }}
        />
      </Field>
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel id="git-colors-label">Git status colors</FieldLabel>
          <Button
            variant="ghost"
            size="xs"
            disabled={GIT_STATUS_STATUSES.every(
              (status) => colors[status] === DEFAULT_GIT_STATUS_COLORS[status],
            )}
            onClick={resetColors}
            data-testid="git-colors-reset"
          >
            Reset to defaults
          </Button>
        </div>
        <FieldDescription>
          File name colors in the sidebar explorer and the changes list.
        </FieldDescription>
        <div className="grid max-w-2xl grid-cols-1 gap-x-8 sm:grid-cols-2">
          {GIT_STATUS_SETTINGS_ROWS.map((row) => (
            <GitStatusColorRow key={row.label} row={row} />
          ))}
        </div>
      </Field>
    </FieldGroup>
  );
}

function GitStatusColorRow({ row }: { row: GitStatusSettingsRow }) {
  const colors = useGitStatusColors((state) => state.colors);
  const setColor = useGitStatusColors((state) => state.setColor);

  if (!row.status) {
    return (
      <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
        <span
          className="size-6 shrink-0 rounded border border-border opacity-40"
          style={{ backgroundColor: row.hex }}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 truncate text-muted-foreground/70 text-sm"
          title={row.label}
        >
          {row.label}
        </span>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          Coming soon
        </Badge>
      </div>
    );
  }

  const status = row.status;
  const value = colors[status];
  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-accent/50"
      title={row.label}
    >
      <input
        type="color"
        value={value}
        onChange={(event) => setColor(status, event.target.value)}
        data-testid={`git-color-${status}`}
        className="size-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
        aria-label={`${row.label} color`}
      />
      <span
        className={cn('min-w-0 flex-1 truncate text-sm', gitStatusColorClass(row.status))}
        style={{ color: value }}
      >
        {row.label}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{value}</span>
    </label>
  );
}

function ThemePreview({ choice }: { choice: ThemeChoice }) {
  if (choice === 'system') {
    return (
      <span className="flex h-full w-full">
        <span className="flex-1">
          <MiniWindow variant="light" />
        </span>
        <span className="flex-1">
          <MiniWindow variant="dark" />
        </span>
      </span>
    );
  }
  return <MiniWindow variant={choice} />;
}

function MiniWindow({ variant }: { variant: 'dark' | 'light' }) {
  const palette =
    variant === 'dark'
      ? { shell: 'bg-[#0f1114]', side: 'bg-[#16191d]', line: 'bg-[#2a2f36]' }
      : { shell: 'bg-[#f4f5f6]', side: 'bg-[#eeeff1]', line: 'bg-[#d9dce0]' };
  return (
    <span className={cn('flex h-full w-full', palette.shell)}>
      <span className={cn('w-1/3 shrink-0', palette.side)} />
      <span className="flex flex-1 flex-col gap-1 p-1.5">
        <span className={cn('h-1 w-3/4 rounded-full', palette.line)} />
        <span className={cn('h-1 w-1/2 rounded-full', palette.line)} />
        <span className="mt-auto h-1 w-2/3 rounded-full bg-live/80" />
      </span>
    </span>
  );
}

function Segment({
  labelId,
  options,
  value,
  onChange,
  testId,
}: {
  labelId: string;
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  testId?: string;
}) {
  return (
    <ToggleGroup
      aria-labelledby={labelId}
      variant="segment"
      value={[value]}
      data-testid={testId}
      onValueChange={(next) => {
        const picked = next[0];
        if (picked !== undefined) {
          onChange(picked);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
