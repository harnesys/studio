import {
  CHAT_FONT_SIZE_LABELS,
  CHAT_FONT_SIZES,
  FEED_DETAIL_LABELS,
  FEED_DETAIL_MODES,
  FEED_FOLLOW_LABELS,
  FEED_FOLLOW_MODES,
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
    chatFontSize,
    setChatFontSize,
    feedFollow,
    setFeedFollow,
    feedDetail,
    setFeedDetail,
  } = useChatPreferences();
  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel id="chat-font-label">Font size</FieldLabel>
        <FieldDescription>Text size for agent and user messages.</FieldDescription>
        <ToggleGroup
          aria-labelledby="chat-font-label"
          variant="segment"
          value={[chatFontSize]}
          data-testid="chat-font-select"
          onValueChange={(value) => {
            const next = value[0];
            if (next && isChatFontSize(next)) {
              setChatFontSize(next);
            }
          }}
        >
          {CHAT_FONT_SIZES.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {CHAT_FONT_SIZE_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel>Follow</FieldLabel>
        <FieldDescription>
          Anchor parks the new turn near the top with a peek of the previous one; Pin holds the live
          edge at the bottom.
        </FieldDescription>
        <ToggleGroup
          aria-label="Feed follow"
          variant="segment"
          value={[feedFollow]}
          onValueChange={(value) => {
            const next = FEED_FOLLOW_MODES.find((mode) => mode === value[0]);
            if (next) {
              setFeedFollow(next);
            }
          }}
        >
          {FEED_FOLLOW_MODES.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {FEED_FOLLOW_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel>Detail</FieldLabel>
        <FieldDescription>
          Quiet collapses finished activity groups; Full keeps them open.
        </FieldDescription>
        <ToggleGroup
          aria-label="Feed detail"
          variant="segment"
          value={[feedDetail]}
          onValueChange={(value) => {
            const next = FEED_DETAIL_MODES.find((mode) => mode === value[0]);
            if (next) {
              setFeedDetail(next);
            }
          }}
        >
          {FEED_DETAIL_MODES.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {FEED_DETAIL_LABELS[item]}
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
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}
