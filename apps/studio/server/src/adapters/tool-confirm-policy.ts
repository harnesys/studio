import { type AgentMode, MODE_OPS, type ModeOpPermissions } from '@harnesys/studio-shared';
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

/** Run permission map: agent base ceiling, mode overrides only listed ops and never above the base. */
export function permissionMapForRun(
  base: PermissionMap | null | undefined,
  mode: AgentMode | undefined,
): PermissionMap {
  const b: PermissionMap = base ?? permissionMapForMode(mode?.permissions);
  if (!mode || mode.id === 'default' || !mode.permissions) {
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
