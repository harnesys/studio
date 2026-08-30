import { AsyncLocalStorage } from 'node:async_hooks';
import { ValidationError } from '../domain/studio.error.ts';

export type HostToolScope = {
  workspaceId: string;
  agentId: string;
  threadId: string;
};

const storage = new AsyncLocalStorage<HostToolScope>();

export function runInHostToolScope<T>(scope: HostToolScope, fn: () => T): T {
  return storage.run(scope, fn);
}

export function requireHostToolScope(): HostToolScope {
  const scope = storage.getStore();
  if (!scope) {
    throw new ValidationError('host tool scope missing');
  }
  return scope;
}
