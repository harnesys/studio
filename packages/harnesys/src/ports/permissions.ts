export type PermissionGate = 'allow' | 'ask' | 'deny';

export type PermissionMap = Record<string, PermissionGate>;

export const DEFAULT_PERMISSIONS: PermissionMap = {
  'fs.read': 'allow',
  'fs.write': 'ask',
  process: 'ask',
  network: 'ask',
  mcp: 'ask',
};

export function resolveToolPermission(operations: string[], map: PermissionMap): PermissionGate {
  if (operations.length === 0) {
    return 'allow';
  }
  let result: PermissionGate = 'allow';
  for (const op of operations) {
    const gate = map[op];
    if (gate === 'deny') {
      return 'deny';
    }
    if (gate === 'ask') {
      result = 'ask';
    }
  }
  return result;
}
