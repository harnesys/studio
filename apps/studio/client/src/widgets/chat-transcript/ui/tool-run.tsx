import { WrenchIcon } from 'lucide-react';
import { useState } from 'react';
import { TOOL_RUN_COLLAPSE_AT } from '@/shared/config/constants';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { Badge } from '@/shared/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import type { ToolEventPair } from '../model/session-event-groups';
import { summarizeToolRun } from '../model/tool-run-summary';
import { ToolLine } from './tool-line';

export function ToolRun({
  pairs,
  live,
  runLive = live,
}: {
  pairs: ToolEventPair[];
  live: boolean;
  runLive?: boolean;
}) {
  const expandTools = useChatPreferences((state) => state.expandTools);
  const collapse = !live && !expandTools && pairs.length >= TOOL_RUN_COLLAPSE_AT;
  const [open, setOpen] = useState(!collapse);
  const summary = summarizeToolRun(pairs);
  const hint = summary.parts.slice(0, 3).join(' · ');
  const extra = summary.parts.length > 3 ? ` +${summary.parts.length - 3}` : null;

  if (!collapse) {
    return (
      <div className="flex flex-col gap-1">
        {pairs.map((pair, index) => (
          <ToolLine
            key={pair.call.toolCallId}
            pair={pair}
            live={live && index === pairs.length - 1}
            runLive={runLive}
          />
        ))}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-1">
        <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-left text-[13px] leading-none transition-opacity hover:opacity-80">
          <WrenchIcon className="relative z-10 size-3.5 shrink-0 bg-background text-muted-foreground" />
          <span className="shrink-0 font-medium text-foreground/90">{summary.total} tools</span>
          {hint ? (
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/80">
              {hint}
              {extra}
            </span>
          ) : null}
          {summary.failed > 0 ? (
            <Badge variant="destructive" className="h-4 shrink-0 px-1 font-normal text-[10px]">
              {summary.failed} failed
            </Badge>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-1">
            {pairs.map((pair) => (
              <ToolLine key={pair.call.toolCallId} pair={pair} live={false} runLive={runLive} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
