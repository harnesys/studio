import { AskUserInterrupt } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import { checkPermission } from './permissions.ts';
import type { ToolCallContext, ToolCallResult } from './tool-call.ts';
import { buildToolMessage, type ToolMessage } from './tool-message.ts';
import { validateToolInput } from './tool-registry.ts';

export const NODE_CHECKPOINT_KEY = '$nodeCheckpoint_';

export type ToolCallBatchOutcome = {
  results: ToolCallResult[];
  toolMessages: (ToolMessage | undefined)[];
};

export type ApproveNodeLike = {
  approve?: { tools: string[]; reason: string; resumeSchema: JsonSchema };
  concurrency?: 'parallel' | 'sequential';
};

export type PreparedToolCall = {
  name: string;
  args: unknown;
  id: string;
};

export type NodeCheckpoint = {
  completed: Record<number, ToolCallResult>;
};

export type ApproveResumePayload = {
  approved?: boolean;
};

export type SingleToolCallDone = {
  result: ToolCallResult;
  message: ToolMessage;
};

function codeError(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

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

export async function runSingleToolCall(
  call: PreparedToolCall,
  ctx: ToolCallContext,
): Promise<SingleToolCallDone> {
  const message = (content: string): ToolMessage =>
    buildToolMessage({ toolCallId: call.id, name: call.name, content });
  const def = ctx.toolRegistry.get(call.name);
  if (!def) {
    const content = `tool not found ${call.name}`;
    return {
      result: { id: call.id, name: call.name, result: content, isError: true },
      message: message(content),
    };
  }
  const validation = validateToolInput(def.input, call.args);
  if (!validation.ok) {
    return {
      result: { id: call.id, name: call.name, result: validation.errors, isError: true },
      message: message(serializeToolOutput(validation.errors)),
    };
  }
  if (def.operations && ctx.permissions) {
    const permCheck = checkPermission(ctx.permissions, def.operations);
    if (!permCheck.allowed) {
      if (permCheck.gate === 'deny') {
        const content = `permission denied: ${permCheck.operation}`;
        return {
          result: { id: call.id, name: call.name, result: content, isError: true },
          message: message(content),
        };
      }
      if (permCheck.gate === 'ask') {
        const content = `permission ask: ${permCheck.operation}`;
        return {
          result: { id: call.id, name: call.name, result: content, isError: true, skipped: true },
          message: message(content),
        };
      }
    }
  }
  if (ctx.signal.aborted) {
    return {
      result: {
        id: call.id,
        name: call.name,
        result: 'cancelled',
        isError: false,
        cancelled: true,
      },
      message: message('cancelled'),
    };
  }
  try {
    if (!ctx.paths?.cwd) {
      throw new Error('paths.cwd is required');
    }
    const toolCtx = {
      cwd: ctx.paths.cwd,
      paths: { allow: ctx.paths?.allow ?? [] },
      signal: ctx.signal,
      artifacts: ctx.artifacts,
      resume: ctx.resume ?? undefined,
    };
    const value = await def.execute(call.args, toolCtx);
    return {
      result: { id: call.id, name: call.name, result: value, isError: false },
      message: message(serializeToolOutput(value)),
    };
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError' || ctx.signal.aborted) {
      return {
        result: {
          id: call.id,
          name: call.name,
          result: 'cancelled',
          isError: false,
          cancelled: true,
        },
        message: message('cancelled'),
      };
    }
    if (e instanceof AskUserInterrupt) {
      throw e;
    }
    const content = e instanceof Error ? e.message : String(e);
    return {
      result: { id: call.id, name: call.name, result: content, isError: true },
      message: message(content),
    };
  }
}

export async function executeApproveBatch(
  node: ApproveNodeLike,
  calls: PreparedToolCall[],
  ctx: ToolCallContext,
): Promise<ToolCallBatchOutcome> {
  const approve = node.approve;
  if (!approve) {
    codeError('approve_missing', 'executeApproveBatch requires node.approve');
  }
  const approveTools = new Set(approve.tools);
  const needsApproveIdx: number[] = [];
  const freeIdx: number[] = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (!call) {
      continue;
    }
    if (approveTools.has(call.name)) {
      needsApproveIdx.push(i);
    } else {
      freeIdx.push(i);
    }
  }

  const key = NODE_CHECKPOINT_KEY + ctx.nodeId;
  const results: (ToolCallResult | undefined)[] = new Array(calls.length);
  const toolMessages: (ToolMessage | undefined)[] = new Array(calls.length);

  function snapshot(): NodeCheckpoint {
    const completed: Record<number, ToolCallResult> = {};
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r) {
        completed[i] = r;
      }
    }
    return { completed };
  }

  // Restore progress from state (survives crash/resume); saved calls do not re-execute.
  // Messages rebuild from saved results via the same serializer, so the outcome
  // stays aligned with calls by index.
  const saved = ctx.state[key] as NodeCheckpoint | undefined;
  if (
    saved &&
    typeof saved === 'object' &&
    saved.completed &&
    typeof saved.completed === 'object'
  ) {
    for (const [k, v] of Object.entries(saved.completed)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= calls.length) {
        continue;
      }
      const call = calls[idx];
      if (!call || !v || typeof v !== 'object') {
        continue;
      }
      const done = v as ToolCallResult;
      if (done.id !== call.id) {
        continue;
      }
      results[idx] = done;
      toolMessages[idx] = buildToolMessage({
        toolCallId: call.id,
        name: call.name,
        content: serializeToolOutput(done.result),
      });
    }
  }

  // Free (non-approve) calls run first in a pool; their results join the checkpoint
  // so it stays current when the interrupt fires later in this node.
  async function runFree(idx: number): Promise<void> {
    const call = calls[idx];
    if (!call || results[idx] !== undefined) {
      return;
    }
    const done = await runSingleToolCall(call, ctx);
    results[idx] = done.result;
    toolMessages[idx] = done.message;
  }

  const pendingFree = freeIdx.filter((i) => results[i] === undefined);
  if (pendingFree.length > 0) {
    const width =
      node.concurrency === 'sequential'
        ? 1
        : Math.min(pendingFree.length, ctx.hostMaxConcurrency ?? pendingFree.length);
    if (width <= 1) {
      for (const idx of pendingFree) {
        await runFree(idx);
      }
    } else {
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < pendingFree.length) {
          const idx = pendingFree[cursor] as number;
          cursor += 1;
          await runFree(idx);
        }
      };
      const workers: Promise<void>[] = [];
      for (let w = 0; w < Math.min(width, pendingFree.length); w++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    }
  }

  // needsApprove calls walk sequentially; each step either consumes the resume
  // payload or saves the checkpoint and throws AskUserInterrupt.
  for (const callIdx of needsApproveIdx) {
    if (results[callIdx] !== undefined) {
      continue;
    }
    const call = calls[callIdx];
    if (!call) {
      continue;
    }
    if (ctx.resumePayload !== undefined) {
      const payload = ctx.resumePayload as ApproveResumePayload;
      if (payload.approved) {
        const done = await runSingleToolCall(call, ctx);
        results[callIdx] = done.result;
        toolMessages[callIdx] = done.message;
      } else {
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
      ctx.state[key] = snapshot();
      ctx.resumePayload = undefined;
    } else {
      ctx.state[key] = snapshot();
      throw new AskUserInterrupt({
        prompt: approve.reason,
        source: 'approve',
        tool: { name: call.name, input: call.args, toolCallId: call.id },
        interruptId: `batch/${ctx.nodeExecutionId}/${callIdx}`,
        resumeSchema: approve.resumeSchema,
      });
    }
  }

  // Fill holes from skipped calls so the outcome holds a result per call.
  for (let i = 0; i < calls.length; i++) {
    if (results[i] !== undefined) {
      continue;
    }
    const call = calls[i];
    if (!call) {
      continue;
    }
    const content = 'skipped: no result recorded';
    results[i] = { id: call.id, name: call.name, result: content, isError: true, skipped: true };
    toolMessages[i] = buildToolMessage({ toolCallId: call.id, name: call.name, content });
  }

  delete ctx.state[key];
  return { results: results as ToolCallResult[], toolMessages };
}
