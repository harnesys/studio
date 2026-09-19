import type { TerminalSessionRecord } from '@harnesys/studio-shared';

import { apiJson } from './client';

export type { TerminalSessionRecord };

export function terminalsQueryKey(workspaceId: string) {
  return ['terminals', workspaceId] as const;
}

export function listTerminals(workspaceId: string): Promise<TerminalSessionRecord[]> {
  return apiJson<TerminalSessionRecord[]>(`/api/workspaces/${workspaceId}/terminals`);
}

export function createTerminal(workspaceId: string): Promise<TerminalSessionRecord> {
  return apiJson<TerminalSessionRecord>(`/api/workspaces/${workspaceId}/terminals`, {
    method: 'POST',
  });
}

export function deleteTerminal(workspaceId: string, sessionId: string): Promise<void> {
  return apiJson<void>(`/api/workspaces/${workspaceId}/terminals/${sessionId}`, {
    method: 'DELETE',
  });
}
