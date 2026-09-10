// biome-ignore-all lint/suspicious/noConsole: the console sink is the library's fallback
/** Host-injectable diagnostics sink for runtime events (compaction, packs). */
export type Logger = {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
};

function toWarn(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.warn(message);
  } else {
    console.warn(message, extra);
  }
}

function toDebug(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.debug(message);
  } else {
    console.debug(message, extra);
  }
}

function toInfo(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.info(message);
  } else {
    console.info(message, extra);
  }
}

function toError(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.error(message);
  } else {
    console.error(message, extra);
  }
}

/** Default sink when the host injects nothing: warnings stay visible. */
export const CONSOLE_LOGGER: Logger = {
  debug: toDebug,
  info: toInfo,
  warn: toWarn,
  error: toError,
};

export const NOOP_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
