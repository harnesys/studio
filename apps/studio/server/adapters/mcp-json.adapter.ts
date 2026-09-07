import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServerConfig, McpTransport, StdioEntry, UrlEntry } from 'harnesys';
import { z } from 'zod';
import type { UpsertWorkspaceMcpServerRequest, WorkspaceMcpTransport } from '../../shared/types.ts';
import { ValidationError } from '../domain/studio.error.ts';
import { studioDir } from './store/studio-layout.ts';

const mcpEntrySchema = z
  .object({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().min(1).optional(),
    type: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((e) => e.enabled === false || e.command !== undefined || e.url !== undefined, {
    message: 'MCP server entry requires command or url',
  });

const mcpJsonSchema = z.object({
  mcpServers: z.record(z.string(), mcpEntrySchema),
});

function mcpJsonPath(workspacePath: string): string {
  return join(studioDir(workspacePath), 'mcp.json');
}

/** Read `<workspace>/.harnesys/mcp.json` including disabled entries. */
export function readWorkspaceMcpJson(workspacePath: string): Record<string, StdioEntry | UrlEntry> {
  const path = mcpJsonPath(workspacePath);
  if (!existsSync(path)) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ValidationError(
      `Invalid JSON in ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = mcpJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(`Invalid .harnesys/mcp.json: ${result.error.message}`);
  }

  return result.data.mcpServers as Record<string, StdioEntry | UrlEntry>;
}

/** Write `<workspace>/.harnesys/mcp.json` (2-space pretty JSON). */
export function writeWorkspaceMcpJson(
  workspacePath: string,
  mcpServers: Record<string, StdioEntry | UrlEntry>,
): void {
  mkdirSync(studioDir(workspacePath), { recursive: true });
  writeFileSync(mcpJsonPath(workspacePath), `${JSON.stringify({ mcpServers }, null, 2)}\n`, 'utf8');
}

/** Read `.harnesys/mcp.json` and normalize enabled servers to domain configs. */
export function loadWorkspaceMcpServers(workspacePath: string): McpServerConfig[] {
  const map = readWorkspaceMcpJson(workspacePath);
  const out: McpServerConfig[] = [];
  for (const [serverId, entry] of Object.entries(map)) {
    if (entry.enabled === false) {
      continue;
    }
    out.push({ serverId, transport: toTransport(entry) });
  }
  return out;
}

export function mcpEntryToFields(entry: StdioEntry | UrlEntry): {
  enabled: boolean;
  transport: WorkspaceMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
} {
  const enabled = entry.enabled !== false;
  if ('command' in entry) {
    return {
      enabled,
      transport: 'stdio',
      command: entry.command,
      ...(entry.args !== undefined ? { args: entry.args } : {}),
      ...(entry.env !== undefined ? { env: entry.env } : {}),
    };
  }
  const transport: WorkspaceMcpTransport = entry.type === 'sse' ? 'sse' : 'http';
  return {
    enabled,
    transport,
    url: entry.url,
    ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
  };
}

export function fieldsToMcpEntry(fields: UpsertWorkspaceMcpServerRequest): StdioEntry | UrlEntry {
  const enabled = fields.enabled !== false;
  if (fields.transport === 'stdio') {
    if (fields.command === undefined || fields.command.length === 0) {
      throw new ValidationError('stdio transport requires command');
    }
    return {
      command: fields.command,
      ...(fields.args !== undefined ? { args: fields.args } : {}),
      ...(fields.env !== undefined ? { env: fields.env } : {}),
      ...(!enabled ? { enabled: false } : {}),
    };
  }
  if (fields.url === undefined || fields.url.length === 0) {
    throw new ValidationError(`${fields.transport} transport requires url`);
  }
  return {
    url: fields.url,
    ...(fields.transport === 'sse' ? { type: 'sse' } : {}),
    ...(fields.headers !== undefined ? { headers: fields.headers } : {}),
    ...(!enabled ? { enabled: false } : {}),
  };
}

function toTransport(entry: StdioEntry | UrlEntry): McpTransport {
  if ('command' in entry) {
    return {
      type: 'stdio',
      command: entry.command,
      ...(entry.args !== undefined ? { args: entry.args } : {}),
      ...(entry.env !== undefined ? { env: entry.env } : {}),
    };
  }
  if (entry.type === 'sse') {
    return {
      type: 'sse',
      url: entry.url,
      ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
    };
  }
  return {
    type: 'http',
    url: entry.url,
    ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
  };
}
