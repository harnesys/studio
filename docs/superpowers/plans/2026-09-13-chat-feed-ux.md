# Chat Feed UX (Approach A) Implementation Plan

> **For agent workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Лента чата треда при работе агента: один владелец скролла, легкий стрим markdown, единый концепт активности (тулы/спавны/map/handoff), 4 ручки настроек.

**Architecture:** Скроллом владеет только `@shadcn/react/message-scroller` (`autoScroll`, `scrollAnchor`, `defaultScrollPosition`), собственный JS-скролл (`comfort-scroll.ts`, `StickOnSend`) удаляется. Стрим: во время live только `remark-gfm`, полный пайплайн по done; живой хвост рисуется через `useLiveTail`-подписку. Вся активность ленты (tool, thought, ask, spawn, map-worker, handoff) рисуется примитивом `ActivityLine` на рейле `ActivityRail`.

**Tech Stack:** React 19, zustand (+persist), Tailwind v4, lucide-react, react-markdown, biome, bun.

**Spec:** `docs/superpowers/specs/2026-09-13-chat-feed-ux-design.md`

> **Сверка с кодом — 2026-09-14, `HEAD 6fa58ec`.** План перечитан против текущего дерева. Подтверждено: реальный API `ActivityLine` = `{icon:LucideIcon, label, hint, badges, tail, active, failed, defaultOpen, hasContent, indentContent, children}` (без `state`/`onOpen`/`data-testid`) — задачи 3–6 это используют корректно; `SpawnInfo.toolStats`/`SpawnToolStat` и поля `MapInfo` (`concurrency,count,ok,failed,status,items[].{index,workerId,preview,message,status}`) существуют; `@shadcn/react@0.3.0` провайдер принимает `autoScroll, defaultScrollPosition:'start'|'end'|'last-anchor', scrollEdgeThreshold, scrollPreviousItemPeek, scrollMargin`, `useMessageScrollerScrollable()` → `{start,end}`. Исправлено: (1) `tool-run.tsx` мёртв — удалён из Task 4 и перенесён на удаление в Task 1, где переименовывается `TOOL_RUN_COLLAPSE_AT`; (2) резолв имени агента — через существующий `agentFallbackName` (`model/agent-label.ts:5`, не `id.slice(0,8)`); (3) `end` в провайдере = «можно скроллить вниз», живой край это `!end` — в `ThreadReadSync`/`LiveEdgeControls` так и записано; (4) импорт-хвосты после удаления comfort/StickOnSend (`useState`,`useLayoutEffect`,`useRef`,`useMessageScroller` из `thread-panel`; `sliderValue`/`Slider` из `chat-pane`) — добавлены в шаги; (5) ручной `paddingBottom:'50vh'` из плана убран по исходникам примитива: встроенный spacer (`[data-message-scroller-spacer]`) исключён из расчёта `end`, а padding контента — входит (`We`/`Se` в dist); ручной padding в `anchor` зашкалил бы «низ» на 50vh ниже последнего сообщения — кнопка возврата не гаснет, unseen растёт, `ThreadReadSync` никогда не помечает тред прочитанным. Резерв под якорь примитив доливает сам (`scrollToElement` с `keepPreviousItemPeek` выставляет высоту spacer'а).

## Global Constraints

- Тесты запрещены (AGENTS.md): не создавать `*.test.ts`/`*.spec.ts`, не ставить vitest/RTL/playwright. Ворота каждой задачи: `bun run typecheck && bun run lint` в `apps/studio/client` + ручная проверка agent-browser.
- Ручная проверка: по решению хозяина на этот прогон (2026-09-15) стенд поднимается в рабочем ворктри на портах из `apps/studio/.env` ворктри (API `3100`, Vite `5183`); основной стенд хозяина (`3000`/`5173`) не трогать и не перезапускать. Перед первой браузерной проверкой прочитать скилл: `agent-browser skills get core`.
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
- Delete: `widgets/chat-transcript/model/comfort-scroll.ts`
- Delete: `widgets/chat-transcript/ui/tool-run.tsx` (мёртв: внешних импортов `ToolRun`/`tool-run` нет, `rg` подтвердит)
- Modify: `widgets/chat-transcript/index.ts:1` (убрать comfort-экспорт)
- Modify: `shared/config/constants.ts:17` (`TOOL_RUN_COLLAPSE_AT` → `ACTIVITY_COLLAPSE_MIN = 2`)
- Modify: `widgets/chat-transcript/ui/thinking-line.tsx`, `tool-line.tsx`, `tool-group.tsx` (переезд на `feedDetail`)
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

Удалить: импорт `useComfortFollow`, `useState<HTMLDivElement | null>` для viewport, `comfortFollow/Anchor/Threshold/Duration`-селекторы, `useComfortFollow(...)`-вызов, `comfortSpacer`/`comfortPinned`/`followPinned`, компонент `StickOnSend` и его использование, `{!followPinned ? ... : null}`-обёртку кнопки, `ref={setViewport}` у Viewport, `style={{ paddingBottom }}` по comfort, param `followPinned` у `ThreadReadSync`. Почистить шапку импортов `thread-panel.tsx`: из `react` убрать `useLayoutEffect`, `useRef`, `useState` (останутся `useCallback`, `useEffect`); из `@/shared/ui/message-scroller` убрать `useMessageScroller` (его держал только `StickOnSend`; `useMessageScrollerScrollable` остаётся).

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
        {unseen > 0 ? `${unseen} new updates, scroll to end` : 'Scroll to end'}
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

Счётчик считает журнальные записи, а не токены и не «сообщения» в бытовом смысле: merged-дельты не увеличивают длину массива (стор склеивает их в хвостовой событие), но каждый открытый text/thought-блок, tool, `agent.spawned`, source — это +1. Один длинный ответ в откреплённом вьюпорте даст «3–10 updates», это ожидаемое поведение из спеки («число SessionEvent»).

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
      >
```

`runKey` в `ownRuns` сделать стабильным с первого рендера: `const first = run.events[0]; const runKey = run.id ?? (first?.type === 'user' ? first.clientEventId : undefined) ?? `run-${index}`` (у user-события есть `clientEventId`, как в `segmentKey`; нужен type-narrowing, в общем union поля нет). Сейчас у живого рана ключ меняется с `run-N` на toolCallId при первом туле: `MessageScrollerItem` перемонтируется, примитив видит «необработанный anchor» (`Ge` по WeakSet) и безусловно паркует вьюпорт к якорю — это вырывает читателя из истории, если он успел открутить вверх за эти секунды.

Резерв низа в `anchor` не нужен вообще: при парковке якоря `scrollToElement(keepPreviousItemPeek)` сам выставляет высоту встроенного spacer'а, а spacer исключён из расчёта `end` — то есть «припаркован к якорю с пустотой снизу» корректно читается как живой край (`!end`), кнопка не показывается, unseen не капает. В `pin` резерва нет по той же причине. Никакого ручного `paddingBottom`/`spacerClassName` не добавляем; если при ручной сверке захочется видимый отступ — только `spacerClassName`, не padding.

Поведение `anchor` по исходникам примитива (зафиксировать в ожиданиях ручной проверки): после отправки вопрос паркуется к верху с peek, и режим `anchored-to-message` держит его там на каждом росте контента (`reanchorToAnchoredMessage` на ResizeObserver). Автоматического «догона хвоста», когда стрим заполнил вьюпорт, в примитиве нет: переход в `following-bottom` происходит только когда пользователь сам доскроллил до края (`!end`) или нажал кнопку (`scrollToEnd` при `autoScroll` включает `following-bottom`). Колесо/тач/клавиши выше края — detach, счётчик unseen капает.

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

Смена `end || followPinned` на `!end` — это фикс, а не регресс: `end` у примитива означает «вниз ещё есть что скроллить», сегодняшнее условие помечает тред прочитанным как раз когда читатель ушёл в историю. Побочный эффект фикса: в `anchor` во время длинного стрима (хвост ушёл за фолд) тред не помечается прочитанным, пока пользователь не вернётся к краю, — это ожидаемо и совпадает со сценарием 2 спеки.

Удалить `StickOnSend`-компонент целиком и его использование; `useLayoutEffect`-импорт убрать, если больше не нужен.

- [ ] **Step 5: Переписать `pages/settings/ui/chat-pane.tsx`**

Четыре поля: Font size (существующий ToggleGroup), Follow (ToggleGroup по `FEED_FOLLOW_MODES`/labels, `aria-label="Feed follow"`, описание: «Anchor parks the new turn near the top with a peek of the previous one; Pin holds the live edge at the bottom»), Detail (ToggleGroup по `FEED_DETAIL_MODES`, описание: «Quiet collapses finished activity groups; Full keeps them open»), Detailed statistics (Switch без изменений). Удалить: три Slider-поля, `Switch comfort-follow`, `expandThinking`, `expandTools`, `liveExpand`-секции, импорты `Slider`, `FieldSet`-обёртки «Follow & Autoscroll»/«Live element» (если FieldSet больше не нужен — убрать и его импорт), импорты `COMFORT_*`/`LIVE_EXPAND_*`/`isLiveExpandMode`, хелпер `sliderValue` (станет мёртвым после удаления слайдеров).

- [ ] **Step 6: Переезд потребителей на `feedDetail`**

`thinking-line.tsx`: убрать `expandThinking`/`liveExpand`, тогда:

```tsx
const feedDetail = useChatPreferences((state) => state.feedDetail);
// defaultOpen={live || feedDetail === 'full'}
// follow={live}
// previewClassName="max-h-28" (снять liveExpand-ветку expanded), fullClassName="max-h-[min(70vh,24rem)]"
```

`tool-line.tsx`: убрать `expandTools`/`liveExpand`:

```tsx
const feedDetail = useChatPreferences((state) => state.feedDetail);
// defaultOpen={live || feedDetail === 'full' || Boolean(map)}
```

`tool-group.tsx`: удалить `TOOL_GROUP_MIN`, `expandTools`, `liveExpand`; добавить импорт `ACTIVITY_COLLAPSE_MIN` из `@/shared/config/constants`:

```tsx
const feedDetail = useChatPreferences((state) => state.feedDetail);
const collapse = feedDetail === 'quiet' && !runLive && pairs.length >= ACTIVITY_COLLAPSE_MIN;
```

(`tool-run.tsx` в этом шаге не правим — он мёртв и удаляется целиком на шаге 7 вместе с последним потребителем `TOOL_RUN_COLLAPSE_AT`.)

- [ ] **Step 7: Удалить `comfort-scroll.ts` и экспорт**

`rm widgets/chat-transcript/model/comfort-scroll.ts`; в `widgets/chat-transcript/index.ts` удалить строку `export { type ComfortScrollOptions, useComfortFollow } from './model/comfort-scroll';`. Удалить мёртвый `widgets/chat-transcript/ui/tool-run.tsx` (внешних импортов `ToolRun`/`tool-run` нет — подтвердит шаг 8). С этого момента `TOOL_RUN_COLLAPSE_AT` не нужен: в шаге 2 переименован в `ACTIVITY_COLLAPSE_MIN`, единственный прежний потребитель удалён.

- [ ] **Step 8: Проверить отсутствие остатков**

Run: `rg "comfort|liveExpand|expandTools|expandThinking|TOOL_RUN_COLLAPSE_AT|TOOL_GROUP_MIN|StickOnSend" apps/studio/client/src` и `bun run typecheck && bun run lint` (в `apps/studio/client`).
Expected: rg пустой (кроме несвязанных слов в чужих доменах, если совпадут — проверить вручную), typecheck/lint без ошибок.

- [ ] **Step 9: Ручная проверка (agent-browser, стенд ворктри: Vite 5183)**

1. Settings → Chat: видны 4 ручки; покрутить Follow/Detail — лента меняется после перезахода в тред.
2. Запустить длинный промпт («расскажи что-нибудь длинное»): во время стрима открутить вверх — вьюпорт стоит, кнопка со счетчиком появилась; клик по кнопке — вернулись к краю, счетчик обнулился, follow продолжил (режим `following-bottom`, хвост догоняется сам).
3. Отправить сообщение в `pin` и `anchor` — в `anchor` вопрос паркуется к верху с peek предыдущего терна; дальше стрим растёт под фолдом, вьюпорт удерживается на якоре, автоматического догона хвоста нет (ожидание из исходников примитива, см. шаг 4).
4. Приход первого tool-события в новый ран не должен дёргать вьюпорт: читатель, ушедший вверх в первые секунды рана, остаётся на месте (стабильный `runKey`, шаг 4).
5. Кнопка возврата на стенде с `prefers-reduced-motion: reduce`: примитив зовёт `scrollTo({behavior:'smooth'})`; если браузер не перебивает smooth при reduced motion — добавить `behavior="auto"` в `LiveEdgeControls` (wrapper прокидывает пропсы в `Primitive.Button`).

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

(тип `code`-пропа взять из `Components['code']`, если биом/TS ругнется на подпись — объявить `const STREAM_COMPONENTS = { code: streamCode, pre: components.pre } as Components`.) `STREAM_COMPONENTS`/`streamCode` объявлять ПОСЛЕ `const components` (файл `markdown.tsx`: `components` на строке 32) — `components.pre` читается в момент объявления константы. `escapeHtml` — существующий хелпер файла (строка 71), повтор not.

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
import { agentFallbackName } from '../model/agent-label';
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
  const name = agent?.name ?? agentFallbackName(spawn.agentId);
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

`hint` родительской строки — одна фраза задачи/активности, обрезает `truncate` в `ActivityLine` (`activity-line.tsx:68`). `ActivityLine` не принимает `data-testid` — старые `spawn-card`/`spawn-row-*` не переносим, внешних ссылок на них нет (проверено grep). `toolEntries` ключуется по имени — коллизии `name:phase` из старого файла больше нет (Spec §2). Осознанные потери карточки: цветная точка агента (`agentColorClass`) не переносится — статус несёт иконка/бейджи; русские счётчики «шаг/токен» и «нет активности Ns» заменяются общими англоязычными бейджами (`N steps`, `idle Ns`) в тон остальной ленте.

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
- Modify: `widgets/chat-transcript/ui/run-turn.tsx` (не меняется логика spawns-prop; проверить импорты)

**Interfaces:**
- Produces: `ActivityChunk` с членом `{ type: 'spawn'; event: SessionEvent & { type: 'agent.spawned' } }`; `summarizeActivity(chunks: GroupActivityChunk[], spawnsById: Map<string, SpawnInfo>): ActivitySummary` (`{ label, parts, failed }`); `TurnSegment` без `spawn`.
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
export type ActivitySummary = { label: string; parts: string[]; failed: number };

export function summarizeActivity(
  chunks: GroupActivityChunk[],
  spawnsById: Map<string, SpawnInfo>,
): ActivitySummary {
  const pairs = groupPairs(chunks);
  const spawnChunks = chunks.filter((chunk) => chunk.type === 'spawn');
  const agentsFailed = spawnChunks.filter(
    (chunk) => spawnsById.get(chunk.event.spawnId)?.status === 'failed',
  ).length;
  const summary = summarizeToolRun(pairs);
  const labels: string[] = [];
  if (summary.total > 0) labels.push(`${summary.total} ${summary.total === 1 ? 'tool' : 'tools'}`);
  if (spawnChunks.length > 0) {
    labels.push(`${spawnChunks.length} ${spawnChunks.length === 1 ? 'agent' : 'agents'}`);
  }
  if (labels.length === 0) labels.push('activity');
  return {
    label: labels.join(' · '),
    parts: summary.parts,
    failed: summary.failed + agentsFailed,
  };
}
```

`SpawnInfo` — type-импорт из `./spawn-groups` (тот же слой model). `parts`, а не готовый `hint`, чтобы вызывающий сохранил текущий overflow `+N` (`HINT_PARTS`); `failed` включает провалившихся агентов — сводка «2 tools · 1 agent» с failed-агентом обязана нести destructive-бейдж.

- [ ] **Step 3: `tool-group.tsx`**

`chunks.length >= ACTIVITY_COLLAPSE_MIN` вместо `pairs.length >= ...`; collapsed-рендер на `summarizeActivity`:

```tsx
import { ACTIVITY_COLLAPSE_MIN } from '@/shared/config/constants';
import { type GroupActivityChunk, groupPairs, summarizeActivity } from '../model/tool-run-summary';
// ...
const collapse = feedDetail === 'quiet' && !runLive && chunks.length >= ACTIVITY_COLLAPSE_MIN;
// ...
const spawnsById = new Map((spawns ?? []).map((item) => [item.spawnId, item]));
const summary = summarizeActivity(chunks, spawnsById);
const hint = summary.parts.slice(0, HINT_PARTS).join(' · ');
const extra = summary.parts.length > HINT_PARTS ? ` +${summary.parts.length - HINT_PARTS}` : null;
const badges: ActivityBadge[] =
  summary.failed > 0 ? [{ text: `${summary.failed} failed`, tone: 'destructive' }] : [];
return (
  <ActivityLine
    icon={WrenchIcon}
    label={summary.label}
    hint={hint ? `${hint}${extra ?? ''}` : null}
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

- [ ] **Step 6: `tool-run.tsx` уже удалён**

`rg "tool-run'|ToolRun\b" apps/studio/client/src` — пусто (файл удалён в Task 1, шаг 7). Если что-то осталось — это забытый импорт, допилить каскадом (RULE D1/D4), заглушку не ставить.

- [ ] **Step 7: Ворота**

`bun run typecheck && bun run lint`. Ручная: терн со спавном + несколькими тулами до/после текста — завершенная группа сворачивается в `2 tools · 1 agent`, живой хвост раскрыт, клик по сводке разворачивает строки, у спавна работают chevron-детали и `open`.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/client/src
git commit -m "refactor: spawns join activity groups, type-aware collapsed summary"
```

---

### Task 5: Map-воркеры как вложенные строки

**Files:**
- Modify: `widgets/chat-transcript/ui/map-items.tsx`
- Modify: `widgets/chat-transcript/ui/tool-line.tsx`

**Interfaces:**
- Consumes: `ActivityLine`, `MapInfo/MapItemInfo` без изменений, `useSpawnStream` без изменений.
- Produces: `MapItems({ threadId, map })` — только список вложенных строк (шапка переехала в родителя); `mapLineHint(map: MapInfo): string` — в `model/map-groups.ts` (чистая функция, не в ui: `tool-line` импортирует её из model, cross-ui-импортов не появляется).

- [ ] **Step 1: `map-items.tsx`**

Удалить `StatusDot`, `DOT_TONE`, `STATUS_LABEL`, boxed-разметку `MapItemRow`, `cn`-импорт если не нужен. В `model/map-groups.ts` добавить `mapLineHint` (единственный источник строки прогресса, её рендерит родитель):

```ts
export function mapLineHint(map: MapInfo): string {
  const done = map.items.filter((item) => item.status !== 'running').length;
  const mode = map.concurrency === 'sequential' ? 'sequential' : 'parallel';
  return `${mode} · ${done}/${map.count || map.items.length}`;
}
```

Новый вид `map-items.tsx`:

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
import { agentFallbackName } from '../model/agent-label';
import { ActivityLine } from './activity-line';

export function HandoffLine({ agentId }: { agentId: string }) {
  const agent = useAgentStore((state) => state.byId(agentId));
  const name = agent?.name ?? agentFallbackName(agentId);
  return (
    <ActivityLine icon={ArrowRightLeftIcon} label="Handoff" hint={name} hasContent={false} />
  );
}
```

`byId` (не `items.find`), как в `SpawnLine`/`spawn-card.tsx`. `agentFallbackName` уже реальный экспорт `model/agent-label.ts:5`. `ActivityRail` не оборачиваем — сегмент рендерится внутри общего rail `ActivityItems`-пути; handoff-сегмент — отдельный, поэтому `ActivityRail` нужен на call-site в `agent-turn.tsx` (шаг 2), а не внутри строки.

- [ ] **Step 2: Каскад удаления `handoff-card.tsx`**

`agent-turn.tsx`: импорт `HandoffCard` → `HandoffLine` from `./handoff-line`; handoff-ветка `TurnSegmentView`: `return <ActivityRail><HandoffLine agentId={segment.agentId} /></ActivityRail>;` (`ActivityRail` уже импортирован в файле, строка 28 — как в spawn-ветке Task 3). `widgets/chat-transcript/index.ts`: удалить `export { HandoffCard } from './ui/handoff-card';`. `rm ui/handoff-card.tsx`. `rg "HandoffCard|handoff-card|handoff-message" apps/studio/client/src` — пусто. `FeedNotice` остаётся (system/error/schedule/compaction).

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

### Task 8: Thread-journal: фикс `!end` и удаление локального `StickOnSend`

Скоуп расширен по решению хозяина (2026-09-15): в `widgets/thread-journal` та же ошибка семантики, что чинилась в Task 1 для чата: `ThreadReadSync` пишет `setViewingAtEnd(threadId, end)`, где `end` у примитива означает «вниз ещё есть что скроллить» — тред помечается прочитанным ровно когда читатель от края, и не помечается, когда прижат к краю. Плюс локальная копия `StickOnSend` — второй владелец скролла на рантайм-дерге `scrollToEnd`. Настройки, `scrollAnchor` и unseen-кнопка в журнал не зовём: у журнала нет `feedFollow`-конфига, одна кнопка возврата уже смонтирована постоянно.

**Files:**
- Modify: `widgets/thread-journal/ui/thread-journal.tsx`

**Interfaces:** ничего не производит; `EmptyThreadReadSync` и `RunDivider` не трогать.

- [ ] **Step 1: `ThreadReadSync`**

`const { end } = useMessageScrollerScrollable();` оставить; `setViewingAtEnd(threadId, end)` → `setViewingAtEnd(threadId, !end)`; условие `if (end && contentEpoch >= 0)` → `if (!end && ...)`; в deps `!end` завести через локальную `const viewingAtEnd = !end` (как в чат-версии после Task 1).

- [ ] **Step 2: удалить `StickOnSend`**

Компонент и его использование `<StickOnSend streaming={...} />` удалить; из импортов убрать `useLayoutEffect`, `useRef` (из `react`) и `useMessageScroller` (из `@/shared/ui/message-scroller`); `useEffect` остаётся. Провайдер `autoScroll` не менять: привязка к краю при старте рана теперь только за примитивом (режим `following-bottom`).

- [ ] **Step 3: Ворота**

`bun run typecheck && bun run lint`. `rg "StickOnSend|useMessageScroller\b" apps/studio/client/src/widgets/thread-journal` — пусто. Ручная (агентский тред с расписания/webhook): открыть журнал, прижат к краю — тред становится прочитанным при новых событиях; открутить вверх — новые события не помечают прочитанным; старт нового рана не дёргает вьюпорт, читатель история остаётся на месте; клик по кнопке возврата возвращает к краю и дальше follow работает.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/client/src
git commit -m "fix: thread journal read-sync matches scroller end semantics, drop stick-on-send"
```

---

### Task 9: Финальная проверка и README

**Files:**
- Modify: `widgets/chat-transcript/README.md` (если упоминает удаленное — проверить)

**Interfaces:** только проверка.

- [ ] **Step 1: Остатки**

`rg "comfortFollow|comfortAnchor|comfortThreshold|comfortDuration|liveExpand|expandThinking|expandTools|TOOL_RUN_COLLAPSE_AT|TOOL_GROUP_MIN|StickOnSend|SpawnCard|HandoffCard|useComfortFollow" apps/studio/client/src` — пусто. `bun run typecheck && bun run lint` в `apps/studio/client`.

- [ ] **Step 2: Прогнать сценарии секции 7 спеки через agent-browser**

Порты стенда — из `apps/studio/.env` воркспейса запуска (в этой прогонке — API 3100, Vite 5183; основной стенд 3000/5173 не трогать).

1–7 из `docs/superpowers/specs/2026-09-13-chat-feed-ux-design.md`. Сценарий 6 (миграция v2→v3): в DevTools выставить в `localStorage['studio-chat-preferences']` JSON `{state:{comfortFollow:false,expandTools:true},version:2}`, reload, открыть Settings → Chat: Follow=Pin, Detail=Full, версий слайдеров нет.

- [ ] **Step 3: README**

Если `widgets/chat-transcript/README.md` или соседние доки упомянуты comfort-follow/Settings-слайдеры — поправить одной строкой. Иначе без изменений.

- [ ] **Step 4: Commit (если есть правки)**

```bash
git add apps/studio/client/src
git commit -m "docs: chat transcript README matches feed settings v3"
```
