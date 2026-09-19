import { SANDBOX_DENY_PREFIX } from '../constants.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { HookEmitCtx } from './hooks/emit-hook.ts';
import { emitHook, hookBlockedReason } from './hooks/emit-hook.ts';
import { loadCheckpoint, recordDenied, recordGranted } from './tool-approve-checkpoint.ts';
import type { ToolCallResult } from './tool-call.ts';
import { buildToolMessage, type ToolMessage } from './tool-message.ts';

export { SANDBOX_DENY_PREFIX };
export type PermissionGateCall = {
  name: string;
  args: unknown;
  id: string;
};
export type PermissionGateContext = {
  nodeExecutionId: string;
  resumePayload?: unknown;
  resumeInterruptId?: string;
  state: Record<string, unknown>;
  nodeId: string;
  sandbox?: boolean;
  hooks?: HookEmitCtx;
};
export type PermissionGateDone = {
  result: ToolCallResult;
  message: ToolMessage;
};
const PERMISSION_RESUME_SCHEMA = {
  type: 'object',
  properties: { approved: { type: 'boolean' } },
  required: ['approved'],
} as JsonSchema;
export function permissionResumeCallIndex(ctx: PermissionGateContext): number | null {
  const id = ctx.resumeInterruptId;
  if (typeof id !== 'string' || !id.startsWith('perm/')) {
    return null;
  }
  const tail = id.split('/').pop() ?? '';
  if (tail === '') {
    return null;
  }
  const parsed = Number(tail);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
export function isForeignPermissionResume(ctx: PermissionGateContext, callIdx: number): boolean {
  const resumeIdx = permissionResumeCallIndex(ctx);
  return resumeIdx !== null && resumeIdx !== callIdx;
}
function resumeApproved(ctx: PermissionGateContext): boolean | null {
  const payload = ctx.resumePayload;
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const approved = (
    payload as {
      approved?: unknown;
    }
  ).approved;
  return typeof approved === 'boolean' ? approved : null;
}
export type SandboxDenyKind = 'permission' | 'approval' | 'user input';
export function sandboxDenyText(tool: string, what: SandboxDenyKind): string {
  return `${SANDBOX_DENY_PREFIX}${tool} requires ${what}, no interactive user here; parent must provide, pre-approve, or do it itself`;
}
export function sandboxSharedStateDenyText(tool: string): string {
  return `${SANDBOX_DENY_PREFIX}${tool} writes state shared with the parent thread or workspace; the parent must do it itself`;
}
export function throwPermissionAsk(
  call: PermissionGateCall,
  ctx: PermissionGateContext,
  idx: number,
  operation: string | undefined,
): never {
  throw new AskUserInterrupt({
    prompt: `allow ${operation}?`,
    source: 'permission',
    tool: { name: call.name, input: call.args, toolCallId: call.id },
    interruptId: `perm/${ctx.nodeExecutionId}/${idx}`,
    resumeSchema: PERMISSION_RESUME_SCHEMA,
  });
}
export function skippedGateResult(
  call: PermissionGateCall,
  ctx: PermissionGateContext,
): PermissionGateDone {
  const content = permissionResumeCallIndex(ctx) !== null ? 'denied by user' : 'rejected by user';
  return {
    result: { id: call.id, name: call.name, result: content, isError: false, skipped: true },
    message: buildToolMessage({ toolCallId: call.id, name: call.name, content }),
  };
}
export async function applyPermissionGate(input: {
  call: PermissionGateCall;
  ctx: PermissionGateContext;
  idx: number;
  operation: string | undefined;
}): Promise<PermissionGateDone | null> {
  const { call, ctx, idx, operation } = input;
  if (loadCheckpoint(ctx.state, ctx.nodeId)?.granted?.[call.id]) {
    return null;
  }
  if (ctx.sandbox) {
    const reason = sandboxDenyText(call.name, 'permission');
    recordDenied(ctx.state, call.id, { tool: call.name, reason });
    return {
      result: { id: call.id, name: call.name, result: reason, isError: true },
      message: buildToolMessage({ toolCallId: call.id, name: call.name, content: reason }),
    };
  }
  const approved = resumeApproved(ctx);
  const resumeIdx = permissionResumeCallIndex(ctx);
  if (approved === null || (resumeIdx !== null && resumeIdx !== idx)) {
    const request = await emitHook(ctx.hooks, 'PermissionRequest', {
      tool_name: call.name,
      tool_input: call.args,
      tool_use_id: call.id,
    });
    const blocked = hookBlockedReason(request);
    if (blocked !== undefined) {
      recordDenied(ctx.state, call.id, { tool: call.name, reason: blocked });
      return {
        result: { id: call.id, name: call.name, result: blocked, isError: true },
        message: buildToolMessage({ toolCallId: call.id, name: call.name, content: blocked }),
      };
    }
    throwPermissionAsk(call, ctx, idx, operation);
  }
  if (approved === false) {
    ctx.resumePayload = undefined;
    return skippedGateResult(call, ctx);
  }
  recordGranted(ctx.state, ctx.nodeId, call.id);
  if (resumeIdx !== null) {
    ctx.resumePayload = undefined;
  }
  return null;
}
