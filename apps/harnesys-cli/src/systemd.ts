import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { harnesysHome, resolveBinDir, resolveStaticDir, SERVER_BIN, WEB_BIN } from './paths.ts';

export type SystemdOptions = {
  hostPort: number;
  webPort: number;
};

function unitText(description: string, bin: string, env: [string, string][]): string {
  const envLines = env.map(([key, value]) => `Environment=${key}=${value}`).join('\n');
  return `\
[Unit]
Description=${description}

[Service]
ExecStart=${bin}
${envLines}
Restart=on-failure

[Install]
WantedBy=default.target
`;
}

export function renderUnits(options: SystemdOptions): { host: string; web: string } {
  const home = harnesysHome();
  const binDir = resolveBinDir();
  const staticDir = resolveStaticDir();
  const host = unitText('harnesys host API', join(binDir, SERVER_BIN), [
    ['HARNESYS_HOME', home],
    ['PORT', String(options.hostPort)],
  ]);
  const web = unitText('harnesys web UI', join(binDir, WEB_BIN), [
    ['HARNESYS_HOME', home],
    ['WEB_PORT', String(options.webPort)],
    ['UPSTREAM', `http://127.0.0.1:${options.hostPort}`],
    ['STATIC_DIR', staticDir],
  ]);
  return { host, web };
}

/**
 * `up --install-systemd`: user-level units, `systemctl --user enable --now`.
 * Off Linux the units are printed with a warning so they stay inspectable everywhere.
 */
export function installSystemdUnits(options: SystemdOptions): void {
  const units = renderUnits(options);
  if (process.platform !== 'linux') {
    console.log(units.host);
    console.log(units.web);
    console.error('harnesys: systemd is unavailable on this platform — units printed above only');
    return;
  }
  const unitDir = join(harnesysHome(), 'systemd', 'user');
  mkdirSync(unitDir, { recursive: true });
  writeFileSync(join(unitDir, 'harnesys-host.service'), units.host);
  writeFileSync(join(unitDir, 'harnesys-web.service'), units.web);
  const reload = Bun.spawnSync(['systemctl', '--user', 'daemon-reload']);
  if (reload.exitCode !== 0) {
    console.error(`harnesys: systemctl --user daemon-reload failed (exit ${reload.exitCode})`);
    process.exit(1);
  }
  const enable = Bun.spawnSync(
    ['systemctl', '--user', 'enable', '--now', 'harnesys-host.service', 'harnesys-web.service'],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (enable.exitCode !== 0) {
    console.error(`harnesys: systemctl --user enable --now failed (exit ${enable.exitCode})`);
    process.exit(1);
  }
  console.log('ok systemd — harnesys-host.service, harnesys-web.service enabled and started');
}
