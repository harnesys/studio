import type { GitDiffResponse, GitFileStatusMap, GitStatusResponse } from '@studio/shared';

import { apiJson } from './client';

export function getGitStatus(workspaceId: string) {
  return apiJson<GitStatusResponse>(`/api/workspaces/${workspaceId}/git/status`);
}

export function getGitFileStatus(workspaceId: string, subPath = '') {
  const q = subPath ? `?path=${encodeURIComponent(subPath)}` : '';
  return apiJson<{ map: GitFileStatusMap; truncated: boolean }>(
    `/api/workspaces/${workspaceId}/git/file-status${q}`,
  );
}

export function checkoutGitBranch(workspaceId: string, branch: string) {
  return apiJson<{ ok: true }>(`/api/workspaces/${workspaceId}/git/checkout`, {
    method: 'POST',
    body: JSON.stringify({ branch }),
  });
}

export function createGitBranch(
  workspaceId: string,
  input: { name: string; checkout?: boolean; from?: string },
) {
  return apiJson<{ ok: true }>(`/api/workspaces/${workspaceId}/git/branches`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function commitGit(workspaceId: string, message: string) {
  return apiJson<{ ok: true }>(`/api/workspaces/${workspaceId}/git/commit`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function pushGit(workspaceId: string) {
  return apiJson<{ ok: true }>(`/api/workspaces/${workspaceId}/git/push`, {
    method: 'POST',
  });
}

export function pullGit(workspaceId: string) {
  return apiJson<{ ok: true }>(`/api/workspaces/${workspaceId}/git/pull`, {
    method: 'POST',
  });
}

export function stageGit(workspaceId: string, paths: string[] = []) {
  return apiJson<{ ok: true }>(`/api/workspaces/${workspaceId}/git/add`, {
    method: 'POST',
    body: JSON.stringify({ paths }),
  });
}

export function getGitDiff(workspaceId: string, filePath: string) {
  const q = `?path=${encodeURIComponent(filePath)}`;
  return apiJson<GitDiffResponse>(`/api/workspaces/${workspaceId}/git/diff${q}`);
}

export const gitStatusQueryKey = (workspaceId: string) =>
  ['workspaces', workspaceId, 'git', 'status'] as const;

export const gitFileStatusQueryKey = (workspaceId: string, subPath = '') =>
  ['workspaces', workspaceId, 'git', 'file-status', subPath] as const;

export const gitDiffQueryKey = (workspaceId: string, filePath: string) =>
  ['workspaces', workspaceId, 'git', 'diff', filePath] as const;
