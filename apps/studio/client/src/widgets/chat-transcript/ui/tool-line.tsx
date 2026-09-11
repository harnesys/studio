import {
  Code2Icon,
  FileTextIcon,
  GlobeIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  SearchIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { useState } from 'react';

import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import type { MapInfo } from '../model/map-groups';
import { mapForToolCall } from '../model/map-groups';
import type { ToolEventPair } from '../model/session-event-groups';
import { toolInput } from '../model/session-event-groups';
import { toolCaption } from '../model/tool-caption';
import { toolDetail, toolMeta } from '../model/tool-output';
import type { ActivityBadge } from './activity-line';
import { ActivityLine } from './activity-line';
import { MapItems } from './map-items';
import { ToolDetailView } from './tool-detail';
import { ToolInputDialog } from './tool-input-dialog';

const ICONS = {
  terminal: SquareTerminalIcon,
  file: FileTextIcon,
  search: SearchIcon,
  globe: GlobeIcon,
  pencil: PencilIcon,
  question: MessageCircleQuestionIcon,
} as const;

export function ToolLine({
  pair,
  live,
  runLive = live,
  threadId,
  maps,
}: {
  pair: ToolEventPair;
  live: boolean;
  runLive?: boolean;
  threadId?: string;
  maps?: MapInfo[];
}) {
  const expandTools = useChatPreferences((state) => state.expandTools);
  const [inputOpen, setInputOpen] = useState(false);
  const caption = toolCaption(pair.call, pair.result);
  const detail = toolDetail(pair.call, pair.result);
  const meta = toolMeta(detail);
  const Icon = ICONS[caption.kind];
  const awaitingConfirm = pair.call.phase === 'requested' && !pair.result;
  const askPrompt = pair.ask?.prompt?.trim() ? pair.ask.prompt.trim() : null;
  const hasConfirm = Boolean(pair.ask) || awaitingConfirm;
  // Спиннер живёт только пока ран не терминален: запись запроса в истории
  // (confirm отработавшего рана) показывается спокойно.
  const map = maps ? mapForToolCall(maps, pair.call.toolCallId) : undefined;
  const mapRunning = map?.status === 'running';
  const active = runLive && (live || awaitingConfirm || mapRunning);
  const failed = pair.result?.phase === 'failed' || map?.status === 'failed';
  const rawInput = toolInput(pair);
  const hasInput = Boolean(rawInput.trim().length > 0);
  const exitFailed =
    detail.type === 'terminal' && detail.exitCode !== undefined && detail.exitCode !== 0;
  const httpFailed = detail.type === 'http' && (!detail.ok || detail.status >= 400);

  const badges: ActivityBadge[] = [
    ...meta.map((chip) => ({
      text: chip,
      tone:
        (exitFailed && chip.startsWith('exit ')) || (httpFailed && /^\d{3}/.test(chip))
          ? ('destructive' as const)
          : ('default' as const),
    })),
    ...(hasConfirm
      ? [{ text: 'confirm', tone: awaitingConfirm ? ('live' as const) : ('default' as const) }]
      : []),
    ...(mapRunning ? [{ text: 'running', tone: 'live' as const }] : []),
  ];

  return (
    <>
      <ActivityLine
        icon={Icon}
        label={caption.title}
        hint={caption.hint}
        badges={badges}
        active={active}
        failed={failed}
        defaultOpen={live || expandTools || Boolean(map)}
        hasContent
        tail={
          hasInput ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn(
                'h-5 shrink-0 px-1.5 font-mono text-[11px] text-muted-foreground/50',
                'transition-colors hover:text-foreground',
              )}
              onClick={(e) => {
                e.stopPropagation();
                setInputOpen(true);
              }}
              title="View tool input parameters"
            >
              <Code2Icon className="size-3" />
              <span>input</span>
            </Button>
          ) : null
        }
      >
        {askPrompt ? (
          <div className="whitespace-pre-wrap pb-1 text-[12px] text-muted-foreground/90 leading-5">
            {askPrompt}
          </div>
        ) : null}
        {map && threadId ? (
          <div className="pb-1">
            <MapItems threadId={threadId} map={map} />
          </div>
        ) : null}
        <ToolDetailView detail={detail} />
      </ActivityLine>

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
