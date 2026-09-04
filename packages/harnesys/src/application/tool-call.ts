import type { ToolCallBatch, ToolCallFixed } from '../domain/agent-definition.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { evalExpr } from './expr-eval.ts';
import { checkPermission } from './permissions.ts';
import { buildToolMessage } from './tool-message.ts';
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
  nodeExecutionId: string;
  sessionId: string;
  toolMessages?: 'barrier' | 'ordered';
  messagesPath?: string;
  hostMaxConcurrency?: number;
  resumePayload?: unknown;
};

function serializeToolOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

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

  // Shared tool execution logic
  // biome-ignore lint/complexity/useMaxParams: internal helper with 5 params for reuse
  async function runOneRaw(
    idx: number,
    callsArr: { name: string; args: unknown; id: string }[],
    resultsArr: (ToolCallResult | undefined)[],
    messagesArr: (unknown | undefined)[],
    callCtx: ToolCallContext,
  ): Promise<void> {
    const call = callsArr[idx];
    if (!call) {
      return;
    }
    const def = callCtx.toolRegistry.get(call.name);
    if (!def) {
      resultsArr[idx] = {
        id: call.id,
        name: call.name,
        result: `tool not found ${call.name}`,
        isError: true,
      };
      messagesArr[idx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: `tool not found ${call.name}`,
      });
      return;
    }
    const validation = validateToolInput(def.input, call.args);
    if (!validation.ok) {
      resultsArr[idx] = { id: call.id, name: call.name, result: validation.errors, isError: true };
      messagesArr[idx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: serializeToolOutput(validation.errors),
      });
      return;
    }
    if (def.operations && callCtx.permissions) {
      const permCheck = checkPermission(callCtx.permissions, def.operations);
      if (!permCheck.allowed) {
        if (permCheck.gate === 'deny') {
          resultsArr[idx] = {
            id: call.id,
            name: call.name,
            result: `permission denied: ${permCheck.operation}`,
            isError: true,
          };
          messagesArr[idx] = buildToolMessage({
            toolCallId: call.id,
            name: call.name,
            content: `permission denied: ${permCheck.operation}`,
          });
          return;
        }
        if (permCheck.gate === 'ask') {
          resultsArr[idx] = {
            id: call.id,
            name: call.name,
            result: `permission ask: ${permCheck.operation}`,
            isError: true,
            skipped: true,
          };
          messagesArr[idx] = buildToolMessage({
            toolCallId: call.id,
            name: call.name,
            content: `permission ask: ${permCheck.operation}`,
          });
          return;
        }
      }
    }
    if (callCtx.signal.aborted) {
      resultsArr[idx] = {
        id: call.id,
        name: call.name,
        result: 'cancelled',
        isError: false,
        cancelled: true,
      };
      messagesArr[idx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: 'cancelled',
      });
      return;
    }
    try {
      if (!callCtx.paths?.cwd) {
        throw new Error('paths.cwd is required');
      }
      const toolCtx = {
        cwd: callCtx.paths.cwd,
        paths: { allow: callCtx.paths?.allow ?? [] },
        signal: callCtx.signal,
        artifacts: callCtx.artifacts,
        resume: callCtx.resume ?? undefined,
      };
      const value = await def.execute(call.args, toolCtx);
      resultsArr[idx] = { id: call.id, name: call.name, result: value, isError: false };
      messagesArr[idx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: serializeToolOutput(value),
      });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError' || callCtx.signal.aborted) {
        resultsArr[idx] = {
          id: call.id,
          name: call.name,
          result: 'cancelled',
          isError: false,
          cancelled: true,
        };
        messagesArr[idx] = buildToolMessage({
          toolCallId: call.id,
          name: call.name,
          content: 'cancelled',
        });
        return;
      }
      if (e instanceof AskUserInterrupt) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      resultsArr[idx] = { id: call.id, name: call.name, result: msg, isError: true };
      messagesArr[idx] = buildToolMessage({ toolCallId: call.id, name: call.name, content: msg });
    }
  }

  // --- HITL approve logic ---
  const batchApprove =
    'approve' in node && (node as { approve?: unknown }).approve
      ? (
          node as {
            approve: {
              tools: string[];
              reason: string;
              resumeSchema: JsonSchema;
            };
          }
        ).approve
      : undefined;

  const approveStateKey = `$batchApprove_${ctx.nodeId}`;

  if (batchApprove) {
    const approveTools = new Set(batchApprove.tools);
    const needsApproveIdx: number[] = [];
    const freeIdx: number[] = [];
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (c && approveTools.has(c.name)) {
        needsApproveIdx.push(i);
      } else {
        freeIdx.push(i);
      }
    }

    const results: (ToolCallResult | undefined)[] = new Array(calls.length);
    const toolMessages: (unknown | undefined)[] = [];

    // Restore progress from state (survives crash/resume)
    const saved = ctx.state[approveStateKey] as
      | { done: number; results: ToolCallResult[] }
      | undefined;
    let approveCursor = 0;
    if (saved && Array.isArray(saved.results)) {
      for (let i = 0; i < saved.results.length; i++) {
        results[i] = saved.results[i];
      }
      approveCursor = saved.done;
    }

    // Process needsApprove sequentially
    for (let i = approveCursor; i < needsApproveIdx.length; i++) {
      const callIdx = needsApproveIdx[i];
      if (callIdx === undefined) {
        continue;
      }
      const call = calls[callIdx];
      if (!call) {
        continue;
      }

      // Check resume payload
      if (ctx.resumePayload !== undefined) {
        const payload = ctx.resumePayload as { approved?: boolean };
        if (payload.approved) {
          // Approved — execute the tool
          await runOneRaw(callIdx, calls, results, toolMessages, ctx);
        } else {
          // Rejected — skip
          results[callIdx] = {
            id: call.id,
            name: call.name,
            result: 'rejected by user',
            isError: false,
            skipped: true,
          };
          toolMessages[callIdx] = buildToolMessage({
            toolCallId: call.id,
            name: call.name,
            content: 'rejected by user',
          });
        }
        // Save progress
        ctx.state[approveStateKey] = { done: i + 1, results: results.filter(Boolean) };
        // Clear resume payload for next call
        ctx.resumePayload = undefined;
      } else {
        // No resume payload — throw interrupt for this call
        ctx.state[approveStateKey] = { done: i, results: results.filter(Boolean) };
        throw new AskUserInterrupt({
          prompt: batchApprove.reason,
          source: 'approve',
          tool: { name: call.name, input: call.args, toolCallId: call.id },
          interruptId: `batch/${ctx.nodeExecutionId}/${callIdx}`,
          resumeSchema: batchApprove.resumeSchema,
        });
      }
    }

    // All needsApprove done — clean up state
    delete ctx.state[approveStateKey];

    // Process free calls with concurrency
    async function runOneFree(idx: number): Promise<void> {
      await runOneRaw(idx, calls, results, toolMessages, ctx);
    }

    if (freeIdx.length > 0) {
      const maxFree =
        concurrency === 'sequential'
          ? 1
          : Math.min(freeIdx.length, ctx.hostMaxConcurrency ?? freeIdx.length);
      if (maxFree <= 1) {
        for (const idx of freeIdx) {
          if (idx !== undefined) {
            await runOneFree(idx);
          }
        }
      } else {
        let cursor = 0;
        const worker = async (): Promise<void> => {
          while (cursor < freeIdx.length) {
            const idx = freeIdx[cursor];
            cursor++;
            if (idx !== undefined) {
              await runOneFree(idx);
            }
          }
        };
        const workers: Promise<void>[] = [];
        for (let w = 0; w < Math.min(maxFree, freeIdx.length); w++) {
          workers.push(worker());
        }
        await Promise.all(workers);
      }
    }

    // Flush tool messages
    const arr = getStateMessages(ctx.state, ctx.messagesPath);
    if (arr) {
      for (const m of toolMessages) {
        if (m) {
          arr.push(m);
        }
      }
    }

    return { results: results as ToolCallResult[] };
  }
  // --- End HITL approve logic ---

  const maxConcurrency =
    concurrency === 'sequential'
      ? 1
      : Math.min(calls.length, ctx.hostMaxConcurrency ?? calls.length);

  const results: (ToolCallResult | undefined)[] = new Array(calls.length);
  const toolMessages: (unknown | undefined)[] = [];

  function runOne(idx: number): Promise<void> {
    return runOneRaw(idx, calls, results, toolMessages, ctx);
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

  return { results: results as ToolCallResult[] };
}
