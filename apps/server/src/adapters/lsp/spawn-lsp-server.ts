import { isAbsolute, resolve } from 'node:path';
import type { LspServerSpec } from 'harnesys';
export function lspServerRoot(config: LspServerSpec, workspaceRoot: string): string {
  if (config.workspaceFolder === undefined || config.workspaceFolder.length === 0) {
    return workspaceRoot;
  }
  return isAbsolute(config.workspaceFolder)
    ? config.workspaceFolder
    : resolve(workspaceRoot, config.workspaceFolder);
}
export function spawnServer(config: LspServerSpec, root: string): ReturnType<typeof Bun.spawn> {
  const args = config.args ?? [];
  const argv = commandExists(config.command)
    ? [config.command, ...args]
    : ['bunx', '--bun', config.command, ...args];
  return Bun.spawn(argv, {
    cwd: root,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: spawnEnv(config),
  });
}
function spawnEnv(config: LspServerSpec): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  Object.assign(env, config.env);
  return env;
}
function commandExists(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    return true;
  }
  const result = Bun.spawnSync(['which', command], { stdout: 'pipe', stderr: 'pipe' });
  return result.exitCode === 0;
}
