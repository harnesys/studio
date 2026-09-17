import type { ReactNode } from 'react';

export function WorkspaceGroupLabel({
  name,
  count,
  visible = true,
  actions,
}: {
  name: string;
  count?: number;
  /** When false (single workspace on desk), render nothing. */
  visible?: boolean;
  /** Same section actions as the section header; shown on hover. */
  actions?: ReactNode;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="group/ws flex items-center gap-1.5 px-1.5 pt-1.5 pb-0.5 text-[10px] text-muted-foreground uppercase tracking-[0.04em] group-data-[collapsible=icon]:hidden"
      data-testid={`workspace-group-${name}`}
    >
      <span className="min-w-0 truncate">{name}</span>
      {count !== undefined ? <span className="shrink-0">{count}</span> : null}
      {actions ? (
        <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover/ws:opacity-100 has-data-open:opacity-100">
          {actions}
        </span>
      ) : null}
    </div>
  );
}
