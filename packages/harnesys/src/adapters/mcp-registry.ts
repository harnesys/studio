import type {
  CursorMcpJson,
  McpRegistry as McpRegistryPort,
  StdioEntry,
  UrlEntry,
} from '../ports/mcp.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { McpConnection, McpConnector } from '../application/mcp/mcp-connector.port.ts';
import type { McpServerConfig } from '../domain/mcp.ts';
import { AiSdkMcpConnector } from './mcp/ai-sdk-mcp-connector.ts';
import { createMcpTool } from '../application/mcp/create-mcp-tool.ts';
import { createMcpResourceTools } from '../application/mcp/create-mcp-resource-tools.ts';

type EnabledEntry = {
  config: McpServerConfig;
  connection: McpConnection;
  tools: ToolDefinition[];
};

export class McpRegistry implements McpRegistryPort {
  readonly #connector: McpConnector;
  readonly #enabled = new Map<string, EnabledEntry>();
  readonly #configs = new Map<string, McpServerConfig>();

  constructor(connector?: McpConnector) {
    this.#connector = connector ?? new AiSdkMcpConnector();
  }

  async loadJson(json: CursorMcpJson): Promise<void> {
    for (const [id, entry] of Object.entries(json.mcpServers)) {
      if (entry.enabled === false) continue;
      const config = toServerConfig(id, entry);
      this.#configs.set(id, config);
      await this.enable(id);
    }
  }

  async enable(id: string): Promise<void> {
    if (this.#enabled.has(id)) return;
    const config = this.#configs.get(id);
    if (!config) throw new Error(`MCP server config not found: ${id}`);
    const connection = await this.#connector.connect(config);
    try {
      const listed = await connection.listTools();
      const prefix = config.toolPrefix ?? `${config.serverId}__`;
      const tools: ToolDefinition[] = [];
      for (const raw of listed) {
        tools.push(createMcpTool({ serverId: config.serverId, prefix, raw, conn: connection }));
      }
      appendResourceTools(tools, {
        serverId: config.serverId,
        prefix,
        conn: connection,
      });
      assertNoCollisions(this.#enabled, config.serverId, tools);
      this.#enabled.set(config.serverId, { config, connection, tools });
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  async disable(id: string): Promise<void> {
    const entry = this.#enabled.get(id);
    if (!entry) return;
    this.#enabled.delete(id);
    try {
      await entry.connection.close();
    } catch {
      return;
    }
  }

  async reload(id?: string): Promise<void> {
    if (id) {
      await this.disable(id);
      await this.enable(id);
    } else {
      const ids = [...this.#enabled.keys()];
      for (const sid of ids) await this.disable(sid);
      for (const sid of this.#configs.keys()) await this.enable(sid);
    }
  }

  list(): string[] {
    return [...this.#enabled.keys()];
  }

  tools(): ToolDefinition[] {
    const out: ToolDefinition[] = [];
    for (const entry of this.#enabled.values()) out.push(...entry.tools);
    return out;
  }

  async closeAll(): Promise<void> {
    const ids = [...this.#enabled.keys()];
    for (const id of ids) await this.disable(id);
  }
}

function toServerConfig(id: string, entry: StdioEntry | UrlEntry): McpServerConfig {
  if ('command' in entry) {
    return {
      serverId: id,
      transport: { type: 'stdio', command: entry.command, args: entry.args, env: entry.env },
    };
  }
  return {
    serverId: id,
    transport: { type: (entry.type ?? 'http') as 'sse' | 'http', url: entry.url, headers: entry.headers },
  };
}

function assertNoCollisions(
  enabled: Map<string, EnabledEntry>,
  serverId: string,
  tools: ToolDefinition[],
): void {
  const claimed = new Map<string, string>();
  for (const entry of enabled.values()) {
    for (const item of entry.tools) claimed.set(item.name, entry.config.serverId);
  }
  for (const item of tools) {
    const owner = claimed.get(item.name);
    if (owner !== undefined) {
      throw new Error(`MCP tool name collision: ${item.name} (servers ${owner} and ${serverId})`);
    }
  }
}

async function appendResourceTools(
  tools: ToolDefinition[],
  params: { serverId: string; prefix: string; conn: McpConnection },
): Promise<void> {
  const claimed = new Set(tools.map((item) => item.name));
  try {
    for (const item of createMcpResourceTools(params)) {
      if (claimed.has(item.name)) continue;
      claimed.add(item.name);
      tools.push(item);
    }
  } catch {
    // Server doesn't support resources
  }
}
