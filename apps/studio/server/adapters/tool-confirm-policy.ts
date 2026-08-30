import type { ToolPermission } from 'harnesys';
import type { PermissionMode, RunMode } from '../../shared/types.ts';

export type { PermissionMode, RunMode };

const FILE_TOOLS = new Set(['write_file', 'edit_file']);
const HOST_MUTATE_TOOLS = new Set([
  'schedule_set',
  'schedule_pause',
  'schedule_delete',
  'webhook_set',
  'webhook_delete',
]);
const EXTERNAL_TOOLS = new Set(['shell', 'http']);

export function isPermissionMode(value: string): value is PermissionMode {
  return value === 'ask' || value === 'auto' || value === 'dont_ask' || value === 'bypass';
}

export function isRunMode(value: string): value is RunMode {
  return value === 'plan' || isPermissionMode(value);
}

/** Default when mode omitted: ask before mutating tools. Plan mode: read-only. */
export function toolPermissionFor(mode: RunMode = 'ask'): (toolName: string) => ToolPermission {
  return (toolName) => {
    if (mode === 'plan') {
      if (
        FILE_TOOLS.has(toolName) ||
        HOST_MUTATE_TOOLS.has(toolName) ||
        EXTERNAL_TOOLS.has(toolName)
      ) {
        return 'deny';
      }
      return 'allow';
    }
    if (FILE_TOOLS.has(toolName) || HOST_MUTATE_TOOLS.has(toolName)) {
      return mode === 'ask' ? 'ask' : 'allow';
    }
    if (EXTERNAL_TOOLS.has(toolName)) {
      if (mode === 'bypass') {
        return 'allow';
      }
      if (mode === 'dont_ask') {
        return 'deny';
      }
      return 'ask';
    }
    return 'allow';
  };
}
