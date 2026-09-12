import type { ModeOpGate, ModePreset } from '@harnesys/studio-shared';
import { MODE_ID_RE } from '@harnesys/studio-shared';
import { useState } from 'react';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import type { ModePresetDraft } from './mode-preset-draft';

type PresetGateName = 'permWrite' | 'permProcess' | 'permNetwork' | 'permMcp';

type PresetFormState = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  skillsCsv: string;
  packsCsv: string;
  permWrite: ModeOpGate;
  permProcess: ModeOpGate;
  permNetwork: ModeOpGate;
  permMcp: ModeOpGate;
  installedByDefault: boolean;
};

const GATES: { name: PresetGateName; label: string }[] = [
  { name: 'permWrite', label: 'File writes' },
  { name: 'permProcess', label: 'Shell' },
  { name: 'permNetwork', label: 'Network' },
  { name: 'permMcp', label: 'MCP' },
];

const FALLBACK_GATE: ModeOpGate = 'ask';

const DESCRIPTION_MAX = 200;
const INSTRUCTIONS_MAX = 1024;

function presetToForm(preset: ModePreset): PresetFormState {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description ?? '',
    instructions: preset.instructions ?? '',
    skillsCsv: (preset.skills ?? []).join(', '),
    packsCsv: (preset.packs ?? []).join(', '),
    permWrite: preset.permissions?.['fs.write'] ?? FALLBACK_GATE,
    permProcess: preset.permissions?.process ?? FALLBACK_GATE,
    permNetwork: preset.permissions?.network ?? FALLBACK_GATE,
    permMcp: preset.permissions?.mcp ?? FALLBACK_GATE,
    installedByDefault: preset.installedByDefault,
  };
}

function blankForm(): PresetFormState {
  return {
    id: '',
    name: '',
    description: '',
    instructions: '',
    skillsCsv: '',
    packsCsv: '',
    permWrite: FALLBACK_GATE,
    permProcess: FALLBACK_GATE,
    permNetwork: FALLBACK_GATE,
    permMcp: FALLBACK_GATE,
    installedByDefault: false,
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function formToDraft(state: PresetFormState): ModePresetDraft {
  const skills = splitCsv(state.skillsCsv);
  const packs = splitCsv(state.packsCsv);
  const description = state.description.trim();
  const instructions = state.instructions.trim();
  return {
    id: state.id.trim(),
    name: state.name.trim(),
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    ...(skills.length ? { skills } : {}),
    ...(packs.length ? { packs } : {}),
    permissions: {
      'fs.write': state.permWrite,
      process: state.permProcess,
      network: state.permNetwork,
      mcp: state.permMcp,
    },
    installedByDefault: state.installedByDefault,
  };
}

function isGate(value: string): value is ModeOpGate {
  return value === 'allow' || value === 'ask' || value === 'deny';
}

type ModePresetDialogProps = DialogComponentProps<ModePresetDraft, { preset: ModePreset }>;

export function ModePresetDialog({ onResolve, data }: ModePresetDialogProps) {
  const preset = data?.preset ?? null;
  const contentLocked = preset?.builtin === true;
  const idLocked = preset !== null;
  const [state, setState] = useState<PresetFormState>(() =>
    preset ? presetToForm(preset) : blankForm(),
  );
  const idValid = MODE_ID_RE.test(state.id.trim());
  const descriptionOver = state.description.trim().length > DESCRIPTION_MAX;
  const instructionsOver = state.instructions.length > INSTRUCTIONS_MAX;
  const canSave =
    state.name.trim().length > 0 && (idLocked || idValid) && !descriptionOver && !instructionsOver;

  function patch(next: Partial<PresetFormState>) {
    setState((current) => ({ ...current, ...next }));
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <FieldGroup className="min-h-0 gap-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!idLocked && !idValid ? true : undefined}>
            <FieldLabel htmlFor="mode-preset-name">Name</FieldLabel>
            <Input
              id="mode-preset-name"
              value={state.name}
              disabled={contentLocked}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>
          <Field data-invalid={!idLocked && !idValid ? true : undefined}>
            <FieldLabel htmlFor="mode-preset-id">Id</FieldLabel>
            <Input
              id="mode-preset-id"
              className="font-mono text-xs"
              value={state.id}
              disabled={idLocked || contentLocked}
              onChange={(event) => patch({ id: event.target.value })}
            />
          </Field>
        </div>
        <Field data-invalid={descriptionOver ? true : undefined}>
          <FieldLabel htmlFor="mode-preset-description">
            Description · {state.description.trim().length}/{DESCRIPTION_MAX}
          </FieldLabel>
          <Input
            id="mode-preset-description"
            value={state.description}
            disabled={contentLocked}
            onChange={(event) => patch({ description: event.target.value })}
          />
          {descriptionOver ? (
            <p className="text-[11px] text-destructive">Max {DESCRIPTION_MAX} characters</p>
          ) : null}
        </Field>
        <Field data-invalid={instructionsOver ? true : undefined}>
          <FieldLabel htmlFor="mode-preset-instructions">
            Instructions · {state.instructions.length}/{INSTRUCTIONS_MAX}
          </FieldLabel>
          <Textarea
            id="mode-preset-instructions"
            className="field-sizing-fixed h-24 resize-none text-xs leading-relaxed"
            value={state.instructions}
            disabled={contentLocked}
            onChange={(event) => patch({ instructions: event.target.value })}
          />
          {instructionsOver ? (
            <p className="text-[11px] text-destructive">Max {INSTRUCTIONS_MAX} characters</p>
          ) : null}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="mode-preset-skills">Skills</FieldLabel>
            <Input
              id="mode-preset-skills"
              placeholder="comma, separated, names"
              value={state.skillsCsv}
              disabled={contentLocked}
              onChange={(event) => patch({ skillsCsv: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="mode-preset-packs">Packs</FieldLabel>
            <Input
              id="mode-preset-packs"
              placeholder="comma, separated, names"
              value={state.packsCsv}
              disabled={contentLocked}
              onChange={(event) => patch({ packsCsv: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {GATES.map((gate) => (
            <Field key={gate.name}>
              <FieldLabel>{gate.label}</FieldLabel>
              <ToggleGroup
                variant="outline"
                spacing={0}
                value={[state[gate.name]]}
                disabled={contentLocked}
                onValueChange={(value) => {
                  const next = value[0];
                  if (!isGate(next)) {
                    return;
                  }
                  setState((current) => ({ ...current, [gate.name]: next }));
                }}
              >
                <ToggleGroupItem value="allow">Allow</ToggleGroupItem>
                <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
                <ToggleGroupItem value="deny">Deny</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          ))}
        </div>
        {contentLocked ? (
          <p className="text-[11px] text-muted-foreground">
            Built-in preset: content is read-only. Only the default-install switch can change.
          </p>
        ) : null}
      </FieldGroup>
      <div className="flex items-center gap-2">
        <Switch
          size="sm"
          checked={state.installedByDefault}
          onCheckedChange={(checked) => patch({ installedByDefault: Boolean(checked) })}
        />
        <span className="text-sm">Install by default</span>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={() => onResolve?.(formToDraft(state))}>
          {preset ? 'Save' : 'Create preset'}
        </Button>
      </DialogFooter>
    </div>
  );
}
