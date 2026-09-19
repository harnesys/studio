import type * as React from 'react';
import { cn } from '@/shared/lib/utils';
export type PreloaderProps = React.ComponentProps<'div'> & {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'pulse' | 'bar' | 'dots';
};
export function Preloader({ className, size = 'md', variant = 'dots', ...props }: PreloaderProps) {
  if (variant === 'bar') {
    return (
      <div
        role="status"
        aria-label="Loading"
        className={cn('relative h-0.5 w-full overflow-hidden rounded-full bg-muted', className)}
        {...props}
      >
        <div className="absolute inset-y-0 w-1/3 animate-[shimmer_1.4s_infinite_ease-in-out] rounded-full bg-live" />
      </div>
    );
  }
  if (variant === 'pulse') {
    const sizeClasses = {
      sm: 'size-2',
      md: 'size-3',
      lg: 'size-4',
    };
    return (
      <div
        role="status"
        aria-label="Loading"
        className={cn('relative flex items-center justify-center', className)}
        {...props}
      >
        <span
          className={cn(
            'inline-block animate-ping rounded-full bg-live opacity-75 duration-1000',
            sizeClasses[size],
          )}
        />
        <span className={cn('absolute inline-block rounded-full bg-live', sizeClasses[size])} />
      </div>
    );
  }
  const dotSizes = {
    sm: 'size-1',
    md: 'size-1.5',
    lg: 'size-2',
  };
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('flex items-center gap-1.5', className)}
      {...props}
    >
      <span
        className={cn(
          'animate-bounce rounded-full bg-foreground/60 [animation-delay:-0.3s]',
          dotSizes[size],
        )}
      />
      <span
        className={cn(
          'animate-bounce rounded-full bg-foreground/60 [animation-delay:-0.15s]',
          dotSizes[size],
        )}
      />
      <span className={cn('animate-bounce rounded-full bg-foreground/60', dotSizes[size])} />
    </div>
  );
}
