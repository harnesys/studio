import {
  CHAT_FONT_SIZE_LABELS,
  CHAT_FONT_SIZES,
  isChatFontSize,
  useChatPreferences,
} from '@/shared/lib/chat-preferences';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/shared/ui/field';
import { Switch } from '@/shared/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

export function ChatPane() {
  const {
    detailedStats,
    setDetailedStats,
    expandThinking,
    setExpandThinking,
    expandTools,
    setExpandTools,
    chatFontSize,
    setChatFontSize,
  } = useChatPreferences();

  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel id="chat-font-label">Font size</FieldLabel>
        <FieldDescription>Text size for agent and user messages.</FieldDescription>
        <ToggleGroup
          aria-labelledby="chat-font-label"
          variant="outline"
          spacing={0}
          value={[chatFontSize]}
          data-testid="chat-font-select"
          onValueChange={(value) => {
            const next = value[0];
            if (isChatFontSize(next ?? null)) {
              setChatFontSize(next);
            }
          }}
        >
          {CHAT_FONT_SIZES.map((item) => (
            <ToggleGroupItem key={item} value={item} className="min-w-[72px]">
              {CHAT_FONT_SIZE_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <FieldSet>
        <FieldLabel>Display & Metrics</FieldLabel>
        <FieldGroup className="gap-1">
          <Field orientation="horizontal" className="rounded-md px-2 py-2 hover:bg-muted/60">
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor="detailed-stats" className="font-normal">
                Detailed statistics
              </FieldLabel>
              <FieldDescription>
                Show token counts, cache, reasoning, duration, and cost per model generation and
                turn.
              </FieldDescription>
            </div>
            <Switch
              id="detailed-stats"
              checked={detailedStats}
              onCheckedChange={setDetailedStats}
            />
          </Field>
          <Field orientation="horizontal" className="rounded-md px-2 py-2 hover:bg-muted/60">
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor="expand-thinking" className="font-normal">
                Expand thought by default
              </FieldLabel>
              <FieldDescription>
                Keep thought blocks open when a run finishes. Live streaming still expands them.
              </FieldDescription>
            </div>
            <Switch
              id="expand-thinking"
              checked={expandThinking}
              onCheckedChange={setExpandThinking}
            />
          </Field>
          <Field orientation="horizontal" className="rounded-md px-2 py-2 hover:bg-muted/60">
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor="expand-tools" className="font-normal">
                Expand tools by default
              </FieldLabel>
              <FieldDescription>
                Keep tool result panels open when a run finishes. Live streaming still expands them.
              </FieldDescription>
            </div>
            <Switch id="expand-tools" checked={expandTools} onCheckedChange={setExpandTools} />
          </Field>
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}
