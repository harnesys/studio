export type McpStdioTransport = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type McpHttpTransport = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
};

export type McpSseTransport = {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
};

export type McpTransport = McpStdioTransport | McpHttpTransport | McpSseTransport;

export type McpServerConfig = {
  serverId: string;
  transport: McpTransport;
  toolPrefix?: string;
  allowTools?: string[];
};

export type McpToolInfo = { name: string; description: string };

export type McpResourceInfo = {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
};
