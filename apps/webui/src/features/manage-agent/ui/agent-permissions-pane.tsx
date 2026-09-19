import type { ModeOp } from '@harnesys/studio-shared';
import type { PermissionGate, PermissionMap } from 'harnesys';
import { Pane, RowList } from '@/shared/ui/capability-rows';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { PERM_OPS } from '../model/agent-permissions';

type PermissionRowSpec = {
  op: ModeOp;
  label: string;
  description: string;
};
const PERMISSION_ROWS: PermissionRowSpec[] = [
  { op: 'fs.write', label: 'File writes', description: 'Create and edit files in the workspace' },
  { op: 'process', label: 'Shell', description: 'Run commands on the machine' },
  { op: 'network', label: 'Network', description: 'Fetch pages and call APIs' },
  { op: 'mcp', label: 'MCP tools', description: 'Tools from connected MCP servers' },
  {
    op: 'agents',
    label: 'Create agents',
    description: 'Add agents and subagents to the workspace',
  },
];
type AgentPermissionsPaneProps = {
  value: PermissionMap | null;
  onChange: (next: PermissionMap) => void;
  isDelegate: boolean;
};
export function AgentPermissionsPane({ value, onChange, isDelegate }: AgentPermissionsPaneProps) {
  const rows = isDelegate
    ? PERMISSION_ROWS.filter((row) => PERM_OPS.includes(row.op))
    : PERMISSION_ROWS;
  const current = (op: ModeOp): PermissionGate => value?.[op] ?? 'ask';
  return (
    <Pane
      testId="agent-permissions-pane"
      label="Permissions"
      description="Ceiling for modes and subagents: a run never gets more rights than this."
    >
      {isDelegate ? (
        <p className="px-1 pb-2 text-muted-foreground text-xs">
          Subagents are capped further by the parent's run rights. “Ask” becomes “Deny” in spawn:
          nobody to ask.
        </p>
      ) : null}
      <RowList>
        {rows.map((row) => (
          <PermissionRow
            key={row.op}
            spec={row}
            gate={current(row.op)}
            onGateChange={(gate) => onChange({ ...(value ?? {}), [row.op]: gate })}
          />
        ))}
      </RowList>
    </Pane>
  );
}
function PermissionRow({
  spec,
  gate,
  onGateChange,
}: {
  spec: PermissionRowSpec;
  gate: PermissionGate;
  onGateChange: (gate: PermissionGate) => void;
}) {
  const { op, label, description } = spec;
  return (
    <div className="flex items-center gap-2 py-2" data-testid={`perm-row-${op}`}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-sm">{label}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            {op}
          </span>
        </div>
        <p className="text-muted-foreground text-xs leading-4">{description}</p>
      </div>
      <ToggleGroup
        variant="segment"
        value={[gate]}
        onValueChange={(next) => {
          const value = next[0];
          if (isGate(value)) {
            onGateChange(value);
          }
        }}
      >
        <ToggleGroupItem value="allow">Allow</ToggleGroupItem>
        <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
        <ToggleGroupItem value="deny">Deny</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
function isGate(value: string | undefined): value is PermissionGate {
  return value === 'allow' || value === 'ask' || value === 'deny';
}
