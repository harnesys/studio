import type { HookBinding, HookEventName, HookPayload } from '../../domain/hook.ts';

/** Символы точного/CSV-pipe режима матчера; всё вне набора — режим RegExp (план C1). */
const EXACT_MATCHER_CHARS = /^[A-Za-z0-9_,\- |]+$/;

/**
 * Матчинг биндинга против события, три режима: `*`/''/undefined — все;
 * `[A-Za-z0-9_,\- |]` — точное имя или CSV-pipe-список; иначе RegExp
 * над subject события (план C1).
 */
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

/** Subject матчинга по событию: tool_name, source, agent_type, trigger и т.д. (план C1). */
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
