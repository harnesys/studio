import type { AgentCapabilitiesView, ModeOp, ModeOpGate } from '@harnesys/studio-shared';
import type { PermissionGate, PermissionMap, ToolExposure } from 'harnesys';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import { RowList } from '@/shared/ui/capability-rows';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import { MODE_INSTRUCTIONS_MAX } from '../model/agent-mode-fields';
import {
  CORE_SOURCE,
  expandEmptyPreload,
  isSourceGranted,
  type PackAssignmentMap,
  setSourceGrant,
  sourceToolRows,
  withDisabledTool,
  withToolExposure,
} from '../model/draft-overrides';
import { AgentSourceCard } from './agent-source-card';

type AgentModeEditorProps = {
  form: UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;
  index: number;
  skillNames: string[];
  agentSkills: string[];
  packNames: string[];
  capabilitiesView: AgentCapabilitiesView | undefined;
  isDefault: boolean;
  onSetDefault: (next: boolean) => void;
  base: PermissionMap | null;
};

const GATES: {
  name: 'permWrite' | 'permProcess' | 'permNetwork' | 'permMcp' | 'permAgents';
  label: string;
  op: ModeOp;
}[] = [
  { name: 'permWrite', label: 'File writes', op: 'fs.write' },
  { name: 'permProcess', label: 'Shell', op: 'process' },
  { name: 'permNetwork', label: 'Network', op: 'network' },
  { name: 'permMcp', label: 'MCP tools', op: 'mcp' },
  { name: 'permAgents', label: 'Create agents', op: 'agents' },
];

const GATE_SEVERITY: Record<PermissionGate, number> = { allow: 0, ask: 1, deny: 2 };
const GATE_VALUES: PermissionGate[] = ['allow', 'ask', 'deny'];

/** A mode gate may only match or exceed the agent base gate, never loosen it. */
function allowedGates(baseGate: PermissionGate): PermissionGate[] {
  return GATE_VALUES.filter((gate) => GATE_SEVERITY[gate] >= GATE_SEVERITY[baseGate]);
}

/** Absent base op follows DEFAULT_PERMISSIONS: every gated mode op defaults to 'ask'. */
function baseGateFor(base: PermissionMap | null, op: ModeOp): PermissionGate {
  return base?.[op] ?? 'ask';
}

export function AgentModeEditor({
  form,
  index,
  skillNames,
  agentSkills,
  packNames,
  capabilitiesView,
  isDefault,
  onSetDefault,
  base,
}: AgentModeEditorProps) {
  const mode = useWatch({ control: form.control, name: `modes.${index}` });
  const selectedSkills = mode?.skills ?? [];
  // Map-форма: `mode.packs` — preload-подмножество (пустая карта = preload всего
  // агентского набора); per-tool сужение — плоские `mode.disabledTools`/`mode.exposure`
  // (тот же PackOverride-формат, который применяет резолвер).
  const modePacks = (mode?.packs ?? {}) as PackAssignmentMap;
  const preloadEmpty = Object.keys(modePacks).length === 0;
  const modeOverride = {
    disabledTools: mode?.disabledTools ?? [],
    exposure: mode?.exposure ?? {},
  };
  const instructions = form.watch(`modes.${index}.instructions`) ?? '';
  const instructionsError = form.formState.errors.modes?.[index]?.instructions?.message;

  function toggleSkills(skillName: string) {
    const next = selectedSkills.includes(skillName)
      ? selectedSkills.filter((item) => item !== skillName)
      : [...selectedSkills, skillName];
    form.setValue(`modes.${index}.skills`, next, { shouldDirty: true });
  }

  function setModePacks(next: PackAssignmentMap) {
    form.setValue(`modes.${index}.packs`, next, { shouldDirty: true });
  }

  function toggleModeGrant(packName: string, next: boolean) {
    setModePacks(setSourceGrant(expandEmptyPreload(modePacks, packNames), packName, next));
  }

  function toggleModeTool(tool: string, disable: boolean) {
    const next = withDisabledTool(modeOverride, tool, disable).disabledTools ?? [];
    form.setValue(`modes.${index}.disabledTools`, next, { shouldDirty: true });
  }

  function setModeExposure(tool: string, exposure: ToolExposure) {
    const next = withToolExposure(modeOverride, tool, exposure).exposure ?? {};
    form.setValue(`modes.${index}.exposure`, next, { shouldDirty: true });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="agent-mode-editor">
      <div className="flex items-center justify-between gap-3 py-2">
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
      <section className="flex flex-col gap-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Packs
        </p>
        {packNames.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No packs enabled for this agent in Capabilities.
          </p>
        ) : null}
        <RowList>
          {packNames.map((packName) => {
            const isCore = packName === CORE_SOURCE;
            const granted = isCore || preloadEmpty || isSourceGranted(modePacks[packName]);
            return (
              <AgentSourceCard
                key={packName}
                kind="pack"
                name={packName}
                granted={granted}
                locked={isCore}
                lockLabel={isCore ? 'обязателен' : undefined}
                tools={sourceToolRows(capabilitiesView, `pack:${packName}`, modeOverride)}
                toolsHint="Save the agent to tune per-tool overrides."
                onToggleGrant={(next) => toggleModeGrant(packName, next)}
                onToggleTool={toggleModeTool}
                onExposure={setModeExposure}
              />
            );
          })}
        </RowList>
      </section>
      <p className="-mt-2 text-[11px] text-muted-foreground leading-snug">
        Empty selection keeps every agent pack in context.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {GATES.map((gate) => {
          const baseGate = baseGateFor(base, gate.op);
          const allowed = allowedGates(baseGate);
          return (
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
                      if (isGate(next) && allowed.includes(next)) {
                        field.onChange(next);
                      }
                    }}
                  >
                    <ToggleGroupItem value="allow" disabled={!allowed.includes('allow')}>
                      Allow
                    </ToggleGroupItem>
                    <ToggleGroupItem value="ask" disabled={!allowed.includes('ask')}>
                      Ask
                    </ToggleGroupItem>
                    <ToggleGroupItem value="deny" disabled={!allowed.includes('deny')}>
                      Deny
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <p className="text-[11px] text-muted-foreground">Max: {baseGate} (agent base)</p>
                </Field>
              )}
            />
          );
        })}
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

export { Checklist as ModeChecklist };
