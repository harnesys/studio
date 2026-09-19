import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type ComponentName,
  componentBin,
  componentEnv,
  componentHealthUrl,
  componentUrl,
  parseTargetOrUndefined,
  portOf,
  resolveComponentBin,
} from './components.ts';
import { waitHealthy } from './health.ts';
import {
  ensureStateDirs,
  HOST_DEFAULT_PORT,
  harnesysHome,
  resolveBinDir,
  resolveStaticDir,
  WEB_DEFAULT_PORT,
} from './paths.ts';
import {
  isPidAlive,
  type PidRecord,
  readPidRecord,
  spawnDetached,
  tailLines,
  terminate,
} from './processes.ts';
import { isUnitActive, restartUnit, stopUnit, unitName } from './systemd.ts';
export type UpOptions = {
  hostPort: number;
  webPort: number;
  withUi: boolean;
};
const STATUS_HEALTH_TIMEOUT_MS = 3000;
type StartContext = {
  home: string;
  hostPort: number;
  webPort: number;
};
function fail(message: string): never {
  console.error(`harnesys: ${message}`);
  process.exit(1);
}
function parseTarget(target: string | undefined): ComponentName[] {
  const names = parseTargetOrUndefined(target);
  if (!names) {
    return fail(`unknown target "${target}" — expected server | webui | all`);
  }
  return names;
}
export function effectiveStaticDir(previous: PidRecord | undefined): string {
  const explicit = process.env.STATIC_DIR?.trim();
  if (explicit) {
    return resolve(explicit);
  }
  return previous?.env?.STATIC_DIR ?? resolveStaticDir();
}
export function staticDirAvailable(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
function requireStaticDir(dir: string): void {
  if (staticDirAvailable(dir)) {
    return;
  }
  fail(
    `WebUI static assets not found at ${dir} — the WebUI needs a repo checkout (\`bun run build:client\`) or the Docker compose stack (\`deploy/\`); this install can run the host only`,
  );
}
async function startComponent(
  name: ComponentName,
  context: StartContext,
  previous: PidRecord | undefined,
): Promise<'started' | 'already-running'> {
  if (isUnitActive(name)) {
    console.log(`${name.padEnd(5)} already running (systemd unit)`);
    return 'already-running';
  }
  const record = readPidRecord(context.home, name);
  if (record && isPidAlive(record.pid)) {
    console.log(
      `${name.padEnd(5)} already running → ${componentUrl(record.port)} (pid ${record.pid})`,
    );
    return 'already-running';
  }
  const bin = resolveComponentBin(name);
  if (!bin) {
    fail(
      `${componentBin(name)} not found in ${resolveBinDir()} — build it (\`bun run build:host\`, \`bun run build:web\`)`,
    );
  }
  const port = portOf(name, context);
  const env = componentEnv(name, context);
  if (name === 'webui' && !process.env.STATIC_DIR?.trim() && previous?.env?.STATIC_DIR) {
    env.STATIC_DIR = previous.env.STATIC_DIR;
  }
  const pid = spawnDetached({
    bin,
    env,
    home: context.home,
    name,
    port,
    recordEnv: env,
  });
  const healthy = await waitHealthy(componentHealthUrl(name, port));
  if (!healthy) {
    await terminate(context.home, name);
    console.error(`\n${name} did not become healthy on :${port} — last log lines:`);
    for (const line of tailLines(context.home, name, 15)) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }
  console.log(`ok ${name.padEnd(5)} → ${componentUrl(port)} (pid ${pid})`);
  return 'started';
}
export async function commandUp(
  options: UpOptions & {
    installSystemd: boolean;
  },
  runSystemd: () => void | Promise<void>,
): Promise<void> {
  if (options.installSystemd) {
    await runSystemd();
    return;
  }
  const home = harnesysHome();
  ensureStateDirs(home);
  const context: StartContext = { home, hostPort: options.hostPort, webPort: options.webPort };
  const previousServer = readPidRecord(home, 'server');
  const previousWeb = readPidRecord(home, 'webui');
  if (options.withUi) {
    requireStaticDir(effectiveStaticDir(previousWeb));
  }
  await startComponent('server', context, previousServer);
  if (options.withUi) {
    await startComponent('webui', context, previousWeb);
  }
}
export async function commandDown(): Promise<void> {
  const home = harnesysHome();
  for (const name of ['webui', 'server'] as const) {
    if (isUnitActive(name)) {
      if (!stopUnit(name)) {
        fail(`systemctl --user stop ${unitName(name)} failed`);
      }
      console.log(`stopped ${name.padEnd(5)} (systemd unit)`);
      continue;
    }
    const record = readPidRecord(home, name);
    const wasAlive = record !== undefined && isPidAlive(record.pid);
    const result = await terminate(home, name);
    if (result === 'not-running') {
      console.log(`${name.padEnd(5)} is not running`);
    } else if (wasAlive) {
      console.log(`stopped ${name.padEnd(5)} (was pid ${record?.pid ?? '?'})`);
    } else {
      console.log(`stopped ${name.padEnd(5)} (was not running — stale pidfile removed)`);
    }
  }
}
export async function commandStatus(): Promise<void> {
  const home = harnesysHome();
  const rows: string[][] = [['component', 'pid', 'port', 'state']];
  for (const name of ['server', 'webui'] as const) {
    const record = readPidRecord(home, name);
    if (isUnitActive(name)) {
      const port = record?.port ?? (name === 'server' ? HOST_DEFAULT_PORT : WEB_DEFAULT_PORT);
      rows.push([name, '-', String(port), 'running (systemd)']);
      continue;
    }
    if (!record) {
      rows.push([name, '-', '-', 'stopped']);
      continue;
    }
    if (!isPidAlive(record.pid)) {
      rows.push([name, String(record.pid), String(record.port), 'dead']);
      continue;
    }
    const healthy = await waitHealthy(
      componentHealthUrl(name, record.port),
      STATUS_HEALTH_TIMEOUT_MS,
    );
    rows.push([name, String(record.pid), String(record.port), healthy ? 'running' : 'unhealthy']);
  }
  const widths = rows[0].map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length)),
  );
  for (const [index, row] of rows.entries()) {
    const line = row.map((cell, column) => cell.padEnd(widths[column])).join('  ');
    console.log(index === 0 ? line : line.trimEnd());
  }
}
function portFromUpstream(upstream: string | undefined): number | undefined {
  if (!upstream) {
    return undefined;
  }
  try {
    const port = Number(new URL(upstream).port);
    return port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}
export async function commandRestart(
  target: string | undefined,
  ports: {
    port?: number;
    webPort?: number;
  },
): Promise<void> {
  const home = harnesysHome();
  ensureStateDirs(home);
  const names = parseTarget(target);
  const previousServer = readPidRecord(home, 'server');
  const previousWeb = readPidRecord(home, 'webui');
  const serverSystemd = names.includes('server') && isUnitActive('server');
  const webSystemd = names.includes('webui') && isUnitActive('webui');
  const hostPort =
    ports.port ?? previousServer?.port ?? portFromUpstream(previousWeb?.env?.UPSTREAM);
  const webPort = ports.webPort ?? previousWeb?.port;
  if (names.includes('server') && !serverSystemd && hostPort === undefined) {
    fail('no previous server state — run `harnesys up` first (or pass --port N)');
  }
  if (names.includes('webui') && !webSystemd && (webPort === undefined || hostPort === undefined)) {
    fail('no previous webui state — run `harnesys up` first (or pass --port/--web-port)');
  }
  const context: StartContext = {
    home,
    hostPort: hostPort ?? HOST_DEFAULT_PORT,
    webPort: webPort ?? WEB_DEFAULT_PORT,
  };
  if (names.includes('webui') && !webSystemd) {
    requireStaticDir(effectiveStaticDir(previousWeb));
  }
  for (const name of names) {
    if ((name === 'server' && serverSystemd) || (name === 'webui' && webSystemd)) {
      if (!restartUnit(name)) {
        fail(`systemctl --user restart ${unitName(name)} failed`);
      }
      console.log(`restarted ${name.padEnd(5)} (systemd unit)`);
      continue;
    }
    await terminate(home, name);
    await startComponent(name, context, name === 'server' ? previousServer : previousWeb);
  }
}
export async function restartRunningComponents(): Promise<ComponentName[]> {
  const home = harnesysHome();
  const alive = new Map<ComponentName, PidRecord>();
  for (const name of ['server', 'webui'] as const) {
    if (isUnitActive(name)) {
      continue;
    }
    const record = readPidRecord(home, name);
    if (record && isPidAlive(record.pid)) {
      alive.set(name, record);
    }
  }
  if (alive.size === 0) {
    return [];
  }
  const hostPort = alive.get('server')?.port ?? portFromUpstream(alive.get('webui')?.env?.UPSTREAM);
  const webPort = alive.get('webui')?.port;
  if (hostPort === undefined) {
    fail('recorded state is incomplete — run `harnesys down` and `harnesys up` again');
  }
  if (alive.has('webui') && webPort === undefined) {
    fail('recorded webui state is incomplete — run `harnesys down` and `harnesys up` again');
  }
  const context: StartContext = {
    home,
    hostPort: hostPort ?? HOST_DEFAULT_PORT,
    webPort: webPort ?? WEB_DEFAULT_PORT,
  };
  if (alive.has('webui')) {
    requireStaticDir(effectiveStaticDir(alive.get('webui')));
  }
  const restarted: ComponentName[] = [];
  for (const name of ['server', 'webui'] as const) {
    const previous = alive.get(name);
    if (!previous) {
      continue;
    }
    await terminate(home, name);
    await startComponent(name, context, previous);
    restarted.push(name);
  }
  return restarted;
}
