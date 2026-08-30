import type { PermissionGate, PermissionMap } from 'harnesys';
import type { PermissionMode, RunMode } from '../../shared/types.ts';

export type { PermissionMode, RunMode };

const FILE_TOOLS = ['write_file', 'edit_file'] as const;
const HOST_MUTATE_TOOLS = [
  'schedule_set',
  'schedule_pause',
  'schedule_delete',
  'webhook_set',
  'webhook_delete',
] as const;
const EXTERNAL_TOOLS = ['shell', 'http'] as const;

export function isPermissionMode(value: string): value is PermissionMode {
  return value === 'ask' || value === 'auto' || value === 'dont_ask' || value === 'bypass';
}

export function isRunMode(value: string): value is RunMode {
  return value === 'plan' || isPermissionMode(value);
}

export function permissionMapFor(mode: RunMode = 'ask'): PermissionMap {
  const map: PermissionMap = {};
  const gate = (tools: readonly string[], value: PermissionGate) => {
    for (const t of tools) {
      map[t] = value;
    }
  };

  if (mode === 'plan') {
    gate(FILE_TOOLS, 'deny');
    gate(HOST_MUTATE_TOOLS, 'deny');
    gate(EXTERNAL_TOOLS, 'deny');
    return map;
  }

  if (mode === 'bypass') {
    gate(FILE_TOOLS, 'allow');
    gate(HOST_MUTATE_TOOLS, 'allow');
    gate(EXTERNAL_TOOLS, 'allow');
    return map;
  }

  const mutateGate: PermissionGate = mode === 'ask' ? 'ask' : 'allow';
  gate(FILE_TOOLS, mutateGate);
  gate(HOST_MUTATE_TOOLS, mutateGate);

  if (mode === 'dont_ask') {
    gate(EXTERNAL_TOOLS, 'deny');
  } else {
    gate(EXTERNAL_TOOLS, 'ask');
  }

  return map;
}
