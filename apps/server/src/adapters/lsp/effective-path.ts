import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const COMMON_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '~/.bun/bin', '~/.local/bin'];
const LOGIN_SHELL_TIMEOUT_MS = 3000;
const MAX_PATH_LENGTH = 8192;

let cached: string | undefined;

export function userPath(): string {
  cached ??= resolveUserPath();
  return cached;
}

export function hasBinary(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    return isExecutable(command);
  }
  for (const dir of userPath().split(delimiter)) {
    if (dir.length > 0 && isExecutable(join(dir, command))) {
      return true;
    }
  }
  return false;
}

function resolveUserPath(): string {
  const segments = (loginShellPath() ?? process.env.PATH ?? '').split(delimiter);
  const known = new Set(segments);
  const home = homedir();
  for (const dir of COMMON_BIN_DIRS) {
    const expanded = dir.startsWith('~') ? join(home, dir.slice(1)) : dir;
    if (!known.has(expanded)) {
      segments.push(expanded);
    }
  }
  return segments.filter((dir) => dir.length > 0).join(delimiter);
}

function loginShellPath(): string | undefined {
  if (process.platform === 'win32' || !process.env.SHELL) {
    return undefined;
  }
  try {
    const result = Bun.spawnSync([process.env.SHELL, '-l', '-c', 'printf %s "$PATH"'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: LOGIN_SHELL_TIMEOUT_MS,
    });
    const text = result.stdout?.toString().trim();
    if (
      result.exitCode !== 0 ||
      !text ||
      text.includes('\n') ||
      !text.includes(delimiter) ||
      text.length > MAX_PATH_LENGTH
    ) {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
