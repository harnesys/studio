import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export type WebConfig = {
  port: number;
  upstream: URL;
  staticDir: string;
  token: string;
  harnesysHome: string;
};

function fail(message: string): never {
  console.error(`harnesys-web: ${message}`);
  process.exit(1);
}

function readPort(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readUpstream(raw: string | undefined): URL {
  const value = raw?.trim() || 'http://127.0.0.1:47474';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`unsupported protocol ${url.protocol}`);
    }
    return url;
  } catch (error) {
    return fail(`UPSTREAM is not a valid http(s) URL "${value}" (${String(error)})`);
  }
}

function readStaticDir(raw: string | undefined): string {
  if (!raw?.trim()) {
    return fail('STATIC_DIR is required: point it at the built client dist directory');
  }
  const dir = resolve(raw.trim());
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return fail(`STATIC_DIR does not exist or is not a directory: ${dir}`);
  }
  return dir;
}

function readHarnesysHome(): string {
  return process.env.HARNESYS_HOME?.trim() || join(homedir(), '.harnesys');
}

function readTokenFromConfig(home: string): string | undefined {
  try {
    const raw = readFileSync(join(home, 'config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { host?: { token?: unknown } };
    const token = parsed.host?.token;
    if (typeof token !== 'string' || token.trim() === '') {
      return undefined;
    }
    return token.trim();
  } catch {
    return undefined;
  }
}

function readToken(home: string): string {
  const fromEnv = process.env.HOST_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const fromConfig = readTokenFromConfig(home);
  if (fromConfig) {
    return fromConfig;
  }
  return fail(
    `no access token found: set HOST_TOKEN or "host.token" in ${join(home, 'config.json')}`,
  );
}

/** Reads and validates WEB_PORT / UPSTREAM / STATIC_DIR / HOST_TOKEN / HARNESYS_HOME. */
export function loadConfig(): WebConfig {
  const harnesysHome = readHarnesysHome();
  return {
    port: readPort(process.env.WEB_PORT, 8080),
    upstream: readUpstream(process.env.UPSTREAM),
    staticDir: readStaticDir(process.env.STATIC_DIR),
    token: readToken(harnesysHome),
    harnesysHome,
  };
}
