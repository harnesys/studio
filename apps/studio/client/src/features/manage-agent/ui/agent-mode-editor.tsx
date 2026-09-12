import type { ModeOpGate } from '@harnesys/studio-shared';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import { MODE_INSTRUCTIONS_MAX } from '../model/agent-mode-fields';

type AgentModeEditorProps = {
  form: UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;
  index: number;
  skillNames: string[];
  agentSkills: string[];
  packNames: string[];
  isDefault: boolean;
  onSetDefault: (next: boolean) => void;
};

const GATES: { name: 'permWrite' | 'permProcess' | 'permNetwork' | 'permMcp'; label: string }[] = [
  { name: 'permWrite', label: 'File writes' },
  { name: 'permProcess', label: 'Shell' },
  { name: 'permNetwork', label: 'Network' },
  { name: 'permMcp', label: 'MCP' },
];

export function AgentModeEditor({
  form,
  index,
  skillNames,
  agentSkills,
  packNames,
  isDefault,
  onSetDefault,
}: AgentModeEditorProps) {
  const mode = useWatch({ control: form.control, name: `modes.${index}` });
  const selectedSkills = mode?.skills ?? [];
  const selectedPacks = mode?.packs ?? [];
  const instructions = form.watch(`modes.${index}.instructions`) ?? '';
  const instructionsError = form.formState.errors.modes?.[index]?.instructions?.message;

  function toggleSkills(skillName: string) {
    const next = selectedSkills.includes(skillName)
      ? selectedSkills.filter((item) => item !== skillName)
      : [...selectedSkills, skillName];
    form.setValue(`modes.${index}.skills`, next, { shouldDirty: true });
  }

  function togglePacks(packName: string) {
    const next = selectedPacks.includes(packName)
      ? selectedPacks.filter((item) => item !== packName)
      : [...selectedPacks, packName];
    form.setValue(`modes.${index}.packs`, next, { shouldDirty: true });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="agent-mode-editor">
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <span className="min-w-0">
          <span className="block text-sm">Make Default</span>
          <span className="block text-[11px] text-muted-foreground">
            Runs when a thread starts without a chosen mode.
          </span>
        </span>
        <Switch
          checked={isDefault}
          onCheckedChange={(value) => onSetDefault(Boolean(value))}
          aria-label={`Make default: ${mode?.name || mode?.id || `mode ${index + 1}`}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`mode-name-${index}`}>Name</FieldLabel>
          <Input id={`mode-name-${index}`} {...form.register(`modes.${index}.name`)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`mode-id-${index}`}>Id</FieldLabel>
          <Input
            id={`mode-id-${index}`}
            className="font-mono text-xs"
            {...form.register(`modes.${index}.id`)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`mode-description-${index}`}>Description</FieldLabel>
        <Input id={`mode-description-${index}`} {...form.register(`modes.${index}.description`)} />
      </Field>
      <Field data-invalid={instructionsError ? true : undefined}>
        <FieldLabel htmlFor={`mode-instructions-${index}`}>
          Instructions · {instructions.length}/{MODE_INSTRUCTIONS_MAX}
        </FieldLabel>
        <Textarea
          id={`mode-instructions-${index}`}
          className="field-sizing-fixed h-24 resize-none text-xs leading-relaxed"
          {...form.register(`modes.${index}.instructions`)}
        />
        {instructionsError ? (
          <p className="text-[11px] text-destructive">{instructionsError}</p>
        ) : null}
      </Field>
      <Checklist
        title="Skills"
        emptyHint={skillNames.length === 0 ? 'No skills in `.harnesys/skills`.' : null}
        items={skillNames}
        selected={selectedSkills}
        outsideAllowlist={(name) => agentSkills.length > 0 && !agentSkills.includes(name)}
        onToggle={toggleSkills}
      />
      <Checklist
        title="Packs"
        emptyHint={
          packNames.length === 0 ? 'No packs enabled for this agent in Capabilities.' : null
        }
        items={packNames}
        selected={selectedPacks}
        outsideAllowlist={() => false}
        onToggle={togglePacks}
      />
      <p className="-mt-2 text-[11px] text-muted-foreground leading-snug">
        Empty selection keeps every agent pack in context.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {GATES.map((gate) => (
          <Controller
            key={gate.name}
            control={form.control}
            name={`modes.${index}.${gate.name}`}
            render={({ field }) => (
              <Field>
                <FieldLabel>{gate.label}</FieldLabel>
                <ToggleGroup
                  variant="segment"
                  value={[field.value]}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (isGate(next)) {
                      field.onChange(next);
                    }
                  }}
                >
                  <ToggleGroupItem value="allow">Allow</ToggleGroupItem>
                  <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
                  <ToggleGroupItem value="deny">Deny</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Checklist({
  title,
  emptyHint,
  items,
  selected,
  outsideAllowlist,
  onToggle,
}: {
  title: string;
  emptyHint: string | null;
  items: string[];
  selected: string[];
  outsideAllowlist: (name: string) => boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <section className="flex flex-col gap-1">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      {emptyHint ? <p className="text-[11px] text-muted-foreground">{emptyHint}</p> : null}
      {items.map((name) => {
        const outside = outsideAllowlist(name);
        return (
          <div key={name} className="flex items-center gap-2 py-0.5">
            <Checkbox
              checked={selected.includes(name)}
              onCheckedChange={() => onToggle(name)}
              aria-label={`Mode ${title.toLowerCase()}: ${name}`}
            />
            <span className="min-w-0 truncate text-sm">{name}</span>
            {outside ? (
              <span className="shrink-0 rounded border border-border/60 px-1 text-[10px] text-muted-foreground">
                outside agent allowlist
              </span>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function isGate(value: string): value is ModeOpGate {
  return value === 'allow' || value === 'ask' || value === 'deny';
}
