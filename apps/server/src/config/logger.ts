import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Logger as RuntimeLogger } from 'harnesys';
import pino, { type Logger } from 'pino';
import { HOME_DIR_NAME, LOGS_DIR } from './constants.ts';
import { env } from './env.ts';
export const LOGS_HOME = join(env.harnesysHome ?? join(homedir(), HOME_DIR_NAME), LOGS_DIR);
function dayStamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
export function logFilePath(day: string = dayStamp()): string {
  return join(LOGS_HOME, `studio-${day}.log`);
}
function fileSink(): {
  write(chunk: string): void;
} {
  let day = dayStamp();
  let dest = pino.destination({ dest: logFilePath(day), sync: true, mkdir: true });
  return {
    write(chunk: string): void {
      const current = dayStamp();
      if (current !== day) {
        day = current;
        dest = pino.destination({ dest: logFilePath(day), sync: true, mkdir: true });
      }
      dest.write(chunk);
    },
  };
}
const LEVEL_TAGS: Record<number, string> = {
  10: 'TRC',
  20: 'DBG',
  30: 'INF',
  40: 'WRN',
  50: 'ERR',
  60: 'FTL',
};
const LEVEL_COLORS: Record<number, string> = {
  10: '\x1b[90m',
  20: '\x1b[36m',
  30: '\x1b[32m',
  40: '\x1b[33m',
  50: '\x1b[31m',
  60: '\x1b[35m',
};
const RESET = '\x1b[0m';
function consoleSink(): {
  write(chunk: string): void;
} {
  return {
    write(chunk: string): void {
      const trimmed = chunk.trimEnd();
      let rec: Record<string, unknown>;
      try {
        rec = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        console.log(trimmed);
        return;
      }
      const level = typeof rec.level === 'number' ? rec.level : 30;
      const ts = new Date(typeof rec.time === 'number' ? rec.time : Date.now());
      const hhmmss = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}.${String(ts.getMilliseconds()).padStart(3, '0')}`;
      const parts: string[] = [
        `${hhmmss} ${LEVEL_COLORS[level] ?? ''}${LEVEL_TAGS[level] ?? 'LOG'}${RESET}`,
      ];
      if (typeof rec.scope === 'string') {
        parts.push(rec.scope);
      }
      if (typeof rec.msg === 'string') {
        parts.push(rec.msg);
      }
      const err = rec.err as
        | {
            message?: string;
            stack?: string;
          }
        | undefined;
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rec)) {
        if (
          key === 'level' ||
          key === 'time' ||
          key === 'msg' ||
          key === 'scope' ||
          key === 'err' ||
          key === 'pid' ||
          key === 'hostname'
        ) {
          continue;
        }
        rest[key] = value;
      }
      let restText = '';
      if (Object.keys(rest).length > 0) {
        try {
          restText = ` ${JSON.stringify(rest)}`;
        } catch {
          restText = ` ${String(rest)}`;
        }
      }
      console.log(`${parts.join(' ')}${restText}`);
      if (err?.stack) {
        console.log(err.stack);
      } else if (err?.message) {
        console.log(err.message);
      }
    },
  };
}
const prod = env.production;
const KNOWN_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const rawOverride = process.env.HARNESYS_LOG_LEVEL;
const levelOverride =
  rawOverride && KNOWN_LEVELS.has(rawOverride) ? (rawOverride as pino.Level) : undefined;
const rootLevel = levelOverride ?? (prod ? 'info' : 'trace');
const devConsoleLevel: pino.Level = env.trace ? 'trace' : 'info';
const streams: pino.StreamEntry[] = [
  { stream: fileSink(), level: prod ? 'info' : 'trace' },
  { stream: consoleSink(), level: prod ? 'info' : devConsoleLevel },
];
if (levelOverride) {
  for (const entry of streams) {
    entry.level = levelOverride;
  }
}
export const logger: Logger = pino(
  { level: rootLevel, base: { pid: process.pid } },
  pino.multistream(streams),
);
export function childLogger(scope: string): Logger {
  return logger.child({ scope });
}
export function toRuntimeLogger(scope: string): RuntimeLogger {
  const child = logger.child({ scope });
  const sink =
    (write: (obj: object, msg: string) => void) =>
    (message: string, extra?: unknown): void => {
      if (extra === undefined) {
        write({}, message);
        return;
      }
      write(
        typeof extra === 'object' && extra !== null ? (extra as object) : { detail: extra },
        message,
      );
    };
  return {
    debug: sink((obj, msg) => child.debug(obj, msg)),
    info: sink((obj, msg) => child.info(obj, msg)),
    warn: sink((obj, msg) => child.warn(obj, msg)),
    error: sink((obj, msg) => child.error(obj, msg)),
  };
}
