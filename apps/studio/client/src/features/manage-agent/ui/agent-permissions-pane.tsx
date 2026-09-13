import type { PermissionGate, PermissionMap } from 'harnesys';

import { Pane, Row, RowList } from '@/shared/ui/capability-rows';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { PERM_OPS } from '../model/agent-permissions';

type AgentPermissionsPaneProps = {
  value: PermissionMap | null;
  onChange: (next: PermissionMap) => void;
  isDelegate: boolean;
};

export function AgentPermissionsPane({ value, onChange, isDelegate }: AgentPermissionsPaneProps) {
  const ops: readonly string[] = isDelegate ? PERM_OPS : [...PERM_OPS, 'agents'];
  const current = (op: string): PermissionGate => value?.[op] ?? 'ask';
  return (
    <Pane
      testId="agent-permissions-pane"
      label="Permissions"
      description="Base permission map: mode ceiling and spawn base."
    >
      {isDelegate ? (
        <p className="px-1 pb-2 text-muted-foreground text-xs">
          ask acts as deny in spawn (sandbox).
        </p>
      ) : null}
      <RowList>
        {ops.map((op) => (
          <Row
            key={op}
            testId={`perm-row-${op}`}
            title={op}
            mono
            actions={
              <ToggleGroup
                variant="segment"
                value={[current(op)]}
                onValueChange={(next) => {
                  const gate = next[0];
                  if (isGate(gate)) {
                    onChange({ ...(value ?? {}), [op]: gate });
                  }
                }}
              >
                <ToggleGroupItem value="allow">Allow</ToggleGroupItem>
                <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
                <ToggleGroupItem value="deny">Deny</ToggleGroupItem>
              </ToggleGroup>
            }
          />
        ))}
      </RowList>
    </Pane>
  );
}

function isGate(value: string | undefined): value is PermissionGate {
  return value === 'allow' || value === 'ask' || value === 'deny';
}
