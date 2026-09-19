import {
  HOST_DEFAULT_PORT,
  resolveBinPath,
  resolveStaticDir,
  WEB_BIN,
  WEB_DEFAULT_PORT,
} from './paths.ts';
import type { PidRecord } from './processes.ts';

export type ComponentName = 'server' | 'webui';

export const COMPONENT_NAMES: readonly ComponentName[] = ['server', 'webui'];

export function isComponentName(value: string): value is ComponentName {
  return value === 'server' || value === 'webui';
}

export function componentBin(name: ComponentName): string {
  return name === 'server' ? 'harnesys-host' : WEB_BIN;
}

export function componentLabel(name: ComponentName): string {
  return name === 'server' ? 'server (harnesys-host)' : 'webui (harnesys-web)';
}

export function componentHealthUrl(name: ComponentName, port: number): string {
  return name === 'server' ? `http://127.0.0.1:${port}/health` : `http://127.0.0.1:${port}/healthz`;
}

export function componentUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** Spawn env for a component; HARNESYS_HOME is always pinned so children share the CLI's home. */
export function componentEnv(
  name: ComponentName,
  context: { home: string; hostPort: number; webPort: number },
): Record<string, string> {
  const env: Record<string, string> = {
    HARNESYS_HOME: context.home,
  };
  if (name === 'server') {
    env.PORT = String(context.hostPort);
  } else {
    env.WEB_PORT = String(context.webPort);
    env.UPSTREAM = `http://127.0.0.1:${context.hostPort}`;
    env.STATIC_DIR = resolveStaticDir();
  }
  return env;
}

export function resolveComponentBin(name: ComponentName): string | undefined {
  return resolveBinPath(componentBin(name));
}

export function portOf(
  name: ComponentName,
  context: { hostPort: number; webPort: number },
): number {
  return name === 'server' ? context.hostPort : context.webPort;
}

/** The port recorded in the pidfile wins: it is what the process was actually started with. */
export function portFromRecord(name: ComponentName, record: PidRecord | undefined): number {
  if (name === 'server') {
    return record?.port ?? HOST_DEFAULT_PORT;
  }
  return record?.port ?? WEB_DEFAULT_PORT;
}
