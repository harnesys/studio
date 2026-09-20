import { SparklesIcon } from 'lucide-react';

export function UnseenSeparator() {
  return (
    <div
      data-testid="unseen-separator"
      className="flex items-center gap-2 text-[11px] text-live leading-none"
    >
      <span className="h-px flex-1 bg-live/40" />
      <SparklesIcon className="size-3 shrink-0" />
      <span className="font-medium">new since last visit</span>
      <span className="h-px flex-1 bg-live/40" />
    </div>
  );
}
