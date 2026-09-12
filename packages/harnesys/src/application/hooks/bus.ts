import type { HookBinding, HookEffect, HookEventName, HookPayload } from '../../domain/hook.ts';
import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';
import {
  type HookHandlerResult,
  type HookProcessEntry,
  type HookProcessRegistry,
  runHookHandler,
} from './executors.ts';
import { matchesBinding } from './matchers.ts';

/** Рантайм-контекст шины: пути, базовый env и опциональные хост-возможности (план C1). */
export type HookRuntimeCtx = {
  cwd: string;
  projectDir: string;
  envBase: Record<string, string>;
  mcpToolCall?: (server: string, tool: string, input: Record<string, unknown>) => Promise<unknown>;
  promptModel?: (prompt: string, model?: string) => Promise<string>;
};

export type HookOutcome = {
  effects: HookEffect[];
  blocked?: HookEffect & { kind: 'block' };
  diagnostics: PluginDiagnostic[];
};

export type HookBus = {
  emit(event: HookEventName, payload: HookPayload): Promise<HookOutcome>;
  emitNotification(text: string, type: string): void;
  drainDeferred(): HookEffect[];
  bindings(): HookBinding[];
  close(): Promise<void>;
};

export function createHookBus(input: { bindings: HookBinding[]; ctx: HookRuntimeCtx }): HookBus {
  const { bindings, ctx } = input;
  const registry = new Set<HookProcessEntry>();
  const processRegistry: HookProcessRegistry = {
    add: (entry) => registry.add(entry),
    remove: (entry) => registry.delete(entry),
  };
  const deferred: HookEffect[] = [];
  let pendingDiagnostics: PluginDiagnostic[] = [];
  let lastPayload: HookPayload | undefined;
  const asyncRuns = new Set<Promise<void>>();

  async function emit(event: HookEventName, payload: HookPayload): Promise<HookOutcome> {
    lastPayload = payload;
    const matched = bindings.filter((b) => matchesBinding(b, payload));
    const diagnostics: PluginDiagnostic[] = pendingDiagnostics;
    pendingDiagnostics = [];
    for (const b of matched) {
      if (!isAsync(b)) {
        continue;
      }
      const tracked = runBinding(b, payload, undefined)
        .then((res) => {
          deferred.push(...res.effects);
          pendingDiagnostics.push(...res.diagnostics);
        })
        .catch(() => {})
        .finally(() => asyncRuns.delete(tracked));
      asyncRuns.add(tracked);
    }
    const abort = new AbortController();
    const results = await Promise.all(
      matched
        .filter((b) => !isAsync(b))
        .map(async (b) => {
          const res = await runBinding(b, payload, abort.signal);
          if (res.effects.some((eff) => eff.kind === 'block')) {
            abort.abort();
          }
          return res;
        }),
    );
    return foldOutcome(event, results, diagnostics);
  }

  function emitNotification(text: string, type: string): void {
    const base = lastPayload;
    const payload: HookPayload = {
      event: 'Notification',
      session_id: base?.session_id ?? '',
      run_id: base?.run_id ?? '',
      agent_id: base?.agent_id ?? '',
      thread_id: base?.thread_id ?? '',
      cwd: base?.cwd ?? ctx.cwd,
      permission_mode: base?.permission_mode ?? '',
      notification: { type, text },
    };
    void emit(payload.event, payload).catch(() => {});
  }

  function drainDeferred(): HookEffect[] {
    return deferred.splice(0, deferred.length);
  }

  async function close(): Promise<void> {
    for (const entry of registry) {
      entry.kill('close');
    }
    const settled = [...[...registry].map((entry) => entry.done), ...asyncRuns];
    await Promise.allSettled(settled);
    deferred.length = 0;
    pendingDiagnostics = [];
  }

  async function runBinding(
    b: HookBinding,
    payload: HookPayload,
    signal: AbortSignal | undefined,
  ): Promise<HookHandlerResult> {
    try {
      return await runHookHandler(b.handler, payload, ctx, {
        pluginRoot: b.vars.pluginRoot,
        pluginData: b.vars.pluginData,
        projectDir: ctx.projectDir,
        registry: processRegistry,
        signal,
      });
    } catch (error) {
      return {
        effects: [],
        diagnostics: [
          {
            level: 'warning',
            code: 'hook_failed',
            message: `hook handler упал: ${errorMessage(error)}`,
          },
        ],
      };
    }
  }

  return { emit, emitNotification, drainDeferred, bindings: () => bindings, close };
}

/** Свёртка результатов в порядке binding'ов (план C1): первый block, конкатенация context,
 * первый update_input/update_output; ask только из PreToolUse, stop только из Stop/SubagentStop. */
function foldOutcome(
  event: HookEventName,
  results: HookHandlerResult[],
  diagnostics: PluginDiagnostic[],
): HookOutcome {
  const effects: HookEffect[] = [];
  const contexts: string[] = [];
  let blocked: (HookEffect & { kind: 'block' }) | undefined;
  let updateInput: Extract<HookEffect, { kind: 'update_input' }> | undefined;
  let updateOutput: Extract<HookEffect, { kind: 'update_output' }> | undefined;
  let ask: Extract<HookEffect, { kind: 'ask' }> | undefined;
  let stop: Extract<HookEffect, { kind: 'stop' }> | undefined;
  for (const res of results) {
    diagnostics.push(...res.diagnostics);
    for (const eff of res.effects) {
      if (eff.kind === 'block') {
        if (blocked === undefined) {
          blocked = eff;
        }
      } else if (eff.kind === 'context') {
        contexts.push(eff.text);
      } else if (eff.kind === 'update_input') {
        updateInput ??= eff;
      } else if (eff.kind === 'update_output') {
        updateOutput ??= eff;
      } else if (eff.kind === 'ask') {
        if (event === 'PreToolUse') {
          ask ??= eff;
        }
      } else {
        if (event === 'Stop' || event === 'SubagentStop') {
          stop ??= eff;
        }
      }
    }
  }
  if (blocked !== undefined) {
    effects.push(blocked);
  }
  if (contexts.length > 0) {
    effects.push({ kind: 'context', text: contexts.join('\n') });
  }
  if (updateInput !== undefined) {
    effects.push(updateInput);
  }
  if (updateOutput !== undefined) {
    effects.push(updateOutput);
  }
  if (ask !== undefined) {
    effects.push(ask);
  }
  if (stop !== undefined) {
    effects.push(stop);
  }
  return { effects, blocked, diagnostics };
}

function isAsync(b: HookBinding): boolean {
  return b.handler.type === 'command' && b.handler.async === true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}
