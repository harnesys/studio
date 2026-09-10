import type {
  ToolCallBatch,
  ToolCallFixed,
  ToolOutputSettings,
} from '../domain/agent-definition.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { presentCallOutput } from './clip-tool-output.ts';
import { evalExpr } from './expr-eval.ts';
import { stateKeyOf } from './graph-helpers.ts';
import { executeApproveBatch, type PreparedToolCall, runSingleToolCall } from './tool-approve.ts';
import {
  clearCheckpoint,
  loadCheckpoint,
  recordCompleted,
  validCheckpointEntries,
} from './tool-approve-checkpoint.ts';
import { buildToolMessage, type ToolMessage } from './tool-message.ts';

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
  nodeExecutionId: string;
  sessionId: string;
  toolMessages?: 'barrier' | 'ordered';
  messagesPath?: string;
  hostMaxConcurrency?: number;
  resumePayload?: unknown;
  resumeInterruptId?: string;
  /** Дочерний ран: гейты отвечают deny вместо AskUserInterrupt. */
  sandbox?: boolean;
  toolOutput?: ToolOutputSettings | null;
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
  codeError('concurrency_invalid', `invalid concurrency ${String(c)}`);
}

function getStateMessages(state: Record<string, unknown>, path?: string): unknown[] | null {
  const key = path ? stateKeyOf(path) : 'messages';
  if (!key) {
    return null;
  }
  const v = state[key];
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

  let calls: PreparedToolCall[] = [];
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

  // HITL approve path: checkpointed batching lives in tool-approve.ts.
  if ('approve' in node && node.approve) {
    const outcome = await executeApproveBatch({ ...node, concurrency }, calls, ctx);
    const arr = getStateMessages(ctx.state, ctx.messagesPath);
    if (arr) {
      for (const m of outcome.toolMessages) {
        if (m) {
          arr.push(m);
        }
      }
    }
    return { results: outcome.results };
  }

  const maxConcurrency =
    concurrency === 'sequential'
      ? 1
      : Math.min(calls.length, ctx.hostMaxConcurrency ?? calls.length);

  const results: (ToolCallResult | undefined)[] = new Array(calls.length);
  const toolMessages: (ToolMessage | undefined)[] = [];

  // Restore progress saved before a permission interrupt; saved calls do not re-execute.
  const saved = loadCheckpoint(ctx.state, ctx.nodeId);
  if (saved) {
    for (const { idx, result } of validCheckpointEntries(saved, calls)) {
      const call = calls[idx];
      if (!call) {
        continue;
      }
      results[idx] = result;
      toolMessages[idx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: await presentCallOutput(ctx, call, result.result),
      });
    }
  }

  async function runOne(idx: number): Promise<void> {
    const call = calls[idx];
    if (!call || results[idx] !== undefined) {
      return;
    }
    const done = await runSingleToolCall(call, ctx, idx);
    results[idx] = done.result;
    toolMessages[idx] = done.message;
    // Чекпоинт сразу: ask соседнего вызова не должен потерять этот результат.
    recordCompleted(ctx.state, ctx.nodeId, idx, done.result);
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

  clearCheckpoint(ctx.state, ctx.nodeId);
  return { results: results as ToolCallResult[] };
}
