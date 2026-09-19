export type Logger = {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
};
function toWarn(_message: string, extra?: unknown): void {
  if (extra === undefined) {
  } else {
  }
}
function toDebug(_message: string, extra?: unknown): void {
  if (extra === undefined) {
  } else {
  }
}
function toInfo(_message: string, extra?: unknown): void {
  if (extra === undefined) {
  } else {
  }
}
function toError(_message: string, extra?: unknown): void {
  if (extra === undefined) {
  } else {
  }
}
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
