import type {
  McpResourceInfo as WorkspaceMcpResource,
  ToolCatalogEntry as WorkspaceTool,
} from 'harnesys';
import type { ComponentOrigin } from './plugin.ts';

export type WorkspaceSkill = {
  name: string;
  description: string;
  whenToUse?: string;
  origin: ComponentOrigin;
};

export type CreateWorkspaceSkillRequest = {
  name: string;
  description: string;
  whenToUse?: string;
  instructions: string;
};

export type WorkspaceMcpTransport = 'stdio' | 'http' | 'sse';

export type WorkspaceMcpServer = {
  serverId: string;
  transport: WorkspaceMcpTransport;
  connected: boolean;
  toolCount: number;
  tools: WorkspaceTool[];
  resources: WorkspaceMcpResource[];
};

/** `.harnesys/mcp.json` entry or plugin-provided server, merged with live connection status. */
export type WorkspaceMcpConfigServer = {
  serverId: string;
  enabled: boolean;
  transport: WorkspaceMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  connected: boolean;
  toolCount: number;
  origin: ComponentOrigin;
};

export type UpsertWorkspaceMcpServerRequest = {
  enabled?: boolean;
  transport: WorkspaceMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};
