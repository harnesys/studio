import { cn } from '@/shared/lib/utils';
export type StatusDotTone = 'idle' | 'live' | 'wait' | 'danger' | 'off';
type StatusDotProps = {
  tone: StatusDotTone;
  className?: string;
  label?: string;
};
export function StatusDot({ tone, className, label }: StatusDotProps) {
  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        'relative -top-px inline-block size-1.5 shrink-0 rounded-full',
        tone === 'live' && 'live-dot bg-live',
        tone === 'wait' && 'bg-live/55',
        tone === 'danger' && 'bg-destructive',
        tone === 'idle' && 'bg-muted-foreground/45',
        tone === 'off' && 'border border-muted-foreground/40 bg-transparent',
        className,
      )}
    />
  );
}
