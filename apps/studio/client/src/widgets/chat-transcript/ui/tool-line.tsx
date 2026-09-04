import {
  Code2Icon,
  FileTextIcon,
  GlobeIcon,
  LoaderCircleIcon,
  PencilIcon,
  SearchIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { useState } from 'react';

import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import type { ToolEventPair } from '../model/session-event-groups';
import { toolInput } from '../model/session-event-groups';
import { toolCaption } from '../model/tool-caption';
import { toolDetail, toolMeta } from '../model/tool-output';
import { ToolDetailView } from './tool-detail';
import { ToolInputDialog } from './tool-input-dialog';

const ICONS = {
  terminal: SquareTerminalIcon,
  file: FileTextIcon,
  search: SearchIcon,
  globe: GlobeIcon,
  pencil: PencilIcon,
} as const;

export function ToolLine({
  pair,
  live,
  runLive = live,
}: {
  pair: ToolEventPair;
  live: boolean;
  runLive?: boolean;
}) {
  const expandTools = useChatPreferences((state) => state.expandTools);
  const [manual, setManual] = useState<boolean | undefined>(undefined);
  const [inputOpen, setInputOpen] = useState(false);
  const open = manual ?? (live || expandTools);
  const caption = toolCaption(pair.call, pair.result);
  const detail = toolDetail(pair.call, pair.result);
  const meta = toolMeta(detail);
  const Icon = ICONS[caption.kind];
  const awaitingConfirm = pair.call.phase === 'requested' && !pair.result;
  // Спиннер живёт только пока ран не терминален: запись запроса в истории
  // (confirm отработавшего рана) показывается спокойно.
  const active = runLive && (live || awaitingConfirm);
  const failed = pair.result?.phase === 'failed';
  const rawInput = toolInput(pair);
  const hasInput = Boolean(rawInput.trim().length > 0);
  const exitFailed =
    detail.type === 'terminal' && detail.exitCode !== undefined && detail.exitCode !== 0;
  const httpFailed = detail.type === 'http' && (!detail.ok || detail.status >= 400);

  return (
    <>
      <Collapsible open={open} onOpenChange={setManual}>
        <div className="group flex items-start">
          <div className="min-w-0 flex-1">
            <div className="flex w-full min-w-0 items-center justify-between gap-2 text-left text-[13px] leading-none">
              <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden text-left transition-opacity hover:opacity-80">
                {active ? (
                  <LoaderCircleIcon className="relative z-10 mt-0.5 size-3.5 shrink-0 animate-spin text-live" />
                ) : (
                  <Icon
                    className={cn(
                      'relative z-10 mt-0.5 size-3.5 shrink-0 bg-background',
                      failed || exitFailed || httpFailed
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'shrink-0 font-medium',
                    active ? 'thinking-shimmer' : 'text-foreground/90',
                  )}
                >
                  {caption.title}
                </span>
                {caption.hint ? (
                  <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/80">
                    {caption.hint}
                  </span>
                ) : null}
                {meta.map((chip) => (
                  <Badge
                    key={chip}
                    variant={
                      (exitFailed && chip.startsWith('exit ')) ||
                      (httpFailed && /^\d{3}/.test(chip))
                        ? 'destructive'
                        : 'outline'
                    }
                    className="h-4 shrink-0 px-1 font-normal text-[10px] text-muted-foreground"
                  >
                    {chip}
                  </Badge>
                ))}
                {awaitingConfirm ? (
                  <Badge
                    variant="outline"
                    className="h-4 shrink-0 border-live/40 bg-live/10 px-1 font-normal text-[10px] text-live"
                  >
                    confirm
                  </Badge>
                ) : null}
              </CollapsibleTrigger>

              <div className="flex shrink-0 items-center gap-1.5">
                {hasInput ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-5 px-1.5 font-mono text-[11px] text-muted-foreground/50 transition-colors hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInputOpen(true);
                    }}
                    title="View tool input parameters"
                  >
                    <Code2Icon className="size-3" />
                    <span>input</span>
                  </Button>
                ) : null}
              </div>
            </div>

            <CollapsibleContent>
              <ToolDetailView detail={detail} />
            </CollapsibleContent>
          </div>
        </div>
      </Collapsible>

      {hasInput ? (
        <ToolInputDialog
          open={inputOpen}
          onOpenChange={setInputOpen}
          toolName={pair.call.name}
          rawInput={rawInput}
        />
      ) : null}
    </>
  );
}
