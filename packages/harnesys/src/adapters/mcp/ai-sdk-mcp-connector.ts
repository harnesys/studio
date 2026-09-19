import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { McpConnection, McpConnector } from '../../application/mcp/mcp-connector.port.ts';
import type { McpServerConfig } from '../../domain/mcp.ts';
import { AiSdkMcpConnection } from './ai-sdk-mcp-connection.ts';
export class AiSdkMcpConnector implements McpConnector {
  async connect(config: McpServerConfig): Promise<McpConnection> {
    const client = await createMCPClient({ transport: buildTransport(config) });
    return new AiSdkMcpConnection(config.serverId, client);
  }
}
function buildTransport(config: McpServerConfig) {
  const transport = config.transport;
  if (transport.type === 'stdio') {
    const options: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      stderr?: 'inherit' | 'ignore' | 'pipe' | number;
    } = { command: transport.command, stderr: 'ignore' };
    if (transport.args !== undefined) {
      options.args = [...transport.args];
    }
    if (transport.env !== undefined) {
      options.env = { ...transport.env };
    }
    if (transport.cwd !== undefined) {
      options.cwd = transport.cwd;
    }
    return new Experimental_StdioMCPTransport(options);
  }
  if (transport.type === 'http') {
    const http: {
      type: 'http';
      url: string;
      headers?: Record<string, string>;
    } = {
      type: 'http',
      url: transport.url,
    };
    if (transport.headers !== undefined) {
      http.headers = { ...transport.headers };
    }
    return http;
  }
  const sse: {
    type: 'sse';
    url: string;
    headers?: Record<string, string>;
  } = {
    type: 'sse',
    url: transport.url,
  };
  if (transport.headers !== undefined) {
    sse.headers = { ...transport.headers };
  }
  return sse;
}
