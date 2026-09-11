import path from 'node:path';
import type {
  RunPluginHookCommandOptions,
  RunPluginHookCommandResult,
} from '../../ports/plugins.ts';
import { expandPluginVars } from './expand-plugin-vars.ts';

type SpawnHookCommandOptions = {
  command: string;
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
};

const STDERR_ERROR_MAX = 2000;

/**
 * Claude-compat hook commands execute with `bash -lc` under trust.
 * AP future hooks should prefer argv arrays when we add them.
 */
export async function runPluginHookCommand(
  options: RunPluginHookCommandOptions,
): Promise<RunPluginHookCommandResult> {
  const pluginRoot = path.resolve(options.pluginRoot);
  const pluginData = path.resolve(options.pluginData);
  const command = expandPluginVars(options.command, { pluginRoot, pluginData });
  try {
    return await spawnHookCommand({
      command,
      cwd: pluginRoot,
      env: hookEnv(pluginRoot, pluginData, options.envExtra),
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function spawnHookCommand(
  options: SpawnHookCommandOptions,
): Promise<RunPluginHookCommandResult> {
  const proc = Bun.spawn(['bash', '-lc', options.command], {
    cwd: options.cwd,
    env: options.env,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    detached: true,
  });
  let timedOut = false;
  const stop = (): void => {
    killProcessGroup(proc.pid);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, options.timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (timedOut) {
      return { ok: false, error: `hook timed out after ${options.timeoutMs}ms` };
    }
    if (exitCode !== 0) {
      return { ok: false, error: hookExitError(exitCode, stderr) };
    }
    return { ok: true, stdout };
  } finally {
    clearTimeout(timer);
  }
}

function hookEnv(
  pluginRoot: string,
  pluginData: string,
  envExtra: Record<string, string> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (envExtra !== undefined) {
    Object.assign(env, envExtra);
  }
  env.PLUGIN_ROOT = pluginRoot;
  env.PLUGIN_DATA = pluginData;
  env.CLAUDE_PLUGIN_ROOT = pluginRoot;
  return env;
}

function hookExitError(exitCode: number, stderr: string): string {
  const detail = stderr.trim();
  if (detail.length === 0) {
    return `hook exited ${exitCode}`;
  }
  if (detail.length <= STDERR_ERROR_MAX) {
    return `hook exited ${exitCode}: ${detail}`;
  }
  return `hook exited ${exitCode}: ${detail.slice(0, STDERR_ERROR_MAX)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}

function killProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return;
    }
  }
}
