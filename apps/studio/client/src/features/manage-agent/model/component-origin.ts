import type { ComponentOrigin } from '@harnesys/studio-shared';

const SERVER_APPROVAL_REASON = 'needs_server_approval';

/** Accent badge для незагруженного плагинного компонента; native/workspace → undefined. */
export function pluginStatusBadge(origin: ComponentOrigin): string | undefined {
  if (origin.kind !== 'plugin') {
    return undefined;
  }
  switch (origin.status) {
    case 'native':
      return undefined;
    case 'blocked_by_grant':
      return origin.inertReason === SERVER_APPROVAL_REASON ? 'approval' : 'blocked';
    case 'inert':
      return 'inert';
    default:
      return 'invalid';
  }
}

/** Строка статуса в description; native/workspace → ''. */
export function pluginStatusText(origin: ComponentOrigin): string {
  if (origin.kind !== 'plugin' || origin.status === 'native') {
    return '';
  }
  if (origin.status === 'blocked_by_grant') {
    return origin.inertReason === SERVER_APPROVAL_REASON
      ? 'blocked · needs server approval'
      : 'blocked · grant required';
  }
  if (origin.status === 'inert') {
    return 'inert · not supported here';
  }
  return 'invalid · see plugin diagnostics';
}
