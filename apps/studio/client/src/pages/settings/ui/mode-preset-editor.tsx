import {
  DEFAULT_MODE_ID,
  MODE_ID_RE,
  type ModeOpGate,
  type ModePreset,
} from '@harnesys/studio-shared';
import { useState } from 'react';

import { ModeChecklist } from '@/features/manage-agent';
import { Button } from '@/shared/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import type { ModePresetDraft } from './mode-preset-draft';

type PresetGateName = 'permWrite' | 'permProcess' | 'permNetwork' | 'permMcp' | 'permAgents';

type PresetFormState = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  packs: string[];
  permWrite: ModeOpGate;
  permProcess: ModeOpGate;
  permNetwork: ModeOpGate;
  permMcp: ModeOpGate;
  permAgents: ModeOpGate;
  installedByDefault: boolean;
};

const GATES: { name: PresetGateName; label: string }[] = [
  { name: 'permWrite', label: 'File writes' },
  { name: 'permProcess', label: 'Shell' },
  { name: 'permNetwork', label: 'Network' },
  { name: 'permMcp', label: 'MCP tools' },
  { name: 'permAgents', label: 'Create agents' },
];

const FALLBACK_GATE: ModeOpGate = 'ask';
const DESCRIPTION_MAX = 200;
const INSTRUCTIONS_MAX = 6000;

function presetToForm(preset: ModePreset): PresetFormState {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description ?? '',
    instructions: preset.instructions ?? '',
    skills: [...(preset.skills ?? [])],
    packs: [...(preset.packs ?? [])],
    permWrite: preset.permissions?.['fs.write'] ?? FALLBACK_GATE,
    permProcess: preset.permissions?.process ?? FALLBACK_GATE,
    permNetwork: preset.permissions?.network ?? FALLBACK_GATE,
    permMcp: preset.permissions?.mcp ?? FALLBACK_GATE,
    permAgents: preset.permissions?.agents ?? FALLBACK_GATE,
    installedByDefault: preset.installedByDefault,
  };
}

const BLANK_FORM: PresetFormState = {
  id: '',
  name: '',
  description: '',
  instructions: '',
  skills: [],
  packs: [],
  permWrite: FALLBACK_GATE,
  permProcess: FALLBACK_GATE,
  permNetwork: FALLBACK_GATE,
  permMcp: FALLBACK_GATE,
  permAgents: FALLBACK_GATE,
  installedByDefault: false,
};

function formToDraft(state: PresetFormState): ModePresetDraft {
  const description = state.description.trim();
  const instructions = state.instructions.trim();
  return {
    id: state.id.trim(),
    name: state.name.trim(),
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    ...(state.skills.length ? { skills: state.skills } : {}),
    ...(state.packs.length ? { packs: state.packs } : {}),
    permissions: {
      'fs.write': state.permWrite,
      process: state.permProcess,
      network: state.permNetwork,
      mcp: state.permMcp,
      agents: state.permAgents,
    },
    installedByDefault: state.installedByDefault,
  };
}

function isGate(value: string): value is ModeOpGate {
  return value === 'allow' || value === 'ask' || value === 'deny';
}

function mergeNames(available: string[], selected: string[]): string[] {
  return [...selected, ...available.filter((name) => !selected.includes(name))];
}

type ModePresetEditorProps = {
  preset: ModePreset | null;
  skillNames: string[];
  packNames: string[];
  busy?: boolean;
  onSave: (draft: ModePresetDraft) => void;
  onCancel: () => void;
};

export function ModePresetEditor({
  preset,
  skillNames,
  packNames,
  busy = false,
  onSave,
  onCancel,
}: ModePresetEditorProps) {
  const contentLocked = preset?.builtin === true;
  const idLocked = preset !== null;
  const [state, setState] = useState<PresetFormState>(() =>
    preset ? presetToForm(preset) : BLANK_FORM,
  );
  const idTrimmed = state.id.trim();
  const idValid = MODE_ID_RE.test(idTrimmed) && idTrimmed !== DEFAULT_MODE_ID;
  const descriptionOver = state.description.trim().length > DESCRIPTION_MAX;
  const instructionsOver = state.instructions.length > INSTRUCTIONS_MAX;
  const canSave =
    state.name.trim().length > 0 && (idLocked || idValid) && !descriptionOver && !instructionsOver;

  function patch(next: Partial<PresetFormState>) {
    setState((current) => ({ ...current, ...next }));
  }

  function toggleIn(list: 'skills' | 'packs', name: string) {
    setState((current) => {
      const selected = current[list];
      return {
        ...current,
        [list]: selected.includes(name)
          ? selected.filter((item) => item !== name)
          : [...selected, name],
      };
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="mode-preset-editor">
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="min-w-0">
          <span className="block text-sm">Install by default</span>
          <span className="block text-[11px] text-muted-foreground">
            Adds this preset to new agents out of the box.
          </span>
        </span>
        <Switch
          checked={state.installedByDefault}
          onCheckedChange={(checked) => patch({ installedByDefault: Boolean(checked) })}
          aria-label={`Install by default: ${state.name.trim() || state.id.trim() || 'new preset'}`}
        />
      </div>
      <FieldGroup className="gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field>
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
          <ModeChecklist
            title="Skills"
            emptyHint={skillNames.length === 0 ? 'No skills in `.harnesys/skills`.' : null}
            items={mergeNames(skillNames, state.skills)}
            selected={state.skills}
            outsideAllowlist={(name) => !skillNames.includes(name)}
            onToggle={(name) => toggleIn('skills', name)}
          />
          <ModeChecklist
            title="Packs"
            emptyHint={packNames.length === 0 ? 'No packs available in this workspace.' : null}
            items={mergeNames(packNames, state.packs)}
            selected={state.packs}
            outsideAllowlist={(name) => !packNames.includes(name)}
            onToggle={(name) => toggleIn('packs', name)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {GATES.map((gate) => (
            <Field key={gate.name}>
              <FieldLabel>{gate.label}</FieldLabel>
              <ToggleGroup
                variant="segment"
                value={[state[gate.name]]}
                disabled={contentLocked}
                onValueChange={(value) => {
                  const next = value[0];
                  if (isGate(next)) {
                    patch({ [gate.name]: next });
                  }
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
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canSave || busy} onClick={() => onSave(formToDraft(state))}>
          {preset ? 'Save' : 'Create preset'}
        </Button>
      </div>
    </div>
  );
}
