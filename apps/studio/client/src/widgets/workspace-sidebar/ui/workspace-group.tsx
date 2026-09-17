export function WorkspaceGroupLabel({ name, count }: { name: string; count: number }) {
  return (
    <div
      className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-0.5 text-[11px] text-muted-foreground uppercase tracking-[0.04em] group-data-[collapsible=icon]:hidden"
      data-testid={`workspace-group-${name}`}
    >
      <span className="truncate">{name}</span>
      <span className="ml-auto shrink-0">{count}</span>
    </div>
  );
}
