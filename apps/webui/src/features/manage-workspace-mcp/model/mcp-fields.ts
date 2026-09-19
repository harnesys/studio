import type {
  UpsertWorkspaceMcpServerRequest,
  WorkspaceMcpConfigServer,
  WorkspaceMcpTransport,
} from '@harnesys/studio-shared';
import { z } from 'zod';

const TRANSPORTS = ['stdio', 'http', 'sse'] as const satisfies readonly WorkspaceMcpTransport[];

export const mcpFieldsSchema = z
  .object({
    serverId: z
      .string()
      .trim()
      .min(1, 'Server id required')
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Letters, digits, ., _, -'),
    enabled: z.boolean(),
    transport: z.enum(TRANSPORTS),
    command: z.string(),
    argsText: z.string(),
    envText: z.string(),
    url: z.string(),
    headersText: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.transport === 'stdio' && value.command.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['command'], message: 'Command required for stdio' });
    }
    if ((value.transport === 'http' || value.transport === 'sse') && value.url.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'URL required' });
    }
    const env = parseEnvLines(value.envText);
    if (env.error) {
      ctx.addIssue({ code: 'custom', path: ['envText'], message: env.error });
    }
    const headers = parseHeaderLines(value.headersText);
    if (headers.error) {
      ctx.addIssue({ code: 'custom', path: ['headersText'], message: headers.error });
    }
  });

export type McpFieldsInput = z.input<typeof mcpFieldsSchema>;
export type McpFieldsOutput = z.output<typeof mcpFieldsSchema>;

export type McpServerDraft = {
  serverId: string;
  body: UpsertWorkspaceMcpServerRequest;
};

export function emptyMcpFields(): McpFieldsInput {
  return {
    serverId: '',
    enabled: true,
    transport: 'stdio',
    command: '',
    argsText: '',
    envText: '',
    url: '',
    headersText: '',
  };
}

export function mcpFieldsFrom(server: WorkspaceMcpConfigServer): McpFieldsInput {
  return {
    serverId: server.serverId,
    enabled: server.enabled,
    transport: server.transport,
    command: server.command ?? '',
    argsText: (server.args ?? []).join('\n'),
    envText: recordToEnvLines(server.env),
    url: server.url ?? '',
    headersText: recordToHeaderLines(server.headers),
  };
}

export function toMcpServerDraft(values: McpFieldsOutput): McpServerDraft {
  const env = parseEnvLines(values.envText).value;
  const headers = parseHeaderLines(values.headersText).value;
  const args = parseArgsLines(values.argsText);

  const body: UpsertWorkspaceMcpServerRequest = {
    enabled: values.enabled,
    transport: values.transport,
  };

  if (values.transport === 'stdio') {
    body.command = values.command.trim();
    if (args.length > 0) {
      body.args = args;
    }
    if (env && Object.keys(env).length > 0) {
      body.env = env;
    }
  } else {
    body.url = values.url.trim();
    if (headers && Object.keys(headers).length > 0) {
      body.headers = headers;
    }
  }

  return { serverId: values.serverId, body };
}

export const TRANSPORT_ITEMS: { value: WorkspaceMcpTransport; label: string }[] = [
  { value: 'stdio', label: 'stdio' },
  { value: 'http', label: 'http' },
  { value: 'sse', label: 'sse' },
];

function parseArgsLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseEnvLines(text: string): { value?: Record<string, string>; error?: string } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { value: undefined };
  }
  const result: Record<string, string> = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq <= 0) {
      return { error: 'Use KEY=value lines' };
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    if (!key) {
      return { error: 'Use KEY=value lines' };
    }
    result[key] = value;
  }
  return { value: result };
}

function parseHeaderLines(text: string): { value?: Record<string, string>; error?: string } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { value: undefined };
  }
  const result: Record<string, string> = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) {
      return { error: 'Use Key: value lines' };
    }
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) {
      return { error: 'Use Key: value lines' };
    }
    result[key] = value;
  }
  return { value: result };
}

function recordToEnvLines(record?: Record<string, string>): string {
  if (!record) {
    return '';
  }
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function recordToHeaderLines(record?: Record<string, string>): string {
  if (!record) {
    return '';
  }
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}
