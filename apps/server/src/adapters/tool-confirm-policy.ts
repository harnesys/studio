import { type AgentMode, DEFAULT_MODE_ID, MODE_OPS } from '@harnesys/studio-shared';
import { DEFAULT_PERMISSIONS, type PermissionMap } from 'harnesys';
export function permissionMapForRun(
  base: PermissionMap | null | undefined,
  mode: AgentMode | undefined,
): PermissionMap {
  const b: PermissionMap = { ...DEFAULT_PERMISSIONS, ...(base ?? {}) };
  if (!mode || mode.id === DEFAULT_MODE_ID || !mode.permissions) {
    return b;
  }
  const out: PermissionMap = { ...b };
  for (const op of MODE_OPS) {
    const gate = mode.permissions[op];
    if (!gate) {
      continue;
    }
    const baseGate = b[op] ?? 'ask';
    const severity = { allow: 0, ask: 1, deny: 2 } as const;
    out[op] = severity[gate] >= severity[baseGate] ? gate : baseGate;
  }
  return out;
}
