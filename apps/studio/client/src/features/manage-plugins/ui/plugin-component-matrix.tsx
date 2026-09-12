import type { ComponentStatus, PluginComponentSummary } from '@harnesys/studio-shared';
import type { ReactNode } from 'react';

const GROUPS: { status: ComponentStatus; label: string; fallbackReason: string }[] = [
  { status: 'native', label: 'Native', fallbackReason: '' },
  { status: 'inert', label: 'Inert', fallbackReason: 'not supported here' },
  { status: 'blocked_by_grant', label: 'Blocked', fallbackReason: 'grant required' },
  { status: 'dropped', label: 'Dropped', fallbackReason: 'see diagnostics' },
];

export function PluginComponentMatrix({
  components,
  renderAction,
}: {
  components: PluginComponentSummary[];
  renderAction?: (component: PluginComponentSummary) => ReactNode;
}) {
  if (components.length === 0) {
    return <p className="text-muted-foreground text-xs">No components declared.</p>;
  }
  return (
    <div className="flex flex-col gap-3" data-testid="plugin-component-matrix">
      {GROUPS.map((group) => {
        const items = components.filter((component) => component.status === group.status);
        if (items.length === 0) {
          return null;
        }
        return (
          <section key={group.status} className="flex flex-col gap-1">
            <p className="flex items-center gap-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
              {group.label}
              <span className="font-mono text-[10px] tracking-normal">{items.length}</span>
            </p>
            {items.map((component, index) => (
              <MatrixRow
                // biome-ignore lint/suspicious/noArrayIndexKey: display rows may repeat source pointers
                key={`${component.kind}:${component.source.file}:${component.source.pointer}:${index}`}
                component={component}
                reason={component.inertReason ?? group.fallbackReason}
                action={renderAction?.(component)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function MatrixRow({
  component,
  reason,
  action,
}: {
  component: PluginComponentSummary;
  reason: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5"
      data-component-kind={component.kind}
    >
      <span className="font-mono text-xs">{component.kind}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
        {component.source.file}:{component.source.pointer}
      </span>
      {reason !== '' ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">{reason}</span>
      ) : null}
      {action}
    </div>
  );
}
