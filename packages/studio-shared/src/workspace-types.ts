import type { PluginDiagnostic } from './plugin.ts';

export type WorkspaceStatus = {
  exists: boolean;
  kind: 'folder' | 'git';
  branch?: string;
  dirty?: boolean;
};
export type StudioErrorBody = {
  error: string;
};
export type WorkspaceFileEntry = {
  name: string;
  kind: 'file' | 'dir';
  path: string;
  size?: number;
  modifiedAt?: string;
  pruned?: boolean;
};
export type WorkspaceLspEntry = {
  serverId: string;
  origin: 'file' | string;
  command: string;
  args?: string[];
  extensionToLanguage: Record<string, string>;
  disabled: boolean;
  granted: boolean;
  binaryOk: boolean;
  status: 'live' | 'off' | 'error';
  lastError?: string;
};
export type WorkspaceLspListResponse = {
  servers: WorkspaceLspEntry[];
  diagnostics: PluginDiagnostic[];
};
