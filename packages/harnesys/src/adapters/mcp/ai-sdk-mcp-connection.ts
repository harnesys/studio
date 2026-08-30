import type { MCPClient } from '@ai-sdk/mcp';
import type {
  ListResourcesPage,
  McpConnection,
  RawResourceContent,
  RawResourceDescriptor,
  RawResourceReadResult,
  RawToolDescriptor,
} from '../../application/mcp/mcp-connector.port.ts';

export class AiSdkMcpConnection implements McpConnection {
  readonly serverId: string;
  readonly #client: MCPClient;

  constructor(serverId: string, client: MCPClient) {
    this.serverId = serverId;
    this.#client = client;
  }

  async listTools(): Promise<RawToolDescriptor[]> {
    const listed = await this.#client.listTools();
    const out: RawToolDescriptor[] = [];
    for (const item of listed.tools) {
      const description = typeof item.description === 'string' ? item.description : '';
      out.push({
        name: item.name,
        description,
        inputSchema: toInputSchema(item.inputSchema),
      });
    }
    return out;
  }

  callTool(name: string, input: unknown): Promise<unknown> {
    return this.#client.callTool({
      name,
      arguments: toCallArguments(input),
    });
  }

  async listResources(cursor?: string): Promise<ListResourcesPage> {
    const listed =
      cursor === undefined
        ? await this.#client.listResources()
        : await this.#client.listResources({ params: { cursor } });
    const resources: RawResourceDescriptor[] = [];
    for (const item of listed.resources) {
      const resource: RawResourceDescriptor = {
        uri: item.uri,
        name: item.name,
      };
      if (item.title !== undefined) {
        resource.title = item.title;
      }
      if (item.description !== undefined) {
        resource.description = item.description;
      }
      if (item.mimeType !== undefined) {
        resource.mimeType = item.mimeType;
      }
      if (item.size !== undefined) {
        resource.size = item.size;
      }
      resources.push(resource);
    }
    const page: ListResourcesPage = { resources };
    if (listed.nextCursor !== undefined) {
      page.nextCursor = listed.nextCursor;
    }
    return page;
  }

  async readResource(uri: string): Promise<RawResourceReadResult> {
    const read = await this.#client.readResource({ uri });
    const contents: RawResourceContent[] = [];
    for (const item of read.contents) {
      contents.push(toResourceContent(item));
    }
    return { contents };
  }

  close(): Promise<void> {
    return this.#client.close();
  }
}

function toResourceContent(item: {
  uri: string;
  name?: string;
  title?: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}): RawResourceContent {
  if ('text' in item && typeof item.text === 'string') {
    const content: RawResourceContent = { uri: item.uri, text: item.text };
    assignResourceMeta(content, item);
    return content;
  }
  const content: RawResourceContent = {
    uri: item.uri,
    blob: 'blob' in item && typeof item.blob === 'string' ? item.blob : '',
  };
  assignResourceMeta(content, item);
  return content;
}

function assignResourceMeta(
  content: RawResourceContent,
  item: { name?: string; title?: string; mimeType?: string },
): void {
  if (item.name !== undefined) {
    content.name = item.name;
  }
  if (item.title !== undefined) {
    content.title = item.title;
  }
  if (item.mimeType !== undefined) {
    content.mimeType = item.mimeType;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toInputSchema(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return { type: 'object' };
  }
  return value;
}

function toCallArguments(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    return {};
  }
  return { ...input };
}
