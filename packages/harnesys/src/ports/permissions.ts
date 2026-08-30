export type PermissionGate = 'allow' | 'ask' | 'deny';

export type PermissionMap = Record<string, PermissionGate>;

export const DEFAULT_PERMISSIONS: PermissionMap = {
  'fs.read': 'allow',
  'fs.write': 'ask',
  process: 'ask',
  network: 'ask',
  mcp: 'ask',
};
