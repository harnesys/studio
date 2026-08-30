import type { PermissionGate, PermissionMap } from '../ports/permissions.ts';
import { DEFAULT_PERMISSIONS } from '../ports/permissions.ts';

export function resolvePermissions(
  toolOperations: string[],
  callMap?: PermissionMap,
  sessionMap?: PermissionMap,
  runtimeMap?: PermissionMap,
): PermissionMap {
  const base: PermissionMap = {};
  for (const op of toolOperations) {
    const gate: PermissionGate =
      callMap?.[op] ?? sessionMap?.[op] ?? runtimeMap?.[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    base[op] = gate;
  }
  return base;
}

export function checkPermission(
  permissions: PermissionMap,
  operations: string[],
): { allowed: boolean; gate: PermissionGate; operation?: string } {
  for (const op of operations) {
    const gate = permissions[op] ?? 'ask';
    if (gate === 'deny') {
      return { allowed: false, gate: 'deny', operation: op };
    }
    if (gate === 'ask') {
      return { allowed: false, gate: 'ask', operation: op };
    }
  }
  return { allowed: true, gate: 'allow' };
}
