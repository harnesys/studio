import { MODE_OPS, type ModeOpPermissions } from '@harnesys/studio-shared';
import type { PermissionMap } from 'harnesys';

// PermissionMap keys are tool operations (ToolDefinition.operations), not tool
// names: resolveToolPermission/checkPermission look up by operation and fall
// back to 'ask' for unknown ones. fs.read: read_file/glob/grep/list_dir;
// fs.write: write_file/edit_file; process: shell; network: fetch; mcp: MCP tools.

/** Ask-based floor plus the mode's own gates; a custom mode never gets lighter than ask by omission. */
export function permissionMapForMode(perms?: ModeOpPermissions): PermissionMap {
  const map: PermissionMap = {
    'fs.read': 'allow',
    'fs.write': 'ask',
    process: 'ask',
    network: 'ask',
    mcp: 'ask',
  };
  for (const op of MODE_OPS) {
    const gate = perms?.[op];
    if (gate) {
      map[op] = gate;
    }
  }
  return map;
}
