import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { logFilePath, logsDir, pidFilePath, runDir } from './paths.ts';
export type PidRecord = {
  pid: number;
  port: number;
  startedAt: string;
  env?: Record<string, string>;
};
export function readPidRecord(home: string, name: string): PidRecord | undefined {
  const path = pidFilePath(home, name);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PidRecord>;
    if (typeof parsed.pid !== 'number' || typeof parsed.port !== 'number') {
      return undefined;
    }
    const record: PidRecord = {
      pid: parsed.pid,
      port: parsed.port,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
    };
    if (parsed.env && typeof parsed.env === 'object') {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed.env)) {
        if (typeof value === 'string') {
          env[key] = value;
        }
      }
      record.env = env;
    }
    return record;
  } catch {
    return undefined;
  }
}
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
function writePidRecord(home: string, name: string, record: PidRecord): void {
  mkdirSync(runDir(home), { recursive: true });
  writeFileSync(pidFilePath(home, name), JSON.stringify(record));
}
export function removePidFile(home: string, name: string): void {
  rmSync(pidFilePath(home, name), { force: true });
}
export function spawnDetached(options: {
  bin: string;
  env: Record<string, string>;
  home: string;
  name: string;
  port: number;
  recordEnv?: Record<string, string>;
}): number {
  mkdirSync(logsDir(options.home), { recursive: true });
  const logFd = openSync(logFilePath(options.home, options.name), 'a');
  try {
    const child = Bun.spawn([options.bin], {
      env: { ...process.env, ...options.env },
      stdin: 'ignore',
      stdout: logFd,
      stderr: logFd,
    });
    child.unref();
    writePidRecord(options.home, options.name, {
      pid: child.pid,
      port: options.port,
      startedAt: new Date().toISOString(),
      env: options.recordEnv,
    });
    return child.pid;
  } finally {
    closeSync(logFd);
  }
}
async function killPid(pid: number, timeoutMs: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (isPidAlive(pid) && Date.now() < deadline) {
    await sleep(200);
  }
  if (isPidAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
}
export async function terminate(
  home: string,
  name: string,
  timeoutMs = 8000,
): Promise<'stopped' | 'not-running'> {
  const record = readPidRecord(home, name);
  if (!record) {
    return 'not-running';
  }
  if (isPidAlive(record.pid)) {
    await killPid(record.pid, timeoutMs);
  }
  removePidFile(home, name);
  return 'stopped';
}
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export function tailLines(home: string, name: string, maxLines: number): string[] {
  const path = logFilePath(home, name);
  if (!existsSync(path)) {
    return [];
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.slice(-maxLines);
}
export function followFile(path: string, onChunk: (chunk: string) => void): () => void {
  let offset = existsSync(path) ? statSync(path).size : 0;
  let stopped = false;
  const tick = async () => {
    while (!stopped) {
      try {
        if (existsSync(path)) {
          const size = statSync(path).size;
          if (size > offset) {
            const text = await Bun.file(path).slice(offset, size).text();
            offset = size;
            onChunk(text);
          } else if (size < offset) {
            offset = 0;
          }
        }
      } catch {}
      await sleep(400);
    }
  };
  void tick();
  return () => {
    stopped = true;
  };
}
