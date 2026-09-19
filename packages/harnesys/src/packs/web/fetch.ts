import { DEFAULT_HTTP_TIMEOUT_MS, MAX_HTTP_TIMEOUT_MS, METHODS } from '../../constants.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
export function fetchTool(): ToolDefinition {
  return tool('fetch', {
    group: 'core',
    description: 'HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD). Only http/https URLs.',
    operations: ['network'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', enum: [...METHODS] },
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        body: { type: 'string' },
        timeout_ms: { type: 'integer', minimum: 1 },
      },
      required: ['url'],
    },
    async execute(input, ctx) {
      const parsed = input as {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeout_ms?: number;
      };
      assertHttpUrl(parsed.url);
      const method = parsed.method ?? 'GET';
      const timeoutMs = Math.min(parsed.timeout_ms ?? DEFAULT_HTTP_TIMEOUT_MS, MAX_HTTP_TIMEOUT_MS);
      const started = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onParent = (): void => {
        controller.abort();
      };
      if (ctx.signal?.aborted) {
        controller.abort();
      } else {
        ctx.signal?.addEventListener('abort', onParent, { once: true });
      }
      try {
        const response = await fetch(parsed.url, {
          method,
          headers: parsed.headers,
          body:
            parsed.body !== undefined && method !== 'GET' && method !== 'HEAD'
              ? parsed.body
              : undefined,
          signal: controller.signal,
        });
        const body = await response.text();
        return {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body,
          durationMs: Math.round(performance.now() - started),
        };
      } catch (error) {
        if (ctx.signal?.aborted) {
          throw new Error('http aborted');
        }
        if (controller.signal.aborted) {
          throw new Error(`http timed out after ${timeoutMs}ms`);
        }
        throw error instanceof Error ? error : new Error('http failed');
      } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener('abort', onParent);
      }
    },
  });
}
function assertHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`http: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`http: only http/https URLs are allowed, got ${parsed.protocol}`);
  }
}
