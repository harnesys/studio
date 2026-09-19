import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
export const SERVER_BIN = 'harnesys-host';
export const WEB_BIN = 'harnesys-web';
export const HOST_DEFAULT_PORT = 47474;
export const WEB_DEFAULT_PORT = 8080;
export function harnesysHome(): string {
  return process.env.HARNESYS_HOME?.trim() || join(homedir(), '.harnesys');
}
export function runDir(home: string): string {
  return join(home, 'run');
}
export function logsDir(home: string): string {
  return join(home, 'logs');
}
export function ensureStateDirs(home: string): void {
  mkdirSync(runDir(home), { recursive: true });
  mkdirSync(logsDir(home), { recursive: true });
}
export function pidFilePath(home: string, name: string): string {
  return join(runDir(home), `${name}.pid`);
}
export function logFilePath(home: string, name: string): string {
  return join(logsDir(home), `${name}.log`);
}
export function isCompiled(): boolean {
  return Bun.main.includes('$bunfs');
}
export function repoRoot(): string {
  return resolve(dirname(Bun.main), '..', '..', '..');
}
export function resolveBinDir(): string {
  const override = process.env.HARNESYS_BIN_DIR?.trim();
  if (override) {
    return resolve(override);
  }
  if (isCompiled()) {
    return dirname(process.execPath);
  }
  return join(repoRoot(), 'build');
}
export function resolveBinPath(name: string): string | undefined {
  const local = join(resolveBinDir(), name);
  if (existsSync(local)) {
    return local;
  }
  return Bun.which(name) ?? undefined;
}
export function resolveStaticDir(): string {
  const override = process.env.STATIC_DIR?.trim();
  if (override) {
    return resolve(override);
  }
  if (isCompiled()) {
    return join(resolveBinDir(), 'client-dist');
  }
  return join(repoRoot(), 'apps', 'webui', 'dist');
}
