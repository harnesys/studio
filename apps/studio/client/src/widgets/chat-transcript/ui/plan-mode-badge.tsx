import { Badge } from '@/shared/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';

export function PlanModeBadge({ prompt }: { prompt: string }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Badge
            variant="secondary"
            className="h-4 cursor-default px-1.5 py-0 font-normal text-[10px]"
            aria-label="Plan mode prompt"
          >
            Plan
          </Badge>
        }
      />
      <HoverCardContent
        side="bottom"
        align="end"
        className="max-h-80 w-96 overflow-y-auto p-3 text-[11px] leading-4"
      >
        <p className="mb-1.5 font-medium text-[12px]">Plan mode</p>
        <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{prompt}</pre>
      </HoverCardContent>
    </HoverCard>
  );
}
