# Chat Feed UX (Approach A) Implementation Plan

> **For agent workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Лента чата треда при работе агента: один владелец скролла, легкий стрим markdown, единый концепт активности (тулы/спавны/map/handoff), 4 ручки настроек.

**Architecture:** Скроллом владеет только `@shadcn/react/message-scroller` (`autoScroll`, `scrollAnchor`, `defaultScrollPosition`), собственный JS-скролл (`comfort-scroll.ts`, `StickOnSend`) удаляется. Стрим: во время live только `remark-gfm`, полный пайплайн по done; живой хвост рисуется через `useLiveTail`-подписку. Вся активность ленты (tool, thought, ask, spawn, map-worker, handoff) рисуется примитивом `ActivityLine` на рейле `ActivityRail`.

**Tech Stack:** React 19, zustand (+persist), Tailwind v4, lucide-react, react-markdown, biome, bun.

**Spec:** `docs/superpowers/specs/2026-09-13-chat-feed-ux-design.md`

## Global Constraints

- Тесты запрещены (AGENTS.md): не создавать `*.test.ts`/`*.spec.ts`, не ставить vitest/RTL/playwright. Ворота каждой задачи: `bun run typecheck && bun run lint` в `apps/studio/client` + ручная проверка agent-browser.
- Ручная проверка: дев-стенд уже запущен хозяином (API `3000`, Vite `5173`). Не поднимать второй, не убивать чужие процессы. Перед первой браузерной проверкой прочитать скилл: `agent-browser skills get core`.
- Пульсы/шиммер (`thinking-shimmer`, `thinking-icon-pulse`, `live-dot`) не трогать.
- Типы: именованные unions, не писать `(typeof CONST)[number]` и `T['field']`. Слайсы FSD снаружи только через `index.ts`.
- Удаления полные (RULE D1–D6): файл удалять вместе с ре-экспортами, импортами и dead code; без заглушек и shims.
- После каждого коммита рабочее дерево в пределах задачи; коммитить только файлы задачи.
- Все пути в задачах относительно `apps/studio/client/src/`.

---

### Task 1: Настройки v3 + один владелец скролла

Заменяет 9 ручек на 4, выкидывает `comfort-scroll.ts` и `StickOnSend`, включает нативный follow/anchor MessageScroller, unseen-бейдж на кнопке возврата.

**Files:**
- Modify: `shared/lib/chat-preferences.ts` (переписать)
- Modify: `pages/settings/ui/chat-pane.tsx` (переписать)
- Modify: `widgets/chat-transcript/ui/thread-panel.tsx`
- Modify: `widgets/chat-transcript/model/comfort-scroll.ts` (удалить)
- Modify: `widgets/chat-transcript/index.ts:1` (убрать comfort-экспорт)
- Modify: `shared/config/constants.ts:17` (`TOOL_RUN_COLLAPSE_AT` → `ACTIVITY_COLLAPSE_MIN = 2`)
- Modify: `widgets/chat-transcript/ui/thinking-line.tsx`, `tool-line.tsx`, `tool-group.tsx`, `tool-run.tsx` (переезд на `feedDetail`)
- Create: `widgets/chat-transcript/model/use-unseen-count.ts`

**Interfaces:**
- Produces: `useChatPreferences` с полями `feedFollow: 'anchor' | 'pin'`, `feedDetail: 'quiet' | 'full'`, `detailedStats`, `chatFontSize`; `ACTIVITY_COLLAPSE_MIN: number`; `useUnseenCount(total: number, atEnd: boolean): number`.
- Consumes: `@shadcn/react/message-scroller` props `autoScroll`, `defaultScrollPosition: 'start' | 'end' | 'last-anchor'`, `scrollAnchor`, `scrollPreviousItemPeek`, `scrollEdgeThreshold`, `useMessageScrollerScrollable(): { start: boolean; end: boolean }`.

- [ ] **Step 1: Переписать `shared/lib/chat-preferences.ts`**

Оставить `ChatFontSize`-блок как есть (включая `applyChatFont`, `readStoredChatFont`, `isChatFontSize`). Удалить: `LIVE_EXPAND_*`, `isLiveExpandMode`, `COMFORT_*`, `clampComfort*`, поля/сеттеры `expandThinking`, `expandTools`, `comfort*`, `liveExpand`. Добавить:

```ts
export type FeedFollowMode = 'anchor' | 'pin';
export const FEED_FOLLOW_MODES: readonly FeedFollowMode[] = ['anchor', 'pin'];
export const FEED_FOLLOW_LABELS: Record<FeedFollowMode, string> = {
  anchor: 'Anchor',
  pin: 'Pin',
};
export const DEFAULT_FEED_FOLLOW: FeedFollowMode = 'anchor';

export type FeedDetailMode = 'quiet' | 'full';
export const FEED_DETAIL_MODES: readonly FeedDetailMode[] = ['quiet', 'full'];
export const FEED_DETAIL_LABELS: Record<FeedDetailMode, string> = {
  quiet: 'Quiet',
  full: 'Full',
};
export const DEFAULT_FEED_DETAIL: FeedDetailMode = 'quiet';
```

Тип стора:

```ts
export type ChatPreferences = {
  detailedStats: boolean;
  chatFontSize: ChatFontSize;
  feedFollow: FeedFollowMode;
  feedDetail: FeedDetailMode;
  setDetailedStats: (enabled: boolean) => void;
  setChatFontSize: (size: ChatFontSize) => void;
  setFeedFollow: (mode: FeedFollowMode) => void;
  setFeedDetail: (mode: FeedDetailMode) => void;
};
```

 persist-конфиг:

```ts
{
  name: CHAT_PREFERENCES_STORAGE_KEY,
  version: 3,
  migrate: (persisted, version) => {
    const prev = persisted as Record<string, unknown>;
    const state = {
      detailedStats: typeof prev.detailedStats === 'boolean' ? prev.detailedStats : true,
      chatFontSize: isChatFontSize(typeof prev.chatFontSize === 'string' ? prev.chatFontSize : null)
        ? (prev.chatFontSize as ChatFontSize)
        : DEFAULT_CHAT_FONT_SIZE,
      feedFollow: prev.comfortFollow === false ? 'pin' : DEFAULT_FEED_FOLLOW,
      feedDetail: prev.expandTools === true ? 'full' : DEFAULT_FEED_DETAIL,
    } satisfies ChatPreferences;
    return state;
  },
  onRehydrateStorage: () => (state) => {
    if (state) {
      applyChatFont(state.chatFontSize);
    }
  },
}
```

Внимание: `satisfies ChatPreferences` не сойдется из-за сеттеров — снять `satisfies`, вернуть объект как `ChatPreferences` через явные сеттеры в `create` (миграция трогает только data-поля). Реализация в `create`: сеттеры `set({ feedFollow })` / `set({ feedDetail })`.

- [ ] **Step 2: `constants.ts`**

```ts
// было: export const TOOL_RUN_COLLAPSE_AT = 6;
/** Завершенная группа активности от этого числа элементов сворачивается в сводку. */
export const ACTIVITY_COLLAPSE_MIN = 2;
```

- [ ] **Step 3: Создать `widgets/chat-transcript/model/use-unseen-count.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

/** Число событий, приростившихся, пока вьюпорт отцеплен от живого края. */
export function useUnseenCount(total: number, atEnd: boolean): number {
  const baseRef = useRef(total);
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    if (atEnd) {
      baseRef.current = total;
      setUnseen(0);
      return;
    }
    setUnseen(Math.max(0, total - baseRef.current));
  }, [atEnd, total]);
  return unseen;
}
```

- [ ] **Step 4: Переписать скролл-часть `thread-panel.tsx`**

Удалить: импорт `useComfortFollow`, `useState<HTMLDivElement | null>` для viewport, `comfortFollow/Anchor/Threshold/Duration`-селекторы, `useComfortFollow(...)`-вызов, `comfortSpacer`/`followPinned`, компонент `StickOnSend` и его импорт-использование, `{!followPinned ? ... : null}`-обёртку кнопки, `ref={setViewport}` у Viewport, `style={{ paddingBottom }}` по comfort.

Добавить:

```tsx
import { ArrowDownIcon } from 'lucide-react';
import { useUnseenCount } from '../model/use-unseen-count';

// внутри ThreadPanel:
const feedFollow = useChatPreferences((state) => state.feedFollow);
```

`useMessageScrollerScrollable` работает только внутри `MessageScrollerProvider`, поэтому unseen-кнопка живёт во внутреннем компоненте (рядом с `ThreadReadSync`):

```tsx
function LiveEdgeControls({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const total = useSessionStore((state) => state.events[threadId]?.length ?? 0);
  const unseen = useUnseenCount(total, !end);
  return (
    <MessageScrollerButton>
      <ArrowDownIcon />
      <span className="sr-only">
        {unseen > 0 ? `${unseen} new messages, scroll to end` : 'Scroll to end'}
      </span>
      {unseen > 0 ? (
        <span className="absolute -top-1 -end-1 min-w-4 rounded-full bg-live px-1 font-medium text-[10px] text-white tabular-nums">
          {unseen > 99 ? '99+' : unseen}
        </span>
      ) : null}
    </MessageScrollerButton>
  );
}
```

`ThreadPanel` (`MessageScrollerProvider` → внутри `<LiveEdgeControls threadId={threadId} />` вместо условной кнопки):

```tsx
<MessageScrollerProvider
  autoScroll={true}
  defaultScrollPosition={feedFollow === 'anchor' ? 'last-anchor' : 'end'}
  scrollPreviousItemPeek={48}
  scrollEdgeThreshold={24}
>
  <MessageScroller>
    <MessageScrollerViewport>
      <MessageScrollerContent
        className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]"
        style={spacerRef.current ? { paddingBottom: '50vh' } : undefined}
      >
```

Монотонный резерв низа (latch-реф, никогда не снимается):

```tsx
const spacerRef = useRef(false);
if (!spacerRef.current && events.some((ev) => ev.type === 'user')) {
  spacerRef.current = true;
}
```

`scrollAnchor` на item-строках `ownRuns`:

```tsx
<MessageScrollerItem
  key={runKey}
  messageId={runKey}
  scrollAnchor={feedFollow === 'anchor' && run.events[0]?.type === 'user'}
>
```

`ThreadReadSync` больше не принимает `followPinned`:

```tsx
function ThreadReadSync({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const contentEpoch = useSessionStore((state) => state.contentEpoch[threadId] ?? 0);
  const viewingAtEnd = !end;
  // эффекты без изменений
}
```

Удалить `StickOnSend`-компонент целиком и его использование; `useLayoutEffect`-импорт убрать, если больше не нужен.

- [ ] **Step 5: Переписать `pages/settings/ui/chat-pane.tsx`**

Четыре поля: Font size (существующий ToggleGroup), Follow (ToggleGroup по `FEED_FOLLOW_MODES`/labels, `aria-label="Feed follow"`, описание: «Anchor parks the new turn near the top with a peek of the previous one; Pin holds the live edge at the bottom»), Detail (ToggleGroup по `FEED_DETAIL_MODES`, описание: «Quiet collapses finished activity groups; Full keeps them open»), Detailed statistics (Switch без изменений). Удалить: три Slider-поля, `Switch comfort-follow`, `expandThinking`, `expandTools`, `liveExpand`-секции, импорты `Slider`, `FieldSet`-обёртки «Follow & Autoscroll»/«Live element», импорты `COMFORT_*`/`LIVE_EXPAND_*`/`isLiveExpandMode`.

- [ ] **Step 6: Переезд потребителей на `feedDetail`**

`thinking-line.tsx`: убрать `expandThinking`/`liveExpand`, тогда:

```tsx
const feedDetail = useChatPreferences((state) => state.feedDetail);
// defaultOpen={live || feedDetail === 'full'}
// follow={live}
// previewClassName="max-h-28" (убеждены ветки expanded), fullClassName="max-h-[min(70vh,24rem)]"
```

`tool-line.tsx`: убрать `expandTools`/`liveExpand`:

```tsx
const feedDetail = useChatPreferences((state) => state.feedDetail);
// defaultOpen={live || feedDetail === 'full' || Boolean(map)}
```

`tool-group.tsx`: удалить `TOOL_GROUP_MIN`, `expandTools`, `liveExpand`:

```tsx
const feedDetail = useChatPreferences((state) => state.feedDetail);
const collapse = feedDetail === 'quiet' && !runLive && pairs.length >= ACTIVITY_COLLAPSE_MIN;
```

`tool-run.tsx`: аналогично `collapse = feedDetail === 'quiet' && !live && pairs.length >= ACTIVITY_COLLAPSE_MIN` (импорт `TOOL_RUN_COLLAPSE_AT` → `ACTIVITY_COLLAPSE_MIN` из `@/shared/config/constants`).

- [ ] **Step 7: Удалить `comfort-scroll.ts` и экспорт**

`rm widgets/chat-transcript/model/comfort-scroll.ts`; в `widgets/chat-transcript/index.ts` удалить строку `export { type ComfortScrollOptions, useComfortFollow } from './model/comfort-scroll';`.

- [ ] **Step 8: Проверить отсутствие остатков**

Run: `rg "comfort|liveExpand|expandTools|expandThinking|TOOL_RUN_COLLAPSE_AT|StickOnSend" apps/studio/client/src` и `bun run typecheck && bun run lint` (в `apps/studio/client`).
Expected: rg пустой (кроме несвязанных слов в чужих доменах, если совпадут — проверить вручную), typecheck/lint без ошибок.

- [ ] **Step 9: Ручная проверка (agent-browser, стенд 5173)**

1. Settings → Chat: видны 4 ручки; покрутить Follow/Detail — лента меняется после перезахода в тред.
2. Запустить длинный промпт («расскажи что-нибудь длинное»): во время стрима открутить вверх — вьюпорт стоит, кнопка со счетчиком появилась; клик по кнопке — вернулись к краю, счетчик обнулился, follow продолжил.
3. Отправить сообщение в `pin` и `anchor` — в `anchor` вопрос паркуется к верху с.peek предыдущего терна.

- [ ] **Step 10: Commit**

```bash
git add apps/studio/client/src
git commit -m "refactor: single scroll owner in chat feed, feed settings v3 (follow/detail)"
```

---

### Task 2: Легкий стрим markdown + caret + memo хвоста

**Files:**
- Modify: `shared/ui/markdown.tsx`
- Modify: `widgets/chat-transcript/ui/agent-turn.tsx` (`LiveMarkdown`)
- Modify: `widgets/chat-transcript/ui/run-turn.tsx` (компаратор)
- Modify: `app/styles/base.css` (caret)

**Interfaces:**
- Produces: `Markdown({ text, className, streaming })`; CSS-класс caret `data-streaming`.
- Consumes: `useLiveTail` (без изменений), флаги `live` из Task 1.

- [ ] **Step 1: `markdown.tsx` — стрим-ветка**

```tsx
type MarkdownProps = {
  text: string;
  className?: string;
  streaming?: boolean;
};

const STREAM_REMARK = [remarkGfm];
const FULL_REMARK = [remarkGfm, remarkMath];

export const Markdown = memo(function Markdown({ text, className, streaming = false }: MarkdownProps) {
  return (
    <div
      className={cn('markdown px-1.5 text-foreground leading-[1.45]', className)}
      data-streaming={streaming ? 'true' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={streaming ? STREAM_REMARK : FULL_REMARK}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        components={streaming ? STREAM_COMPONENTS : components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
```

`STREAM_COMPONENTS`: инлайн-код как в `components.code` (тот же класс), fenced — plain без hljs/mermaid:

```tsx
function streamCode({ className, children }: { className?: string; children?: React.ReactNode }) {
  const text = String(children).replace(/\n$/, '');
  if (!className && !text.includes('\n')) {
    return (
      <code className="rounded-sm bg-muted px-1 py-px text-[12px] text-foreground">{text}</code>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-2.5 py-2">
      <code
        className="font-mono text-[12px] leading-[1.45]"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped plain text
        dangerouslySetInnerHTML={{ __html: escapeHtml(text) }}
      />
    </pre>
  );
}

const STREAM_COMPONENTS: Components = { code: streamCode, pre: components.pre };
```

(тип `code`-пропа взять из `Components['code']`, если биом/TS ругнется на подпись — объявить `const STREAM_COMPONENTS = { code: streamCode, pre: components.pre } as Components`.)

- [ ] **Step 2: `LiveMarkdown` в `agent-turn.tsx`**

```tsx
return <Markdown text={display} streaming={live} />;
```

`pendingReply`-плейсхолдер (строка `ThinkingLine` в `ActivityRail`, `agent-turn.tsx:159`) оставить: он уже резервирует ровно одну строку высоты.

- [ ] **Step 3: Компаратор `run-turn.tsx` — живой хвост рисуется подпиской**

Добавить рядом с `sameEventList`:

```ts
type DeltaEvent = SessionEvent & { type: 'text-delta' | 'reasoning-delta' };

const isDelta = (ev: SessionEvent): ev is DeltaEvent =>
  ev.type === 'text-delta' || ev.type === 'reasoning-delta';

/** Live-хвост меняется в store на каждый токен; рисуется через useLiveTail, props тупеют. */
function sameEventsIgnoringLiveTail(a: SessionEvent[], b: SessionEvent[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  if (a[0] !== b[0]) {
    return false;
  }
  const ta = a[a.length - 1];
  const tb = b[b.length - 1];
  if (isDelta(ta) && isDelta(tb) && ta.id === tb.id) {
    return true;
  }
  return ta === tb;
}
```

В memo-компараторе в ветке `prev.streaming || next.streaming` заменить `sameEventList` на `sameEventsIgnoringLiveTail`. В не-streaming ветке `sameEventList` оставить.

- [ ] **Step 4: Caret в `app/styles/base.css`**

После блока `.activity-rail-live`:

```css
/* Живой край markdown: блок-caret на последнем элементе, CSS-only. */
@keyframes stream-caret-blink {
  0%,
  55% {
    opacity: 1;
  }
  56%,
  100% {
    opacity: 0;
  }
}

.markdown[data-streaming='true'] > :last-child::after {
  content: '';
  display: inline-block;
  width: 0.45em;
  height: 1em;
  margin-inline-start: 2px;
  vertical-align: -0.12em;
  background: var(--live);
  animation: stream-caret-blink 1s steps(1) infinite;
}
```

В существующий блок `@media (prefers-reduced-motion: reduce)` добавить `.markdown[data-streaming='true'] > :last-child::after { animation: none; }`.

- [ ] **Step 5: Ворота**

`bun run typecheck && bun run lint`. Ручная проверка: тред с длинным ответом, содержащим fenced code и mermaid, — во время стрима код plain, подсветка/mermaid/katex появляются сразу после done; caret мигает только на живом блоке; при чтении истории с откруткой верстка завершенных тернов не меняется (DevTools: нет re-render Markdown-блоков, `Profiler` или `?react_perf`).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/client/src
git commit -m "perf: plain markdown during streaming, full pipeline on done, stream caret"
```

---

### Task 3: SpawnCard → SpawnLine на ActivityLine

**Files:**
- Modify: `widgets/chat-transcript/ui/spawn-card.tsx` → переименовать в `widgets/chat-transcript/ui/spawn-line.tsx`
- Modify: `widgets/chat-transcript/ui/agent-turn.tsx` (`TurnSegmentView` spawn-ветка)

**Interfaces:**
- Consumes: `ActivityLine`/`ActivityBadge`, `SpawnInfo` из `../model/spawn-groups` (не меняется), `useSpawnStream`, `useNow`, `formatDuration/formatTokenCount` из `@/entities/session`, `useChatPreferences(s => s.feedDetail)`.
- Produces: `SpawnLine({ threadId, spawnId, spawn, live, onOpen }: { threadId: string; spawnId: string; spawn: SpawnInfo; live: boolean; onOpen?: (spawnId: string) => void })`.

- [ ] **Step 1: Создать `spawn-line.tsx`, удалить `spawn-card.tsx`**

Каркас (карточные константы `DOT_TONE/SURFACE/RAIL/STATUS_LABEL/TOOL_DOT` и `StatusDot` — не переносятся):

```tsx
import { BotIcon, WrenchIcon } from 'lucide-react';
import { useAgentStore } from '@/entities/agent';
import { formatDuration, formatTokenCount } from '@/entities/session';
import { useChatPreferences } from '@/shared/lib/chat-preferences';
import { Button } from '@/shared/ui/button';
import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import type { SpawnInfo, SpawnToolStat } from '../model/spawn-groups';
import { useNow } from '../model/use-now';
import { useSpawnStream } from '../model/use-spawn-stream';
import { type ActivityBadge, ActivityLine } from './activity-line';

const LIVE_TICK_MS = 5000;
const STALLED_AFTER_MS = 90_000;

export function SpawnLine({
  threadId,
  spawnId,
  spawn,
  live,
  onOpen,
}: {
  threadId: string;
  spawnId: string;
  spawn: SpawnInfo;
  live: boolean;
  onOpen?: (spawnId: string) => void;
}) {
  useSpawnStream(threadId, spawnId, spawn.status === 'running');
  const feedDetail = useChatPreferences((state) => state.feedDetail);
  const agent = useAgentStore((state) => state.byId(spawn.agentId));
  const name = agent?.name ?? spawn.agentId.slice(0, 8);
  const running = spawn.status === 'running';
  const now = useNow(running && live ? LIVE_TICK_MS : 0);
  const elapsed =
    running && spawn.spawnedAt !== undefined
      ? formatDuration(Math.max(0, now - spawn.spawnedAt))
      : undefined;
  const stalledMs =
    running && spawn.lastSeenAt !== undefined ? now - spawn.lastSeenAt : undefined;
  const badges: ActivityBadge[] = [];
  if (running) {
    if (elapsed !== undefined) badges.push({ text: elapsed, tone: 'live' });
    if (stalledMs !== undefined && stalledMs > STALLED_AFTER_MS) {
      badges.push({ text: `idle ${Math.floor(stalledMs / 1000)}s`, tone: 'live' });
    }
  } else {
    if (spawn.steps > 0) badges.push({ text: `${spawn.steps} steps` });
    if (spawn.tokens > 0) badges.push({ text: formatTokenCount(spawn.tokens) });
  }
  const failed = spawn.status === 'failed';
  if (failed) {
    badges.unshift({ text: 'failed', tone: 'destructive' });
  }
  const toolEntries = Object.entries(spawn.toolStats).filter(
    ([, stat]) => stat.requested + stat.completed + stat.failed > 0,
  );

  return (
    <ActivityLine
      icon={BotIcon}
      label={name}
      hint={spawn.taskText ?? spawn.preview ?? null}
      badges={badges}
      active={running}
      failed={failed}
      defaultOpen={live || feedDetail === 'full'}
      hasContent
      tail={
        onOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 shrink-0 px-1.5 font-mono text-[11px] text-muted-foreground/50 transition-colors hover:text-foreground"
            title="Open agent tab"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(spawnId);
            }}
          >
            <span>open</span>
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-1">
        {toolEntries.map(([toolName, stat]) => (
          <ActivityLine
            key={toolName}
            icon={WrenchIcon}
            label={toolName}
            hint={formatToolStat(stat)}
            failed={stat.failed > 0}
          />
        ))}
        {spawn.preview ? (
          <ExpandableScroll>
            <div className="whitespace-pre-wrap text-[13px] text-muted-foreground/90 leading-5">
              {spawn.preview}
            </div>
          </ExpandableScroll>
        ) : null}
      </div>
    </ActivityLine>
  );
}

function formatToolStat(stat: SpawnToolStat): string {
  const parts: string[] = [];
  if (stat.completed > 0) parts.push(`${stat.completed} ok`);
  if (stat.failed > 0) parts.push(`${stat.failed} failed`);
  if (stat.requested > stat.completed + stat.failed) parts.push('running');
  return parts.join(' · ');
}
```

`hint` родительской строки — одна фраза задачи/активности, обрезает `truncate` в `ActivityLine` (`activity-line.tsx:68`). `ActivityLine` не принимает `data-testid` — старые `spawn-card`/`spawn-row-*` не переносим, внешних ссылок на них нет (проверено grep). `toolEntries` ключуется по имени — коллизии `name:phase` из старого файла больше нет (Spec §2).

- [ ] **Step 2: Подключение в `agent-turn.tsx`**

Спавн пока остается отдельным сегментом (слияние в группы — Task 4), но на рейле:

```tsx
if (segment.type === 'spawn') {
  const spawn = spawns?.find((item) => item.spawnId === segment.spawnId);
  if (!spawn) {
    return null;
  }
  return (
    <ActivityRail live={live && spawn.status === 'running'}>
      <SpawnLine
        threadId={threadId ?? ''}
        spawnId={segment.spawnId}
        spawn={spawn}
        live={live}
        onOpen={onOpenSpawn}
      />
    </ActivityRail>
  );
}
```

Импорт `SpawnCard` заменить на `SpawnLine` из `./spawn-line`. `data-testid="spawn-card"` больше нет — проверить, что в Studio нет селекторов на него: `rg "spawn-card" apps/studio/client/src` (ожидание: только старое определение файла).

- [ ] **Step 3: Ворота**

`bun run typecheck && bun run lint`. Ручная: в тред-ленте, где агент спавнит субагента — одна строка с BotIcon, имя агента, задача в хинте, живой shimmer + `elapsed`-бейдж; chevron раскрывает счётчики тулов и preview; `open` открывает IDE-таб; после done строка плоская и сворачивается в `quiet`.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/client/src
git commit -m "refactor: spawn card becomes activity line with stats and open action"
```

---

### Task 4: Спавны в группах активности + сводка с типами

`agent.spawned` переезжает из отдельного сегмента в activity-чанки; сводка завершенной группы считает типы; `tool-run.tsx` (без потребителей) удаляется.

**Files:**
- Modify: `widgets/chat-transcript/model/turn-segments.ts`
- Modify: `widgets/chat-transcript/model/tool-run-summary.ts`
- Modify: `widgets/chat-transcript/ui/activity-items.tsx`
- Modify: `widgets/chat-transcript/ui/tool-group.tsx`
- Modify: `widgets/chat-transcript/ui/agent-turn.tsx`
- Delete: `widgets/chat-transcript/ui/tool-run.tsx`
- Modify: `widgets/chat-transcript/ui/run-turn.tsx` (не меняется логика spawns-prop; проверить импорты)

**Interfaces:**
- Produces: `ActivityChunk` с членом `{ type: 'spawn'; event: SessionEvent & { type: 'agent.spawned' } }`; `summarizeActivity(chunks: GroupActivityChunk[]): { label: string; hint: string | null; failed: number }`; `TurnSegment` без `spawn`.
- Consumes: `SpawnLine` (Task 3), `summarizeToolRun` (остаётся для пар), `extractSpawns` (без изменений).

- [ ] **Step 1: `turn-segments.ts`**

Удалить `| { type: 'spawn'; spawnId: string }` из `TurnSegment`. В `groupSegments` ветку `agent.spawned` заменить на `activity.push(ev); continue;` (без `flushActivity()`). В `segmentKey` удалить spawn-ветку; в `segmentSpacing` удалить `curr?.type === 'spawn'`.

- [ ] **Step 2: `tool-run-summary.ts`**

`ActivityChunk` добавить `| { type: 'spawn'; event: SessionEvent & { type: 'agent.spawned' } }`; `GroupActivityChunk = Extract<ActivityChunk, { type: 'reasoning' | 'tools' | 'spawn' }>`. В `chunkEvents` перед `if (ev.type === 'tool')`:

```ts
if (ev.type === 'agent.spawned') {
  flushTools();
  flushReasoning();
  chunks.push({ type: 'spawn', event: ev as SessionEvent & { type: 'agent.spawned' } });
  continue;
}
```

В `groupActivityChunks` условие `chunk.type === 'reasoning' || chunk.type === 'tools'` расширить `|| chunk.type === 'spawn'`. Добавить:

```ts
export type ActivitySummary = { label: string; hint: string | null; failed: number };

export function summarizeActivity(chunks: GroupActivityChunk[]): ActivitySummary {
  const pairs = groupPairs(chunks);
  const agents = chunks.filter((chunk) => chunk.type === 'spawn').length;
  const summary = summarizeToolRun(pairs);
  const labels: string[] = [];
  if (summary.total > 0) labels.push(`${summary.total} ${summary.total === 1 ? 'tool' : 'tools'}`);
  if (agents > 0) labels.push(`${agents} ${agents === 1 ? 'agent' : 'agents'}`);
  const hint = summary.parts.slice(0, 3).join(' · ') || null;
  if (labels.length === 0) labels.push('activity');
  return { label: labels.join(' · '), hint, failed: summary.failed };
}
```

- [ ] **Step 3: `tool-group.tsx`**

`chunks.length >= ACTIVITY_COLLAPSE_MIN` вместо `pairs.length >= ...`; collapsed-рендер на `summarizeActivity`:

```tsx
import { ACTIVITY_COLLAPSE_MIN } from '@/shared/config/constants';
import { type GroupActivityChunk, groupPairs, summarizeActivity } from '../model/tool-run-summary';
// ...
const collapse = feedDetail === 'quiet' && !runLive && chunks.length >= ACTIVITY_COLLAPSE_MIN;
// ...
const summary = summarizeActivity(chunks);
const badges: ActivityBadge[] =
  summary.failed > 0 ? [{ text: `${summary.failed} failed`, tone: 'destructive' }] : [];
return (
  <ActivityLine
    icon={WrenchIcon}
    label={summary.label}
    hint={summary.hint}
    badges={badges}
    defaultOpen={false}
    hasContent
    indentContent={false}
  >/* children как сейчас */</ActivityLine>
);
```

`renderChunk`: spawn-ветка:

```tsx
if (chunk.type === 'spawn') {
  const spawn = spawns?.find((item) => item.spawnId === chunk.event.spawnId);
  if (!spawn) {
    return null;
  }
  return (
    <SpawnLine
      key={chunk.event.spawnId}
      threadId={threadId ?? ''}
      spawnId={chunk.event.spawnId}
      spawn={spawn}
      live={live}
      onOpen={onOpenSpawn}
    />
  );
}
```

`ToolGroup` принимает новые props `spawns?: SpawnInfo[]`, `threadId?: string` (есть), `onOpenSpawn?: (spawnId: string) => void`; добавить в сигнатуру и в вызов `renderChunk`. Импорт `SpawnLine`, тип `SpawnInfo`.

- [ ] **Step 4: `activity-items.tsx`**

`ActivityItems` принимает `spawns?: SpawnInfo[]`, `onOpenSpawn?: (id: string) => void`, прокидывает в `ToolGroup`. Соло-чанков `spawn` не бывает (всегда в группе из 1+).

- [ ] **Step 5: `agent-turn.tsx`**

`TurnSegmentView` больше не рендерит `spawn`-сегмент (типа удалён в шаге 1). Удалить ветку `if (segment.type === 'spawn') { ... }` (это тот `ActivityRail` + `SpawnLine`, что добавили в Task 3 Step 2) и импорт `SpawnLine`/`ActivityRail`, если они больше не нужны здесь. В `activity`-ветку (`ActivityItems`) добавить прокид `spawns={spawns} onOpenSpawn={onOpenSpawn}`. `AssistantMessageView` собирает `spawns` из prop в `ActivityItems`; `hasInFlight` (строка ~133) остаётся (спавны не tool-события). `segmentSpacing` уже не ссылается на `spawn` (шаг 1).

- [ ] **Step 6: Удалить `tool-run.tsx`**

`rg "tool-run'|ToolRun\b" apps/studio/client/src` перед удалением: ожидаем только сам файл (внешних импортов нет). `rm widgets/chat-transcript/ui/tool-run.tsx`.

- [ ] **Step 7: Ворота**

`bun run typecheck && bun run lint`. Ручная: терн со спавном + несколькими тулами до/после текста — завершенная группа сворачивается в `2 tools · 1 agent`, живой хвост раскрыт, клик по сводке разворачивает строки, у спавна работают chevron-детали и `open`.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/client/src
git commit -m "refactor: spawns join activity groups, type-aware collapsed summary; drop dead ToolRun"
```

---

### Task 5: Map-воркеры как вложенные строки

**Files:**
- Modify: `widgets/chat-transcript/ui/map-items.tsx`
- Modify: `widgets/chat-transcript/ui/tool-line.tsx`

**Interfaces:**
- Consumes: `ActivityLine`, `MapInfo/MapItemInfo` без изменений, `useSpawnStream` без изменений.
- Produces: `MapItems({ threadId, map })` — только список вложенных строк (шапка переехала в родителя); `mapLineHint(map: MapInfo): string` экспортируется из `map-items.tsx` для tool-line.

- [ ] **Step 1: `map-items.tsx`**

Удалить `StatusDot`, `DOT_TONE`, `STATUS_LABEL`, boxed-разметку `MapItemRow`, `cn`-импорт если не нужен. Новый вид:

```tsx
import { BotIcon } from 'lucide-react';
import type { MapInfo, MapItemInfo } from '../model/map-groups';
import { useSpawnStream } from '../model/use-spawn-stream';
import { type ActivityBadge, ActivityLine } from './activity-line';

function MapItemRow({ threadId, item }: { threadId: string; item: MapItemInfo }) {
  useSpawnStream(threadId, item.workerId, item.status === 'running');
  const badges: ActivityBadge[] =
    item.status === 'failed' ? [{ text: 'failed', tone: 'destructive' }] : [];
  return (
    <ActivityLine
      icon={BotIcon}
      label={`#${item.index + 1}`}
      hint={item.preview ?? null}
      badges={badges}
      active={item.status === 'running'}
      failed={item.status === 'failed'}
      defaultOpen={item.status === 'failed'}
      hasContent={Boolean(item.message)}
    >
      {item.message ? (
        <div className="whitespace-pre-wrap text-[13px] text-destructive/90 leading-5">
          {item.message}
        </div>
      ) : null}
    </ActivityLine>
  );
}

export function mapLineHint(map: MapInfo): string {
  const done = map.items.filter((item) => item.status !== 'running').length;
  const mode = map.concurrency === 'sequential' ? 'sequential' : 'parallel';
  return `${mode} · ${done}/${map.count || map.items.length}`;
}

export function MapItems({ threadId, map }: { threadId: string; map: MapInfo }) {
  if (map.items.length === 0) {
    return (
      <div className="text-[12px] text-muted-foreground">
        {map.status === 'running' ? `Running ${map.count} item${map.count === 1 ? '' : 's'}…` : 'No item streams'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid="map-items">
      {[...map.items].sort((a, b) => a.index - b.index).map((item) => (
        <MapItemRow key={item.workerId} threadId={threadId} item={item} />
      ))}
    </div>
  );
}
```

`#index`: в данных `index` 0-based (`map-groups.ts:169` для legacy; `map.item.started.index` из журнала) — сверить на живой проверке и при необходимости снять `+ 1` (источник: `map-groups.ts:214-220`).

- [ ] **Step 2: `tool-line.tsx` — шапка map у родителя**

```tsx
import { mapForToolCall, mapLineHint } from '../model/map-groups';
// ...
const mapHint = map ? mapLineHint(map) : null;
const mapBadges: ActivityBadge[] = map
  ? map.status === 'running'
    ? [{ text: 'running', tone: 'live' as const }]
    : [
        ...(map.ok > 0 ? [{ text: `${map.ok} ok` } as ActivityBadge] : []),
        ...(map.failed > 0 ? [{ text: `${map.failed} failed`, tone: 'destructive' as const }] : []),
      ]
  : [];
// hint={mapHint ? [caption.hint, mapHint].filter(Boolean).join(' · ') : caption.hint}
// badges: [...metaBadges, ...confirmBadges, ...mapBadges] (вместо отдельной mapRunning-ветки)
```

Существование `mapRunning`-бейджа в текущем `badges` (`tool-line.tsx:82`) сохранить через `mapBadges`. `MapItems` рендерить в контенте строки как сейчас (`map && threadId`-ветка без изменений).

- [ ] **Step 3: Ворота**

`bun run typecheck && bun run lint`. Ручная: тред с `control:map` (запустить агента с параллельной задачей) — родительская строка map показывает `parallel · 2/4`, живые воркеры shimmer-строками `#1/#2`, failed — destructive-сообщение под chevron, завершенная карта сворачивается в тихом режиме.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/client/src
git commit -m "refactor: map workers as nested activity lines, summary on parent line"
```

---

### Task 6: Handoff как строка

**Files:**
- Create: `widgets/chat-transcript/ui/handoff-line.tsx`
- Delete: `widgets/chat-transcript/ui/handoff-card.tsx`
- Modify: `widgets/chat-transcript/ui/agent-turn.tsx`, `widgets/chat-transcript/index.ts:26`

**Interfaces:**
- Produces: `HandoffLine({ agentId }: { agentId: string })`.

- [ ] **Step 1: `handoff-line.tsx`**

```tsx
import { ArrowRightLeftIcon } from 'lucide-react';
import { useAgentStore } from '@/entities/agent';
import { ActivityLine } from './activity-line';
import { ActivityRail } from './activity-rail';

export function HandoffLine({ agentId }: { agentId: string }) {
  const agent = useAgentStore((state) => state.items.find((item) => item.id === agentId));
  const name = agent?.name ?? agentId.slice(0, 8);
  return (
    <ActivityRail>
      <ActivityLine icon={ArrowRightLeftIcon} label="Handoff" hint={name} hasContent={false} />
    </ActivityRail>
  );
}
```

- [ ] **Step 2: Каскад удаления `handoff-card.tsx`**

`agent-turn.tsx`: импорт `HandoffCard` → `HandoffLine` from `./handoff-line`; handoff-ветка `TurnSegmentView`: `return <HandoffLine agentId={segment.agentId} />;`. `widgets/chat-transcript/index.ts`: удалить `export { HandoffCard } from './ui/handoff-card';`. `rm ui/handoff-card.tsx`. `rg "HandoffCard|handoff-card|handoff-message" apps/studio/client/src` — пусто. `FeedNotice` остаётся (system/error/schedule/compaction).

- [ ] **Step 3: Ворота**

`bun run typecheck && bun run lint`. Ручная: тред с handoff (два агента в workspace, `transfer_to`/пресет с handoff) — в ленте строка `⇄ Handoff · Имя` на общем рейле, без карточки-баннера.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/client/src
git commit -m "refactor: handoff notice becomes rail activity line"
```

---

### Task 7: ExpandableScroll: единый preview, overscroll

**Files:**
- Modify: `shared/ui/expandable-scroll.tsx`

**Interfaces:**
- Consumes/Produces: без изменения публичных props.

- [ ] **Step 1: Правки**

```ts
const PREVIEW = 'max-h-28';
// было max-h-32
```

Внутреннему div (строка `ref={ref}`) в класс добавить `overscroll-contain`:

```tsx
className={cn('select-text overscroll-contain', follow ? 'overflow-hidden' : 'overflow-auto', ...)}
```

- [ ] **Step 2: Ворота**

`bun run typecheck && bun run lint`. Ручная: открытый tool output больше 112 px — колесо на границе внутреннего скролла продолжает крутить внешний вьюпорт; превью мыслей и деталей одной высоты.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/client/src
git commit -m "fix: unified collapsed preview height, wheel passthrough at inner scroll edges"
```

---

### Task 8: Финальная проверка и README

**Files:**
- Modify: `widgets/chat-transcript/README.md` (если упоминает удаленное — проверить)

**Interfaces:** только проверка.

- [ ] **Step 1: Остатки**

`rg "comfortFollow|comfortAnchor|comfortThreshold|comfortDuration|liveExpand|expandThinking|expandTools|TOOL_RUN_COLLAPSE_AT|SpawnCard|HandoffCard|useComfortFollow" apps/studio/client/src` — пусто. `bun run typecheck && bun run lint` в `apps/studio/client`.

- [ ] **Step 2: Прогнать сценарии секции 7 спеки через agent-browser (стенд 5173)**

1–7 из `docs/superpowers/specs/2026-09-13-chat-feed-ux-design.md`. Сценарий 6 (миграция v2→v3): в DevTools выставить в `localStorage['studio-chat-preferences']` JSON `{state:{comfortFollow:false,expandTools:true},version:2}`, reload, открыть Settings → Chat: Follow=Pin, Detail=Full, версий слайдеров нет.

- [ ] **Step 3: README**

Если `widgets/chat-transcript/README.md` или соседние доки упомянуты comfort-follow/Settings-слайдеры — поправить одной строкой. Иначе без изменений.

- [ ] **Step 4: Commit (если есть правки)**

```bash
git add apps/studio/client/src
git commit -m "docs: chat transcript README matches feed settings v3"
```
