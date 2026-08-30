// biome-ignore-all lint/suspicious/noConfusingVoidType: McpRegistry host port uses void|Promise<void> verbatim
import type { ToolDefinition } from './tools.ts';

export type StdioEntry = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
};

export type UrlEntry = {
  url: string;
  headers?: Record<string, string>;
  type?: 'sse' | 'http';
  enabled?: boolean;
};

export type CursorMcpJson = {
  mcpServers: Record<string, StdioEntry | UrlEntry>;
};

export type McpRegistry = {
  loadJson(json: CursorMcpJson): void | Promise<void>;
  enable(id: string): void | Promise<void>;
  disable(id: string): void | Promise<void>;
  reload(id?: string): void | Promise<void>;
  list(): string[] | Promise<string[]>;
  tools(): ToolDefinition[] | Promise<ToolDefinition[]>;
  closeAll(): void | Promise<void>;
};
