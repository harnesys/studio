import type { HookEffect, HookEventName } from '../../domain/hook.ts';
import type { PluginDiagnostic, PluginDiagnosticCode } from '../../domain/plugin-diagnostics.ts';

/** Строковые значения вывода хука обрезаются до 10 000 символов (спека §2.1). */
export const HOOK_STRING_MAX = 10_000;

const DIAG_OUTPUT_MAX = 2000;

/** Строковые значения вывода command/http/mcp_tool-хука в контракте Claude (спека §2.1). */
export type ClaudeHookJson = {
  continue?: unknown;
  stopReason?: unknown;
  decision?: unknown;
  reason?: unknown;
  systemMessage?: unknown;
  hookSpecificOutput?: unknown;
  watchPaths?: unknown;
  sessionTitle?: unknown;
  initialUserMessage?: unknown;
};

/** sessionTitle переименовывает тред через `HookRuntimeCtx.renameSession`; кап по контракту Claude. */
export const HOOK_TITLE_MAX = 200;

export type ClaudeOutputMapping = {
  effects: HookEffect[];
  diagnostics: PluginDiagnostic[];
  sessionTitle?: string;
};

export type CommandExitInput = {
  event: HookEventName;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

/** Парсинг stdout-JSON; не-объект или невалидный JSON = undefined. */
export function parseClaudeJsonObject(text: string): ClaudeHookJson | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0 || !trimmed.startsWith('{')) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as ClaudeHookJson;
  } catch {
    return undefined;
  }
}

/** Маппинг полей вывода JSON на эффекты (спека §2.1). */
export function mapClaudeJsonFields(out: ClaudeHookJson): ClaudeOutputMapping {
  const effects: HookEffect[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  if (out.watchPaths !== undefined) {
    diagnostics.push(warning('hook_invalid_output', 'watchPaths в выводе хука игнорируется'));
  }
  const sessionTitle = strValue(out.sessionTitle)?.trim();
  if (out.sessionTitle !== undefined && sessionTitle === '') {
    diagnostics.push(warning('hook_invalid_output', 'sessionTitle пустая — тред не переименован'));
  }
  if (out.initialUserMessage !== undefined) {
    diagnostics.push(
      warning('hook_invalid_output', 'initialUserMessage в выводе хука не поддерживается'),
    );
  }
  if (out.decision === 'block') {
    effects.push({ kind: 'block', reason: truncateHookString(strValue(out.reason) ?? '') });
  }
  if (out.continue === false) {
    const reason = strValue(out.stopReason);
    effects.push(
      reason === undefined
        ? { kind: 'stop' }
        : { kind: 'stop', reason: truncateHookString(reason) },
    );
  }
  // systemMessage принимается без эффекта: пользовательского канала в модели эффектов нет
  const hso = out.hookSpecificOutput;
  if (hso !== undefined) {
    if (typeof hso !== 'object' || hso === null || Array.isArray(hso)) {
      diagnostics.push(warning('hook_invalid_output', 'hookSpecificOutput не является объектом'));
    } else {
      mapHookSpecific(hso as Record<string, unknown>, out, effects, diagnostics);
    }
  }
  if (sessionTitle === undefined || sessionTitle === '') {
    return { effects, diagnostics };
  }
  return { effects, diagnostics, sessionTitle: sessionTitle.slice(0, HOOK_TITLE_MAX) };
}

/** Маппинг exit code команды на исход: exit 2 = block, валидный JSON решает на любом коде,
 * plain stdout → context только на UserPromptSubmit/SessionStart (спека §2.1). */
export function mapCommandExit(input: CommandExitInput): ClaudeOutputMapping {
  const parsed = parseClaudeJsonObject(input.stdout);
  if (input.exitCode === 2) {
    const fromJson =
      parsed !== undefined && parsed.decision === 'block' ? strValue(parsed.reason) : undefined;
    const reason = truncateHookString(fromJson ?? input.stderr);
    return { effects: [{ kind: 'block', reason }], diagnostics: [] };
  }
  if (parsed !== undefined) {
    return mapClaudeJsonFields(parsed);
  }
  if (input.exitCode === 0) {
    const text = input.stdout.trim();
    const plainStdout = input.event === 'UserPromptSubmit' || input.event === 'SessionStart';
    if (text.length > 0 && plainStdout) {
      return { effects: [{ kind: 'context', text: truncateHookString(text) }], diagnostics: [] };
    }
    return { effects: [], diagnostics: [] };
  }
  const message = appendCapturedOutput(
    `hook exited ${input.exitCode ?? 'signal'}`,
    input.stdout,
    input.stderr,
  );
  return { effects: [], diagnostics: [warning('hook_failed', message)] };
}

/** Захваченные к моменту убийства stdout/stderr — в сообщение diagnostic (спека §2.2 п.7). */
export function appendCapturedOutput(message: string, stdout: string, stderr: string): string {
  const chunks: string[] = [];
  const trimmedOut = stdout.trim();
  const trimmedErr = stderr.trim();
  if (trimmedOut.length > 0) {
    chunks.push(`stdout: ${clip(trimmedOut)}`);
  }
  if (trimmedErr.length > 0) {
    chunks.push(`stderr: ${clip(trimmedErr)}`);
  }
  return chunks.length === 0 ? message : `${message} | ${chunks.join(' | ')}`;
}

export function truncateHookString(value: string): string {
  return value.length > HOOK_STRING_MAX ? value.slice(0, HOOK_STRING_MAX) : value;
}

function mapHookSpecific(
  hso: Record<string, unknown>,
  out: ClaudeHookJson,
  effects: HookEffect[],
  diagnostics: PluginDiagnostic[],
): void {
  if (strValue(hso.hookEventName) === undefined) {
    diagnostics.push(
      warning(
        'hook_invalid_output',
        'hookSpecificOutput без hookEventName — содержимое игнорируется',
      ),
    );
    return;
  }
  const permissionDecision = strValue(hso.permissionDecision);
  if (permissionDecision === 'deny') {
    effects.push({ kind: 'block', reason: truncateHookString(strValue(out.reason) ?? '') });
  } else if (permissionDecision === 'ask') {
    effects.push({ kind: 'ask', reason: truncateHookString(strValue(out.reason) ?? '') });
  } else if (
    permissionDecision !== 'allow' &&
    permissionDecision !== 'defer' &&
    permissionDecision !== undefined
  ) {
    diagnostics.push(
      warning('hook_invalid_output', `неизвестный permissionDecision: ${permissionDecision}`),
    );
  }
  if (hso.updatedInput !== undefined) {
    effects.push({ kind: 'update_input', input: hso.updatedInput });
  }
  if (hso.updatedToolOutput !== undefined) {
    effects.push({ kind: 'update_output', output: hso.updatedToolOutput });
  }
  const additionalContext = strValue(hso.additionalContext);
  if (additionalContext !== undefined) {
    effects.push({ kind: 'context', text: truncateHookString(additionalContext) });
  }
}

function strValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function clip(value: string): string {
  return value.length > DIAG_OUTPUT_MAX ? `${value.slice(0, DIAG_OUTPUT_MAX)}…` : value;
}

function warning(code: PluginDiagnosticCode, message: string): PluginDiagnostic {
  return { level: 'warning', code, message };
}
