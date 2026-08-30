import type { ToolCallBatch, ToolCallFixed } from '../domain/agent-definition.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { evalExpr } from './expr-eval.ts';
import { checkPermission } from './permissions.ts';
import { validateToolInput } from './tool-registry.ts';

export type ToolCallResult = {
  id: string;
  name: string;
  result: unknown;
  isError: boolean;
  skipped?: boolean;
  cancelled?: boolean;
};

export type ToolCallContext = {
  state: Record<string, unknown>;
  output: unknown;
  input?: unknown;
  resume?: unknown;
  toolRegistry: Map<string, ToolDefinition>;
  permissions?: PermissionMap;
  paths?: PathsConfig;
  artifacts?: ArtifactStore;
  signal: AbortSignal;
  runId: string;
  nodeId: string;
  sessionId: string;
  toolMessages?: 'barrier' | 'ordered';
  messagesPath?: string;
  hostMaxConcurrency?: number;
};

function codeError(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function evalArgValue(
  v: unknown,
  slots: { input: unknown; state: Record<string, unknown>; output: unknown; resume: unknown },
): unknown {
  if (typeof v === 'string' && v.trim().startsWith('$')) {
    return evalExpr(v, slots);
  }
  return v;
}

type BatchConcurrency = 'parallel' | 'sequential' | string;
function resolveConcurrency(
  c: BatchConcurrency,
  slots: { input: unknown; state: Record<string, unknown>; output: unknown; resume: unknown },
): 'parallel' | 'sequential' {
  if (c === 'parallel' || c === 'sequential') {
    return c;
  }
  if (typeof c === 'string' && c.trim().startsWith('$')) {
    const val = evalExpr(c, slots);
    if (val === 'parallel' || val === 'sequential') {
      return val as 'parallel' | 'sequential';
    }
    codeError('concurrency_invalid', `invalid concurrency ${String(val)}`);
  }
  if (typeof c === 'string' && (c === 'parallel' || c === 'sequential')) {
    return c as 'parallel' | 'sequential';
  }
  codeError('concurrency_invalid', `invalid concurrency ${String(c)}`);
}

function getStateMessages(state: Record<string, unknown>, path?: string): unknown[] | null {
  if (path) {
    const key = path
      .trim()
      .replace(/^\$state\./, '')
      .split(/[.[]/)[0] as string;
    const v = state[key];
    return Array.isArray(v) ? (v as unknown[]) : null;
  }
  const v = state.messages;
  return Array.isArray(v) ? (v as unknown[]) : null;
}

export async function executeToolCall(
  node: ToolCallFixed | ToolCallBatch,
  ctx: ToolCallContext,
): Promise<{ results: ToolCallResult[] }> {
  const slots = {
    input: ctx.input ?? null,
    state: ctx.state,
    output: ctx.output ?? null,
    resume: ctx.resume ?? null,
  };

  let calls: { name: string; args: unknown; id: string }[] = [];
  let concurrency: 'parallel' | 'sequential' = 'parallel';

  if ('name' in node && typeof node.name === 'string') {
    const fixed = node as ToolCallFixed;
    const evaluated: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fixed.args as Record<string, unknown>)) {
      evaluated[k] = evalArgValue(v, slots);
    }
    calls = [{ name: fixed.name, args: evaluated, id: `${ctx.runId}:${ctx.nodeId}:0` }];
    concurrency = 'sequential';
  } else {
    const batch = node as ToolCallBatch;
    const raw = evalExpr(batch.calls as string, slots);
    if (!Array.isArray(raw)) {
      codeError('tool_call_shape', 'calls must be array');
    }
    if (raw.length > 32) {
      codeError('tool_call_limit', 'tool_call_limit 32 exceeded');
    }
    concurrency = resolveConcurrency(batch.concurrency, slots);
    if (batch.barrier && (batch.barrier as { policy?: unknown }).policy !== 'all') {
      codeError('barrier_policy', 'barrier.policy must be "all"');
    }
    calls = (raw as unknown[]).map((item, idx) => {
      const rec = item as { name?: unknown; args?: unknown; id?: unknown };
      const name = typeof rec.name === 'string' ? rec.name : String(rec.name ?? '');
      let args: unknown = rec.args;
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        const ev: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
          ev[k] = evalArgValue(v, slots);
        }
        args = ev;
      }
      const id = typeof rec.id === 'string' ? rec.id : `${ctx.runId}:${ctx.nodeId}:${idx}`;
      return { name, args: args ?? {}, id };
    });
  }

  const maxConcurrency =
    concurrency === 'sequential'
      ? 1
      : Math.min(calls.length, ctx.hostMaxConcurrency ?? calls.length);

  const results: ToolCallResult[] = new Array(calls.length);
  const toolMessages: unknown[] = [];

  async function runOne(idx: number): Promise<void> {
    const call = calls[idx] as { name: string; args: unknown; id: string };
    const def = ctx.toolRegistry.get(call.name);
    if (!def) {
      results[idx] = {
        id: call.id,
        name: call.name,
        result: `tool not found ${call.name}`,
        isError: true,
      };
      toolMessages[idx] = {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: `tool not found ${call.name}`,
      };
      return;
    }
    const validation = validateToolInput(def.input, call.args);
    if (!validation.ok) {
      results[idx] = { id: call.id, name: call.name, result: validation.errors, isError: true };
      toolMessages[idx] = {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: validation.errors,
      };
      return;
    }

    if (def.operations && ctx.permissions) {
      const check = checkPermission(ctx.permissions, def.operations);
      if (!check.allowed) {
        if (check.gate === 'deny') {
          results[idx] = {
            id: call.id,
            name: call.name,
            result: `permission denied: ${check.operation}`,
            isError: true,
          };
          toolMessages[idx] = {
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: `permission denied: ${check.operation}`,
          };
          return;
        }
        if (check.gate === 'ask') {
          results[idx] = {
            id: call.id,
            name: call.name,
            result: `permission ask: ${check.operation}`,
            isError: true,
            skipped: true,
          };
          toolMessages[idx] = {
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: `permission ask: ${check.operation}`,
          };
          return;
        }
      }
    }

    if (ctx.signal.aborted) {
      results[idx] = {
        id: call.id,
        name: call.name,
        result: 'cancelled',
        isError: false,
        cancelled: true,
      };
      toolMessages[idx] = {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: 'cancelled',
      };
      return;
    }

    try {
      const toolCtx = {
        cwd: ctx.paths?.cwd ?? process.cwd(),
        paths: { allow: ctx.paths?.allow ?? [] },
        signal: ctx.signal,
        artifacts: ctx.artifacts,
      };
      const value = await def.execute(call.args, toolCtx);
      results[idx] = { id: call.id, name: call.name, result: value, isError: false };
      toolMessages[idx] = {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: String(value ?? ''),
      };
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError' || ctx.signal.aborted) {
        results[idx] = {
          id: call.id,
          name: call.name,
          result: 'cancelled',
          isError: false,
          cancelled: true,
        };
        toolMessages[idx] = {
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: 'cancelled',
        };
        return;
      }
      if (e instanceof AskUserInterrupt) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      results[idx] = { id: call.id, name: call.name, result: msg, isError: true };
      toolMessages[idx] = { role: 'tool', toolCallId: call.id, name: call.name, content: msg };
    }
  }

  if (concurrency === 'sequential' || maxConcurrency === 1) {
    for (let i = 0; i < calls.length; i += 1) {
      await runOne(i);
      if (ctx.toolMessages === 'ordered') {
        const arr = getStateMessages(ctx.state, ctx.messagesPath);
        if (arr) {
          const msg = toolMessages[i];
          if (msg) {
            arr.push(msg);
          }
        }
      }
    }
  } else {
    const queue = calls.map((_, i) => i);
    const workers: Promise<void>[] = [];
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        const idx = queue[cursor] as number;
        cursor += 1;
        await runOne(idx);
      }
    };
    for (let w = 0; w < Math.min(maxConcurrency, queue.length); w += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
  }

  if (ctx.toolMessages !== 'ordered') {
    const arr = getStateMessages(ctx.state, ctx.messagesPath);
    if (arr) {
      for (const m of toolMessages) {
        if (m) {
          arr.push(m);
        }
      }
    }
  } else if (concurrency !== 'sequential') {
    const arr = getStateMessages(ctx.state, ctx.messagesPath);
    if (arr) {
      for (const m of toolMessages) {
        if (m !== undefined && !arr.includes(m)) {
          arr.push(m);
        }
      }
    }
  }

  return { results };
}
