import { env } from './config/env.ts';

/** Temporary run diagnostics. Remove after the chat/SSE flow is stable. */
export function trace(scope: string, message: string, extra?: unknown): void {
  if (!env.trace) {
    return;
  }
  const line = `[harnesys:trace] ${new Date().toISOString()} ${scope} ${message}`;
  if (extra === undefined) {
    console.log(line);
    return;
  }
  console.log(line, extra);
}

export function preview(value: unknown, limit = 240): string {
  if (typeof value === 'string') {
    return value.length <= limit ? value : `${value.slice(0, limit)}…`;
  }
  try {
    const text = JSON.stringify(value);
    if (!text) {
      return String(value);
    }
    return text.length <= limit ? text : `${text.slice(0, limit)}…`;
  } catch {
    return String(value);
  }
}
