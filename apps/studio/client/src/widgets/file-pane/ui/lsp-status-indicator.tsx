import type { LspBridgeStatus } from '@/features/lsp-bridge';

export function LspStatusIndicator({ status, pulse }: { status: LspBridgeStatus; pulse: number }) {
  if (status === 'off') {
    return null;
  }
  const colors: Record<LspBridgeStatus, string> = {
    live: 'bg-emerald-500',
    starting: 'bg-amber-500',
    error: 'bg-red-500',
    off: 'bg-muted-foreground',
  };
  const labels: Record<LspBridgeStatus, string> = {
    live: 'LSP',
    starting: 'LSP…',
    error: 'LSP !',
    off: 'LSP',
  };
  return (
    <div className="pointer-events-none absolute right-3 bottom-2 z-10 flex items-center gap-1.5 rounded-full border bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
      <span className="relative flex size-1.5">
        {status === 'live' && pulse > 0 && (
          <span
            key={pulse}
            className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60"
          />
        )}
        <span className={`relative inline-flex size-1.5 rounded-full ${colors[status]}`} />
      </span>
      {labels[status]}
    </div>
  );
}
