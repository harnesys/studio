import type { ReactNode } from 'react';
export function WorkspaceGroupLabel({
  name,
  visible = true,
  actions,
}: {
  name: string;
  visible?: boolean;
  actions?: ReactNode;
}) {
  if (!visible) {
    return null;
  }
  return (
    <div
      className="group/ws flex items-center gap-1.5 px-1.5 pt-1 pr-0.5 pb-0.5 text-[9px] text-muted-foreground uppercase tracking-[0.04em] group-data-[collapsible=icon]:hidden"
      data-testid={`workspace-group-${name}`}
    >
      <div className="min-w-0 truncate">W: {name}</div>

      <div className="relative ml-auto flex items-center">
        {actions ? (
          <span className="absolute inset-y-0 right-0 flex shrink-0 items-center bg-sidebar pl-1 opacity-0 transition-opacity group-hover/ws:opacity-100 has-data-open:opacity-100">
            {actions}
          </span>
        ) : null}
      </div>
    </div>
  );
}
