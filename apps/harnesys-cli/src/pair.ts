import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOST_DEFAULT_PORT, harnesysHome } from './paths.ts';
import { readPidRecord } from './processes.ts';

/** Same resolution rule as the web gate: HOST_TOKEN env, else `host.token` in config.json. */
export function readHostToken(home: string): string | undefined {
  const fromEnv = process.env.HOST_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const path = join(home, 'config.json');
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { host?: { token?: unknown } };
    const token = parsed.host?.token;
    if (typeof token !== 'string' || token.trim() === '') {
      return undefined;
    }
    return token.trim();
  } catch {
    return undefined;
  }
}

function fail(message: string): never {
  console.error(`harnesys: ${message}`);
  process.exit(1);
}

/**
 * `host pair [--port N]`: starts a pairing challenge on the local host.
 * The 6-digit code comes from the API response (the host returns { code, expiresAt });
 * the port is --port > running server's recorded port > 3000.
 */
export async function commandPair(portOverride: number | undefined): Promise<void> {
  const home = harnesysHome();
  const token = readHostToken(home);
  if (!token) {
    fail(`no host token — set "host.token" in ${join(home, 'config.json')} or HOST_TOKEN`);
  }
  const port = portOverride ?? readPidRecord(home, 'server')?.port ?? HOST_DEFAULT_PORT;
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/api/host/pair/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    fail(`host is not reachable on http://127.0.0.1:${port} — start it with \`harnesys up\``);
  }
  if (response.status === 401) {
    fail(`host rejected the token (${join(home, 'config.json')} host.token)`);
  }
  if (!response.ok) {
    fail(`pair/start failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { code?: unknown; expiresAt?: unknown };
  if (typeof body.code !== 'string' || typeof body.expiresAt !== 'string') {
    fail(`unexpected pair/start response: ${JSON.stringify(body).slice(0, 120)}`);
  }
  const expiresMs = Date.parse(body.expiresAt);
  const ttlMin = Number.isFinite(expiresMs)
    ? Math.max(0, Math.round((expiresMs - Date.now()) / 60_000))
    : undefined;
  console.log(`pairing code: ${body.code}`);
  console.log(
    ttlMin === undefined
      ? `expires at ${body.expiresAt}`
      : `expires at ${body.expiresAt} (in ${ttlMin} min)`,
  );
}
