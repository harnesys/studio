import type { HookBinding, HookEventName, HookPayload } from '../../domain/hook.ts';

const EXACT_MATCHER_CHARS = /^[A-Za-z0-9_,\- |]+$/;
export function matchesBinding(b: HookBinding, payload: HookPayload): boolean {
  if (b.event !== payload.event) {
    return false;
  }
  const matcher = b.matcher;
  if (matcher === undefined || matcher === '*' || matcher === '') {
    return true;
  }
  const subject = matcherSubject(payload.event, payload);
  if (subject === undefined) {
    return false;
  }
  if (EXACT_MATCHER_CHARS.test(matcher)) {
    const terms = matcher.split(/[|,]/);
    return terms.some((term) => term.trim() === subject);
  }
  try {
    return new RegExp(matcher).test(subject);
  } catch {
    return false;
  }
}
function matcherSubject(event: HookEventName, p: HookPayload): string | undefined {
  switch (event) {
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PostToolBatch':
    case 'PermissionRequest':
    case 'PermissionDenied':
      return p.tool_name;
    case 'SessionStart':
      return p.source;
    case 'SubagentStart':
    case 'SubagentStop':
      return p.agent_type;
    case 'PreCompact':
    case 'PostCompact':
      return p.trigger;
    case 'FileChanged':
      return p.file_path;
    case 'PreModelCall':
    case 'PostModelCall':
      return p.model?.model;
    case 'NodeStart':
    case 'NodeEnd':
      return p.node?.type;
    case 'SessionEnd':
      return p.reason;
    case 'Notification':
      return p.notification?.type;
    default:
      return undefined;
  }
}
