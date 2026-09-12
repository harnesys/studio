import {
  CHAT_FONT_SIZE_LABELS,
  CHAT_FONT_SIZES,
  COMFORT_ANCHOR_MAX,
  COMFORT_ANCHOR_MIN,
  COMFORT_DURATION_MAX,
  COMFORT_DURATION_MIN,
  COMFORT_THRESHOLD_MAX,
  COMFORT_THRESHOLD_MIN,
  isChatFontSize,
  isLiveExpandMode,
  LIVE_EXPAND_LABELS,
  LIVE_EXPAND_MODES,
  useChatPreferences,
} from '@/shared/lib/chat-preferences';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/shared/ui/field';
import { Slider } from '@/shared/ui/slider';
import { Switch } from '@/shared/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

function sliderValue(next: number | readonly number[]): number | undefined {
  const value = Array.isArray(next) ? next[0] : next;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

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
    comfortFollow,
    setComfortFollow,
    comfortAnchor,
    setComfortAnchor,
    comfortThreshold,
    setComfortThreshold,
    comfortDuration,
    setComfortDuration,
    liveExpand,
    setLiveExpand,
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
      <FieldSet>
        <FieldLabel>Follow & Autoscroll</FieldLabel>
        <FieldGroup className="gap-1">
          <Field orientation="horizontal" className="rounded-md px-2 py-2 hover:bg-muted/60">
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor="comfort-follow" className="font-normal">
                Comfort follow
              </FieldLabel>
              <FieldDescription>
                Park the live edge above the bottom and refill in one smooth jump instead of
                scrolling on every line.
              </FieldDescription>
            </div>
            <Switch
              id="comfort-follow"
              checked={comfortFollow}
              onCheckedChange={setComfortFollow}
            />
          </Field>
          <Field className="gap-1.5 rounded-md px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="comfort-anchor">Anchor position</FieldLabel>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {comfortAnchor}%
              </span>
            </div>
            <FieldDescription>
              Where the live edge parks after a refill, measured from the top.
            </FieldDescription>
            <Slider
              id="comfort-anchor"
              min={COMFORT_ANCHOR_MIN}
              max={COMFORT_ANCHOR_MAX}
              step={1}
              value={comfortAnchor}
              disabled={!comfortFollow}
              onValueChange={(next) => {
                const value = sliderValue(next);
                if (value !== undefined) {
                  setComfortAnchor(value);
                }
              }}
            />
          </Field>
          <Field className="gap-1.5 rounded-md px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="comfort-threshold">Bottom trigger</FieldLabel>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {comfortThreshold}px
              </span>
            </div>
            <FieldDescription>
              Refill when the live edge gets this close to the bottom.
            </FieldDescription>
            <Slider
              id="comfort-threshold"
              min={COMFORT_THRESHOLD_MIN}
              max={COMFORT_THRESHOLD_MAX}
              step={4}
              value={comfortThreshold}
              disabled={!comfortFollow}
              onValueChange={(next) => {
                const value = sliderValue(next);
                if (value !== undefined) {
                  setComfortThreshold(value);
                }
              }}
            />
          </Field>
          <Field className="gap-1.5 rounded-md px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="comfort-duration">Jump duration</FieldLabel>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {comfortDuration === 0 ? 'Off' : `${comfortDuration}ms`}
              </span>
            </div>
            <FieldDescription>
              Smooth-scroll length of the refill jump. 0 jumps instantly.
            </FieldDescription>
            <Slider
              id="comfort-duration"
              min={COMFORT_DURATION_MIN}
              max={COMFORT_DURATION_MAX}
              step={50}
              value={comfortDuration}
              disabled={!comfortFollow}
              onValueChange={(next) => {
                const value = sliderValue(next);
                if (value !== undefined) {
                  setComfortDuration(value);
                }
              }}
            />
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLabel>Live element</FieldLabel>
        <FieldGroup className="gap-1">
          <Field className="gap-1.5 rounded-md px-2 py-2">
            <FieldDescription>
              How the active thought or tool stays open while streaming. Finished runs still use the
              toggles above.
            </FieldDescription>
            <ToggleGroup
              aria-label="Live element"
              variant="segment"
              value={[liveExpand]}
              data-testid="live-expand-select"
              onValueChange={(value) => {
                const next = value[0];
                if (next && isLiveExpandMode(next)) {
                  setLiveExpand(next);
                }
              }}
            >
              {LIVE_EXPAND_MODES.map((item) => (
                <ToggleGroupItem key={item} value={item}>
                  {LIVE_EXPAND_LABELS[item]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}
