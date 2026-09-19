import type { GrantClass, PluginGrantSelection } from '@harnesys/studio-shared';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  GRANT_CLASS_DESCRIPTIONS,
  GRANT_CLASS_LIST,
  grantCheckboxState,
  toggleGrantClass,
} from '../model/plugin-grants';

export function PluginGrantCheckboxes({
  selection,
  disabled,
  onChange,
}: {
  selection: PluginGrantSelection;
  disabled?: boolean;
  onChange: (next: PluginGrantSelection) => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="plugin-grant-checkboxes">
      {GRANT_CLASS_LIST.map((grantClass) => (
        <GrantRow
          key={grantClass}
          grantClass={grantClass}
          selection={selection}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function GrantRow({
  grantClass,
  selection,
  disabled,
  onChange,
}: {
  grantClass: GrantClass;
  selection: PluginGrantSelection;
  disabled?: boolean;
  onChange: (next: PluginGrantSelection) => void;
}) {
  const state = grantCheckboxState(selection, grantClass);
  return (
    <div className="flex items-start gap-2 rounded-md px-1 py-0.5">
      <Checkbox
        className="mt-0.5"
        checked={state === true}
        indeterminate={state === 'indeterminate'}
        disabled={disabled}
        onCheckedChange={(next) => onChange(toggleGrantClass(selection, grantClass, Boolean(next)))}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-xs">{grantClass}</span>
        <span className="text-[11px] text-muted-foreground">
          {GRANT_CLASS_DESCRIPTIONS[grantClass]}
        </span>
      </span>
    </div>
  );
}
