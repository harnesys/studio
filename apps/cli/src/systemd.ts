import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { harnesysHome, resolveBinDir, resolveStaticDir, SERVER_BIN, WEB_BIN } from './paths.ts';
export type SystemdOptions = {
  hostPort: number;
  webPort: number;
  includeWeb?: boolean;
};
export function userUnitDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) {
    return join(xdg, 'systemd', 'user');
  }
  return join(homedir(), '.config', 'systemd', 'user');
}
export function unitName(name: 'server' | 'webui'): string {
  return name === 'server' ? 'harnesys-host.service' : 'harnesys-web.service';
}
export function systemctlAvailable(): boolean {
  return process.platform === 'linux' && Bun.which('systemctl') !== null;
}
export function isUnitActive(name: 'server' | 'webui'): boolean {
  if (!systemctlAvailable()) {
    return false;
  }
  const probe = Bun.spawnSync(['systemctl', '--user', 'is-active', unitName(name)], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });
  return probe.exitCode === 0 && probe.stdout.toString().trim() === 'active';
}
function runSystemctl(args: string[]): boolean {
  const run = Bun.spawnSync(['systemctl', '--user', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return run.exitCode === 0;
}
export function restartUnit(name: 'server' | 'webui'): boolean {
  return runSystemctl(['restart', unitName(name)]);
}
export function stopUnit(name: 'server' | 'webui'): boolean {
  return runSystemctl(['stop', unitName(name)]);
}
function unitText(
  description: string,
  bin: string,
  env: [string, string][],
  unitLines: string[],
): string {
  const envLines = env.map(([key, value]) => `Environment="${key}=${value}"`).join('\n');
  const extraUnit = unitLines.length > 0 ? `${unitLines.join('\n')}\n` : '';
  return `\
[Unit]
Description=${description}
${extraUnit}[Service]
ExecStart=${bin}
${envLines}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`;
}
export function renderUnits(options: SystemdOptions): {
  host: string;
  web?: string;
} {
  const home = harnesysHome();
  const binDir = resolveBinDir();
  const staticDir = resolveStaticDir();
  const hostEnv: [string, string][] = [
    ['NODE_ENV', 'production'],
    ['HARNESYS_HOME', home],
    ['PORT', String(options.hostPort)],
  ];
  const publicUrl = process.env.PUBLIC_URL?.trim();
  if (publicUrl) {
    hostEnv.push(['PUBLIC_URL', publicUrl]);
  }
  const host = unitText('harnesys host API', join(binDir, SERVER_BIN), hostEnv, []);
  if (options.includeWeb === false) {
    return { host };
  }
  const web = unitText(
    'harnesys web UI',
    join(binDir, WEB_BIN),
    [
      ['NODE_ENV', 'production'],
      ['HARNESYS_HOME', home],
      ['WEB_PORT', String(options.webPort)],
      ['UPSTREAM', `http://127.0.0.1:${options.hostPort}`],
      ['STATIC_DIR', staticDir],
    ],
    ['After=harnesys-host.service', 'StartLimitIntervalSec=0'],
  );
  return { host, web };
}
export function installSystemdUnits(options: SystemdOptions): void {
  const units = renderUnits(options);
  const unitDir = userUnitDir();
  if (process.platform !== 'linux') {
    console.log(`# would write: ${join(unitDir, 'harnesys-host.service')}`);
    console.log(units.host);
    if (units.web) {
      console.log(`# would write: ${join(unitDir, 'harnesys-web.service')}`);
      console.log(units.web);
    }
    console.error('harnesys: systemd is unavailable on this platform — units printed above only');
    return;
  }
  mkdirSync(unitDir, { recursive: true });
  writeFileSync(join(unitDir, 'harnesys-host.service'), units.host);
  if (units.web) {
    writeFileSync(join(unitDir, 'harnesys-web.service'), units.web);
  }
  const reload = Bun.spawnSync(['systemctl', '--user', 'daemon-reload']);
  if (reload.exitCode !== 0) {
    console.error(`harnesys: systemctl --user daemon-reload failed (exit ${reload.exitCode})`);
    process.exit(1);
  }
  const enableTargets = units.web
    ? ['harnesys-host.service', 'harnesys-web.service']
    : ['harnesys-host.service'];
  const enable = Bun.spawnSync(['systemctl', '--user', 'enable', '--now', ...enableTargets], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (enable.exitCode !== 0) {
    console.error(`harnesys: systemctl --user enable --now failed (exit ${enable.exitCode})`);
    process.exit(1);
  }
  console.log(`ok systemd — ${enableTargets.join(', ')} enabled and started`);
}
