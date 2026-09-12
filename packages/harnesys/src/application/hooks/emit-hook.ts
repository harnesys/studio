import type { HookEventName, HookPayload } from '../../domain/hook.ts';
import type { HookBus, HookOutcome } from './bus.ts';

/**
 * Контекст emit-точки рана: шина плюс идентичность рана для payload.
 * Собирается один раз на ран (prepare/create-runtime), граф резолвит
 * идентичность через `resolveHookCtx` — шина одна, поля payload живые.
 */
export type HookEmitCtx = {
  bus: HookBus;
  sessionId: string;
  runId: string;
  agentId: string;
  threadId: string;
  cwd: string;
  permissionMode: string;
};

/** Поля события поверх базовой идентичности payload. */
export type HookEmitFields = Omit<
  HookPayload,
  'event' | 'session_id' | 'run_id' | 'agent_id' | 'thread_id' | 'cwd' | 'permission_mode'
>;

/**
 * Единственная точка эмита хук-событий в ране. No-op при пустой шине —
 * проверка `bindings().length === 0` до сборки полного payload: горячий
 * путь платит только за литерал полей события.
 */
export function emitHook(
  ctx: HookEmitCtx | undefined,
  event: HookEventName,
  fields: HookEmitFields,
): Promise<HookOutcome | undefined> {
  if (!ctx || ctx.bus.bindings().length === 0) {
    return Promise.resolve(undefined);
  }
  const payload: HookPayload = {
    event,
    session_id: ctx.sessionId,
    run_id: ctx.runId,
    agent_id: ctx.agentId,
    thread_id: ctx.threadId,
    cwd: ctx.cwd,
    permission_mode: ctx.permissionMode,
    ...fields,
  };
  return ctx.bus.emit(event, payload);
}

/** Идентичность рана поверх базового контекста: граф и спавн резолвят её до эмита. */
export function resolveHookCtx(
  base: HookEmitCtx | undefined,
  ids: { sessionId: string; runId: string; agentId: string; threadId: string; cwd: string },
): HookEmitCtx | undefined {
  return base ? { ...base, ...ids } : undefined;
}

export function hookBlockedReason(outcome: HookOutcome | undefined): string | undefined {
  return outcome?.blocked?.reason;
}

/** Свёртка даёт максимум один context-эффект: берём его текст. */
export function hookContextText(outcome: HookOutcome | undefined): string | undefined {
  for (const eff of outcome?.effects ?? []) {
    if (eff.kind === 'context') {
      return eff.text;
    }
  }
  return undefined;
}

export function hookUpdateInputOf(outcome: HookOutcome | undefined): unknown {
  for (const eff of outcome?.effects ?? []) {
    if (eff.kind === 'update_input') {
      return eff.input;
    }
  }
  return undefined;
}

export function hookUpdateOutputOf(outcome: HookOutcome | undefined): unknown {
  for (const eff of outcome?.effects ?? []) {
    if (eff.kind === 'update_output') {
      return eff.output;
    }
  }
  return undefined;
}

/** Префикс-блок `[hooks]` для входного текста (UserPromptSubmit, SubagentStart context). */
export function withHookContextPrefix(input: unknown, text: string | undefined): unknown {
  if (text === undefined) {
    return input;
  }
  const prefix = `[hooks]\n${text}\n\n`;
  if (typeof input === 'string') {
    return `${prefix}${input}`;
  }
  if (
    input &&
    typeof input === 'object' &&
    typeof (input as { text?: unknown }).text === 'string'
  ) {
    return { ...input, text: `${prefix}${(input as { text: string }).text}` };
  }
  return input;
}
