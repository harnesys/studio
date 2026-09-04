import { AskUserInterrupt } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import { checkPermission } from './permissions.ts';
import {
  clearCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
  snapshotCheckpoint,
  validCheckpointEntries,
} from './tool-approve-checkpoint.ts';
import type { ToolCallContext, ToolCallResult } from './tool-call.ts';
import { buildToolMessage, type ToolMessage } from './tool-message.ts';
import {
  applyPermissionGate,
  isForeignPermissionResume,
  skippedGateResult,
} from './tool-permission.ts';
import { validateToolInput } from './tool-registry.ts';

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
  idx: number,
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
        const parked = applyPermissionGate({ call, ctx, idx, operation: permCheck.operation });
        if (parked) {
          return parked;
        }
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

  const results: (ToolCallResult | undefined)[] = new Array(calls.length);
  const toolMessages: (ToolMessage | undefined)[] = new Array(calls.length);

  // Restore progress from state (survives crash/resume); saved calls do not re-execute.
  // Messages rebuild from saved results via the same serializer, so the outcome
  // stays aligned with calls by index.
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
        content: serializeToolOutput(result.result),
      });
    }
  }

  // Runs one call and records its result; saves the checkpoint when an
  // interrupt escapes so a resume restores completed calls instead of re-running them.
  async function runCall(idx: number): Promise<void> {
    const call = calls[idx];
    if (!call || results[idx] !== undefined) {
      return;
    }
    try {
      const done = await runSingleToolCall(call, ctx, idx);
      results[idx] = done.result;
      toolMessages[idx] = done.message;
    } catch (e) {
      if (e instanceof AskUserInterrupt) {
        saveCheckpoint(ctx.state, ctx.nodeId, snapshotCheckpoint(results));
      }
      throw e;
    }
  }

  const pendingFree = freeIdx.filter((i) => results[i] === undefined);
  if (pendingFree.length > 0) {
    const width =
      node.concurrency === 'sequential'
        ? 1
        : Math.min(pendingFree.length, ctx.hostMaxConcurrency ?? pendingFree.length);
    if (width <= 1) {
      for (const idx of pendingFree) {
        await runCall(idx);
      }
    } else {
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < pendingFree.length) {
          const idx = pendingFree[cursor] as number;
          cursor += 1;
          await runCall(idx);
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
    const foreignPerm = isForeignPermissionResume(ctx, callIdx);
    if (ctx.resumePayload !== undefined && !foreignPerm) {
      const payload = ctx.resumePayload as ApproveResumePayload;
      if (payload.approved) {
        await runCall(callIdx);
      } else {
        const skipped = skippedGateResult(call, ctx);
        results[callIdx] = skipped.result;
        toolMessages[callIdx] = skipped.message;
      }
      saveCheckpoint(ctx.state, ctx.nodeId, snapshotCheckpoint(results));
      ctx.resumePayload = undefined;
    } else {
      saveCheckpoint(ctx.state, ctx.nodeId, snapshotCheckpoint(results));
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

  clearCheckpoint(ctx.state, ctx.nodeId);
  return { results: results as ToolCallResult[], toolMessages };
}
