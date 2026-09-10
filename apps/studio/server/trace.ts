import { logger } from './config/logger.ts';

/** Run diagnostics: always lands in the NDJSON log file, console level decides visibility. */
export function trace(scope: string, message: string, extra?: unknown): void {
  if (extra === undefined) {
    logger.trace({ scope }, message);
    return;
  }
  const bindings: Record<string, unknown> = { scope };
  if (typeof extra === 'object' && extra !== null) {
    Object.assign(bindings, extra);
  } else {
    bindings.detail = extra;
  }
  logger.trace(bindings, message);
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
