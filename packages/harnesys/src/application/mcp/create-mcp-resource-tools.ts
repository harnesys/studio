import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type { McpConnection } from './mcp-connector.port.ts';
export type CreateMcpResourceToolsParams = {
  serverId: string;
  prefix: string;
  conn: McpConnection;
};
export function createMcpResourceTools(params: CreateMcpResourceToolsParams): ToolDefinition[] {
  const { serverId, prefix, conn } = params;
  return [
    tool(`${prefix}list_resources`, {
      group: serverId,
      description: `List MCP resources from server ${serverId}`,
      operations: ['mcp'],
      input: { type: 'object', properties: { cursor: { type: 'string' } } },
      async execute(input) {
        const parsed = input as {
          cursor?: string;
        };
        try {
          return await conn.listResources(parsed.cursor);
        } catch (error) {
          return {
            code: 'MCP_RESOURCES_FAILED',
            message: error instanceof Error ? error.message : 'MCP listResources failed',
          };
        }
      },
    }),
    tool(`${prefix}read_resource`, {
      group: serverId,
      description: `Read an MCP resource by URI from server ${serverId}`,
      operations: ['mcp'],
      input: {
        type: 'object',
        properties: { uri: { type: 'string' } },
        required: ['uri'],
      },
      async execute(input) {
        const parsed = input as {
          uri: string;
        };
        try {
          return await conn.readResource(parsed.uri);
        } catch (error) {
          return {
            code: 'MCP_RESOURCES_FAILED',
            message: error instanceof Error ? error.message : 'MCP readResource failed',
          };
        }
      },
    }),
  ];
}
