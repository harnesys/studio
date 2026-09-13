import { type AgentMode, DEFAULT_MODE_ID, MODE_OPS } from '@harnesys/studio-shared';
import { DEFAULT_PERMISSIONS, type PermissionMap } from 'harnesys';

// PermissionMap keys are tool operations (ToolDefinition.operations), not tool
// names: resolveToolPermission/checkPermission look up by operation and fall
// back to 'ask' for unknown ones. fs.read: read_file/glob/grep/list_dir;
// fs.write: write_file/edit_file; process: shell; network: fetch; mcp: MCP tools.

/** Run permission map: agent base ceiling, mode overrides only listed ops and never above the base. */
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
