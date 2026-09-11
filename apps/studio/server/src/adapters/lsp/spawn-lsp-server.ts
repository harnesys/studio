import type { PluginLspServer } from 'harnesys';

export function spawnServer(config: PluginLspServer, cwd: string): ReturnType<typeof Bun.spawn> {
  const argv = commandExists(config.command)
    ? [config.command, ...config.args]
    : ['bunx', '--bun', config.command, ...config.args];
  return Bun.spawn(argv, {
    cwd,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
}

function commandExists(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    return true;
  }
  const result = Bun.spawnSync(['which', command], { stdout: 'pipe', stderr: 'pipe' });
  return result.exitCode === 0;
}
