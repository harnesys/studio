import type { McpServerConfig } from '../../domain/mcp.ts';
export type RawToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
export type RawResourceDescriptor = {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
};
export type ListResourcesPage = {
  resources: RawResourceDescriptor[];
  nextCursor?: string;
};
export type RawResourceTextContent = {
  uri: string;
  name?: string;
  title?: string;
  mimeType?: string;
  text: string;
};
export type RawResourceBlobContent = {
  uri: string;
  name?: string;
  title?: string;
  mimeType?: string;
  blob: string;
};
export type RawResourceContent = RawResourceTextContent | RawResourceBlobContent;
export type RawResourceReadResult = {
  contents: RawResourceContent[];
};
export type McpConnection = {
  serverId: string;
  listTools(): Promise<RawToolDescriptor[]>;
  callTool(name: string, input: unknown): Promise<unknown>;
  listResources(cursor?: string): Promise<ListResourcesPage>;
  readResource(uri: string): Promise<RawResourceReadResult>;
  close(): Promise<void>;
};
export type McpConnector = {
  connect(config: McpServerConfig): Promise<McpConnection>;
};
