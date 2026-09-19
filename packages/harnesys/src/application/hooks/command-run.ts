import path from 'node:path';
import type {
  HookCommandShell,
  HookEventName,
  HookHandler,
  HookPayload,
} from '../../domain/hook.ts';
import type { ConfigError, UserConfigContentOptions } from '../plugins/user-config.ts';
import { substituteUserConfig } from '../plugins/user-config.ts';
import type { HookRuntimeCtx } from './bus.ts';
import { appendCapturedOutput, mapCommandExit } from './claude-output.ts';
import type {
  HookHandlerResult,
  HookHandlerVars,
  HookKillSource,
  HookProcessEntry,
} from './executors.ts';

const DEFAULT_TIMEOUT_S_USER_PROMPT = 30;
const DEFAULT_TIMEOUT_S = 600;
const BASH_FAMILY = new Set(['bash', 'zsh', 'sh']);
const COMMAND_PLACEHOLDERS = [
  '${' + 'CLAUDE_PLUGIN_ROOT}',
  '${' + 'CLAUDE_PLUGIN_DATA}',
  '${' + 'CLAUDE_PROJECT_DIR}',
];
const SHELL_METACHARS: string = '|&;<>$`*?[](){}\\';
export async function runCommand(
  h: Extract<
    HookHandler,
    {
      type: 'command';
    }
  >,
  payload: HookPayload,
  ctx: HookRuntimeCtx,
  vars: HookHandlerVars,
): Promise<HookHandlerResult> {
  const resolved = resolveCommandHandler(h, vars.userConfig);
  if (resolved.handler === undefined) {
    return {
      effects: [],
      diagnostics: [
        {
          level: 'warning',
          code: 'invalid_command_form',
          message: `user_config: ${resolved.error}`,
        },
      ],
    };
  }
  const timeoutS = h.timeoutS ?? defaultTimeoutS(payload.event, 'command');
  const spawnOptions: HookSpawnOptions = {
    cwd: vars.pluginRoot,
    env: hookProcessEnv(ctx, vars, resolved.handler.env),
  };
  let proc: Bun.Subprocess<'pipe', 'pipe', 'pipe'>;
  try {
    const shellForm = resolved.handler.args === undefined ? resolved.handler.shell : undefined;
    if (shellForm !== undefined) {
      proc = spawnHookShell(
        shellForm,
        expandCommandPlaceholders(resolved.handler.command, vars),
        spawnOptions,
      );
    } else {
      const argv = buildCommandArgv(resolved.handler, vars);
      if (argv === undefined) {
        return {
          effects: [],
          diagnostics: [
            {
              level: 'warning',
              code: 'invalid_command_form',
              message: `команда не разбирается без шелла: ${h.command}`,
            },
          ],
        };
      }
      proc = spawnHookCommand(argv, spawnOptions);
    }
  } catch (error) {
    return {
      effects: [],
      diagnostics: [
        {
          level: 'warning',
          code: 'hook_failed',
          message: `spawn хука не удался: ${errorMessage(error)}`,
        },
      ],
    };
  }
  let killSource: HookKillSource | undefined;
  const kill = (source: HookKillSource): void => {
    killSource = source;
    killProcessGroup(proc.pid);
  };
  const entry: HookProcessEntry = { pid: proc.pid, kill, done: proc.exited };
  vars.registry?.add(entry);
  const onAbort = (): void => kill('abort');
  vars.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => kill('timeout'), timeoutS * 1000);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      writeStdinAndAwaitExit(proc, JSON.stringify(toStdinPayload(payload))),
    ]);
    if (killSource === 'timeout') {
      const message = appendCapturedOutput(`hook timed out after ${timeoutS}s`, stdout, stderr);
      return {
        effects: [],
        diagnostics: [{ level: 'warning', code: 'hook_timeout', message }],
      };
    }
    if (killSource === 'abort' || killSource === 'close') {
      return { effects: [], diagnostics: [] };
    }
    return mapCommandExit({ event: payload.event, exitCode, stdout, stderr });
  } finally {
    clearTimeout(timer);
    vars.signal?.removeEventListener('abort', onAbort);
    vars.registry?.remove(entry);
    await proc.exited;
  }
}
async function writeStdinAndAwaitExit(
  proc: Bun.Subprocess<'pipe', 'pipe', 'pipe'>,
  stdinJson: string,
): Promise<number | null> {
  try {
    proc.stdin.write(stdinJson);
    await proc.stdin.end();
  } catch {}
  return await proc.exited;
}
function buildCommandArgv(
  h: Extract<
    HookHandler,
    {
      type: 'command';
    }
  >,
  vars: HookHandlerVars,
): string[] | undefined {
  if (h.args !== undefined) {
    return [
      expandCommandPlaceholders(h.command, vars),
      ...h.args.map((arg) => expandCommandPlaceholders(arg, vars)),
    ];
  }
  const tokens = tokenizeCommand(h.command);
  if (tokens === undefined) {
    return undefined;
  }
  return tokens.map((token) => expandCommandPlaceholders(token, vars));
}
type CommandHandler = Extract<
  HookHandler,
  {
    type: 'command';
  }
>;
type ResolvedCommandHandler =
  | {
      handler: CommandHandler;
      error?: undefined;
    }
  | {
      handler?: undefined;
      error: string;
    };
function resolveCommandHandler(
  h: CommandHandler,
  userConfig: UserConfigContentOptions | undefined,
): ResolvedCommandHandler {
  if (userConfig === undefined) {
    return { handler: h };
  }
  const substitute = (value: string): string | ConfigError =>
    substituteUserConfig(value, userConfig.values, userConfig.sensitiveKeys);
  const command = substitute(h.command);
  if (typeof command !== 'string') {
    return { error: command.message };
  }
  let args: string[] | undefined;
  if (h.args !== undefined) {
    args = [];
    for (const arg of h.args) {
      const substituted = substitute(arg);
      if (typeof substituted !== 'string') {
        return { error: substituted.message };
      }
      args.push(substituted);
    }
  }
  let env: Record<string, string> | undefined;
  if (h.env !== undefined) {
    env = {};
    for (const [key, value] of Object.entries(h.env)) {
      const substituted = substitute(value);
      if (typeof substituted !== 'string') {
        return { error: substituted.message };
      }
      env[key] = substituted;
    }
  }
  return {
    handler: {
      ...h,
      command,
      ...(args !== undefined ? { args } : {}),
      ...(env !== undefined ? { env } : {}),
    },
  };
}
function expandCommandPlaceholders(token: string, vars: HookHandlerVars): string {
  return token
    .replaceAll(COMMAND_PLACEHOLDERS[0] ?? '', vars.pluginRoot)
    .replaceAll(COMMAND_PLACEHOLDERS[1] ?? '', vars.pluginData)
    .replaceAll(COMMAND_PLACEHOLDERS[2] ?? '', vars.projectDir);
}
function tokenizeCommand(command: string): string[] | undefined {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let i = 0;
  while (i < command.length) {
    const ch = command.charAt(i);
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      if (end === -1) {
        return undefined;
      }
      current += command.slice(i + 1, end);
      started = true;
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      const end = command.indexOf('"', i + 1);
      if (end === -1) {
        return undefined;
      }
      current += command.slice(i + 1, end);
      started = true;
      i = end + 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      i++;
      continue;
    }
    const placeholder = COMMAND_PLACEHOLDERS.find((name) => command.startsWith(name, i));
    if (placeholder !== undefined) {
      current += placeholder;
      started = true;
      i += placeholder.length;
      continue;
    }
    if (SHELL_METACHARS.includes(ch)) {
      return undefined;
    }
    current += ch;
    started = true;
    i++;
  }
  if (started) {
    tokens.push(current);
  }
  return tokens;
}
type HookSpawnOptions = {
  cwd: string;
  env: Record<string, string>;
};
function spawnBase(options: HookSpawnOptions) {
  return {
    ...options,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    stdin: 'pipe' as const,
    detached: true,
  };
}
function spawnHookShell(
  shell: HookCommandShell,
  command: string,
  options: HookSpawnOptions,
): Bun.Subprocess<'pipe', 'pipe', 'pipe'> {
  const base = spawnBase(options);
  if (shell === 'powershell') {
    return Bun.spawn(['pwsh', '-NoProfile', '-Command', command], base);
  }
  return Bun.spawn([resolveBashBin(), '-c', command], base);
}
function resolveBashBin(): string {
  const shell = process.env.SHELL;
  if (shell !== undefined && shell.length > 0) {
    const base = path.basename(shell);
    if (BASH_FAMILY.has(base)) {
      return shell;
    }
  }
  return 'bash';
}
function spawnHookCommand(
  argv: string[],
  options: HookSpawnOptions,
): Bun.Subprocess<'pipe', 'pipe', 'pipe'> {
  const base = spawnBase(options);
  try {
    return Bun.spawn(argv, base);
  } catch (error) {
    if (!isExecFormatError(error)) {
      throw error;
    }
    return Bun.spawn([resolveBashBin(), ...argv], base);
  }
}
function isExecFormatError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOEXEC' || code === 'EACCES' || error.message.startsWith('ENOEXEC');
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
function hookProcessEnv(
  ctx: HookRuntimeCtx,
  vars: HookHandlerVars,
  handlerEnv: Record<string, string> | undefined,
): Record<string, string> {
  const env: Record<string, string> = { ...ctx.envBase };
  env.PLUGIN_ROOT = vars.pluginRoot;
  env.PLUGIN_DATA = vars.pluginData;
  env.CLAUDE_PLUGIN_ROOT = vars.pluginRoot;
  env.CLAUDE_PLUGIN_DATA = vars.pluginData;
  env.CLAUDE_PROJECT_DIR = vars.projectDir;
  if (handlerEnv !== undefined) {
    Object.assign(env, handlerEnv);
  }
  return env;
}
export function toStdinPayload(p: HookPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {
    hook_event_name: p.event,
    session_id: p.session_id,
    run_id: p.run_id,
    agent_id: p.agent_id,
    thread_id: p.thread_id,
    cwd: p.cwd,
    permission_mode: p.permission_mode,
  };
  if (p.source !== undefined) {
    out.source = p.source;
  }
  if (p.trigger !== undefined) {
    out.trigger = p.trigger;
  }
  if (p.tool_name !== undefined) {
    out.tool_name = p.tool_name;
  }
  if (p.tool_input !== undefined) {
    out.tool_input = p.tool_input;
  }
  if (p.tool_use_id !== undefined) {
    out.tool_use_id = p.tool_use_id;
  }
  if (p.tool_output !== undefined) {
    out.tool_response = p.tool_output;
  }
  if (p.failure_reason !== undefined) {
    out.error = p.failure_reason;
  }
  if (p.tool_results !== undefined) {
    out.tool_results = p.tool_results;
  }
  if (p.agent_type !== undefined) {
    out.agent_type = p.agent_type;
  }
  if (p.notification !== undefined) {
    out.message = p.notification.text;
    out.notification_type = p.notification.type;
  }
  if (p.file_path !== undefined) {
    out.file_path = p.file_path;
  }
  if (p.model !== undefined) {
    out.model = p.model;
  }
  if (p.usage !== undefined) {
    out.usage = p.usage;
  }
  if (p.node !== undefined) {
    out.node = p.node;
  }
  if (p.reason !== undefined) {
    out.reason = p.reason;
  }
  if (p.message !== undefined) {
    out.prompt = p.message;
  }
  return out;
}
export function defaultTimeoutS(
  event: HookEventName,
  handlerType: 'command' | 'http' | 'mcp_tool' | 'prompt',
): number {
  if (handlerType === 'prompt') {
    return 30;
  }
  return event === 'UserPromptSubmit' ? DEFAULT_TIMEOUT_S_USER_PROMPT : DEFAULT_TIMEOUT_S;
}
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}
