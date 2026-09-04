import { WrenchIcon } from 'lucide-react';
import { TOOL_RUN_COLLAPSE_AT } from '@/shared/config/constants';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import type { ToolEventPair } from '../model/session-event-groups';
import { summarizeToolRun } from '../model/tool-run-summary';
import type { ActivityBadge } from './activity-line';
import { ActivityLine } from './activity-line';
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

  const summary = summarizeToolRun(pairs);
  const hint = summary.parts.slice(0, 3).join(' · ');
  const extra = summary.parts.length > 3 ? ` +${summary.parts.length - 3}` : null;
  const badges: ActivityBadge[] =
    summary.failed > 0 ? [{ text: `${summary.failed} failed`, tone: 'destructive' }] : [];

  return (
    <ActivityLine
      icon={WrenchIcon}
      label={`${summary.total} tools`}
      hint={hint ? `${hint}${extra ?? ''}` : null}
      badges={badges}
      defaultOpen={false}
      hasContent
      indentContent={false}
    >
      <div className="flex flex-col gap-1 pr-1">
        {pairs.map((pair) => (
          <ToolLine key={pair.call.toolCallId} pair={pair} live={false} runLive={runLive} />
        ))}
      </div>
    </ActivityLine>
  );
}
