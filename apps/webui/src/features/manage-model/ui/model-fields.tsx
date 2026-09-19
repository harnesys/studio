import type { Modality } from '@harnesys/studio-shared';
import {
  AudioLinesIcon,
  BracesIcon,
  BrainIcon,
  DatabaseIcon,
  FileIcon,
  ImageIcon,
  RadioIcon,
  TypeIcon,
  VideoIcon,
  WrenchIcon,
} from 'lucide-react';
import { type Control, Controller, type FieldPath, useWatch } from 'react-hook-form';
import { cn } from '@/shared/lib/utils';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import {
  type AddModelInput,
  type AddModelOutput,
  EFFORT_ITEMS,
  FEATURE_ITEMS,
  MODALITY_ITEMS,
  type ModelFieldsInput,
  type ModelFieldsOutput,
  toggleItem,
} from '../model/model-fields';

const MODALITY_ICONS = {
  text: TypeIcon,
  image: ImageIcon,
  audio: AudioLinesIcon,
  video: VideoIcon,
  file: FileIcon,
} as const;
const FEATURE_ICONS = {
  tools: WrenchIcon,
  structured: BracesIcon,
  streaming: RadioIcon,
  reasoning: BrainIcon,
  cache: DatabaseIcon,
} as const;
const MODALITY_ON = {
  text: 'bg-sky-500/15 text-sky-500',
  image: 'bg-emerald-500/15 text-emerald-500',
  audio: 'bg-violet-500/15 text-violet-500',
  video: 'bg-orange-500/15 text-orange-500',
  file: 'bg-slate-500/15 text-slate-500',
} as const;
export function ModelFields({
  control,
}: {
  control:
    | Control<ModelFieldsInput>
    | Control<ModelFieldsInput, unknown, ModelFieldsOutput>
    | Control<AddModelInput>
    | Control<AddModelInput, unknown, AddModelOutput>;
}) {
  const fields = control as Control<ModelFieldsInput>;
  const features = useWatch({ control: fields, name: 'features' }) ?? [];
  const hasReasoning = features.includes('reasoning');
  return (
    <>
      <Controller
        control={fields}
        name="description"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="model-description">Description</FieldLabel>
            <Textarea
              id="model-description"
              placeholder="Model description or overview"
              className="min-h-20 resize-y text-xs leading-relaxed"
              aria-invalid={fieldState.invalid || undefined}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
          </Field>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <AmountField control={fields} name="context_length" label="Context" placeholder="128000" />
        <AmountField control={fields} name="maxOutput" label="Max Output" placeholder="16384" />
      </div>
      <FieldDescription>USD / 1 token (e.g. 0.0000025)</FieldDescription>
      <div className="grid grid-cols-3 gap-4">
        <AmountField
          control={fields}
          name="cacheRead"
          label="Input (Cache Hit)"
          placeholder="0.0000005"
        />
        <AmountField control={fields} name="input" label="Input (Prompt)" placeholder="0.000002" />
        <AmountField
          control={fields}
          name="output"
          label="Output (Completion)"
          placeholder="0.000008"
        />
      </div>
      <Controller
        control={fields}
        name="modalities"
        render={({ field }) => (
          <Field>
            <FieldLabel>Modalities</FieldLabel>
            <div className="overflow-hidden rounded-lg border">
              <ModalityRow
                label="Input"
                value={field.value.input}
                onChange={(input) => field.onChange({ ...field.value, input })}
              />
              <div className="border-t" />
              <ModalityRow
                label="Output"
                value={field.value.output}
                onChange={(output) => field.onChange({ ...field.value, output })}
              />
            </div>
          </Field>
        )}
      />
      <Controller
        control={fields}
        name="features"
        render={({ field }) => (
          <Field>
            <FieldLabel>Features</FieldLabel>
            <div className="grid grid-cols-6 gap-2">
              {FEATURE_ITEMS.map((item, index) => {
                const Icon = FEATURE_ICONS[item.value];
                const on = field.value.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={on}
                    className={cn(
                      'inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs transition-colors',
                      index < 3 ? 'col-span-2' : 'col-span-3',
                      on
                        ? 'bg-live/15 text-live'
                        : 'bg-muted/80 text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground',
                    )}
                    onClick={() => field.onChange(toggleItem(field.value, item.value))}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
      />
      {hasReasoning ? (
        <Controller
          control={fields}
          name="effort"
          render={({ field }) => (
            <Field>
              <FieldLabel>Effort Levels</FieldLabel>
              <div className="grid grid-cols-4 gap-1.5">
                {EFFORT_ITEMS.map((item) => {
                  const on = field.value.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={on}
                      className={cn(
                        'inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg px-2 font-mono text-xs transition-colors',
                        on
                          ? 'bg-live/15 font-medium text-live'
                          : 'bg-muted/80 text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground',
                      )}
                      onClick={() => field.onChange(toggleItem(field.value, item.value))}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        />
      ) : null}
    </>
  );
}
function AmountField({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<ModelFieldsInput>;
  name: FieldPath<ModelFieldsInput>;
  label: string;
  placeholder?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={`model-${name}`}>{label}</FieldLabel>
          <Input
            id={`model-${name}`}
            className="font-mono"
            inputMode="decimal"
            placeholder={placeholder}
            aria-invalid={fieldState.invalid || undefined}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
          />
          {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
        </Field>
      )}
    />
  );
}
function ModalityRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Modality[];
  onChange: (next: Modality[]) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="flex items-center gap-1.5">
        {MODALITY_ITEMS.map((item) => {
          const Icon = MODALITY_ICONS[item.value];
          const on = value.includes(item.value);
          return (
            <Tooltip key={item.value}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={item.label}
                    aria-pressed={on}
                    className={cn(
                      'inline-flex size-8 items-center justify-center rounded-lg transition-colors',
                      on
                        ? MODALITY_ON[item.value]
                        : 'bg-muted/80 text-muted-foreground/45 hover:bg-muted hover:text-muted-foreground',
                    )}
                    onClick={() => onChange(toggleItem(value, item.value))}
                  />
                }
              >
                <Icon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
