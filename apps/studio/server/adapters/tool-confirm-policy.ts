import type { PermissionGate, PermissionMap } from 'harnesys';
import type { PermissionMode, RunMode } from '../../shared/types.ts';

export type { PermissionMode, RunMode };

// PermissionMap keys are tool operations (ToolDefinition.operations), not tool
// names: resolveToolPermission/checkPermission look up by operation and fall
// back to 'ask' for unknown ones. fs.read: read_file/glob/grep/list_dir;
// fs.write: write_file/edit_file; process: shell; network: fetch; mcp: MCP tools.
export function isPermissionMode(value: string): value is PermissionMode {
  return value === 'ask' || value === 'auto' || value === 'dont_ask' || value === 'bypass';
}

export function isRunMode(value: string): value is RunMode {
  return value === 'plan' || isPermissionMode(value);
}

export function permissionMapFor(mode: RunMode = 'ask'): PermissionMap {
  const map: PermissionMap = { 'fs.read': 'allow' };
  const set = (ops: readonly string[], value: PermissionGate) => {
    for (const op of ops) {
      map[op] = value;
    }
  };
  const MUTATE_OPS = ['fs.write'] as const;
  const EXTERNAL_OPS = ['process', 'network', 'mcp'] as const;

  if (mode === 'plan') {
    set(MUTATE_OPS, 'deny');
    set(EXTERNAL_OPS, 'deny');
    return map;
  }
  if (mode === 'bypass') {
    set(MUTATE_OPS, 'allow');
    set(EXTERNAL_OPS, 'allow');
    return map;
  }
  const mutateGate: PermissionGate = mode === 'ask' ? 'ask' : 'allow';
  set(MUTATE_OPS, mutateGate);
  if (mode === 'dont_ask') {
    set(EXTERNAL_OPS, 'deny');
  } else {
    set(EXTERNAL_OPS, 'ask');
  }
  return map;
}
