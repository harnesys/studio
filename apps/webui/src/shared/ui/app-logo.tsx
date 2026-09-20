import { cn } from '@/shared/lib/utils';

export function AppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="none" aria-hidden="true" className={cn('size-6', className)}>
      <rect width="512" height="512" rx="115" fill="#c4622d" />
      <g fill="none" stroke="#f6f7f8" strokeWidth="46">
        <path d="M 188 188 A 28 28 0 0 0 160 160 H 116 A 28 28 0 0 0 88 188 V 324 A 28 28 0 0 0 116 352 H 160 A 28 28 0 0 0 188 324" />
        <path d="M 324 188 A 28 28 0 0 1 352 160 H 396 A 28 28 0 0 1 424 188 V 324 A 28 28 0 0 1 396 352 H 352 A 28 28 0 0 1 324 324" />
        <line x1="195" y1="256" x2="317" y2="256" strokeLinecap="round" />
      </g>
    </svg>
  );
}
