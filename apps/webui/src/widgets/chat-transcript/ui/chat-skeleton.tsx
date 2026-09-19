import { Skeleton } from '@/shared/ui/skeleton';
export function ChatSkeleton() {
  return (
    <div
      className="fade-in mx-auto flex w-full max-w-3xl animate-in flex-col gap-6 px-4 py-6 duration-200"
      data-testid="chat-skeleton"
    >
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex w-full max-w-lg flex-col gap-2 rounded-2xl border border-border/40 bg-secondary/50 p-4">
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      <div className="flex flex-col items-start gap-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="flex w-full max-w-2xl flex-col gap-2.5 pl-7">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <div className="my-2 flex flex-col gap-2 rounded-lg border border-border/40 bg-card/60 p-3">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 pt-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border/40 bg-secondary/50 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      <div className="flex flex-col items-start gap-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className="flex w-full max-w-2xl flex-col gap-2.5 pl-7">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
