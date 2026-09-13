# Лента чата треда при работе агента: скролл, стрим, активность, настройки

Факт: источник дискомфорта найден в коде, а не в ощущениях. Скроллом владеют три механизма сразу, стрим репарсит весь markdown на каждый токен, завершенные группы схлопываются с потерей места, настройки дублируют друг друга. Подход A: один владелец скролла на нативном якоре, легкий пайплайн стрима, единый стиль активности, 4 ручки настроек. Пульсы, шиммер и live-анимации не трогаем.

## 1. ThreadPanel: один владелец скролла

Файлы: `widgets/chat-transcript/ui/thread-panel.tsx`, `widgets/chat-transcript/model/comfort-scroll.ts`, `shared/ui/message-scroller.tsx`.

Решение: `MessageScrollerProvider` всегда с `autoScroll={true}`. `useComfortFollow` удаляется из рантайма вместе с `comfortAnchor/comfortThreshold/comfortDuration`. `StickOnSend` удаляется: старт рана больше не дергает `scrollToEnd`, пока пользователь читает историю.

Поведение:

* Отправка: один скролл. User-сообщение нового терна ставится якорем к верху вьюпорта с peek предыдущего терна (`scrollAnchor` на `MessageScrollerItem` user-строки, `scrollPreviousItemPeek`). Дальше стрим не двигает вьюпорт, пока контент не заполнит его.
* Стрим: ничего. Нативный `overflow-anchor` держит позицию. Был внизу — едет вниз. Ушел вверх — стоит.
* История сверху, смена треда: позиция сохраняется по стабильному `messageId` (`runKey`, `failure.id` уже стабильны, оставить).
* Открытие треда: `last-anchor` (последнее user-сообщение), fallback `end`.
* Резерв низа: постоянный отступ `~50vh` после первого user-сообщения. Добавляется один раз, никогда не снимается. Тоггл `paddingBottom` по `comfortPinned` (`thread-panel.tsx:133`) удаляется.
* Кнопка возврата: `MessageScrollerButton` всегда в DOM, видимость по detached. Добавить счетчик unseen (число `SessionEvent`, пришедших пока detached) и `aria-label` с числом. Клик возвращает к краю и гасит счетчик.

Режимы Follow (см. раздел 5): `anchor` и `pin` различаются только стартом терна и догоном. `anchor`: старт паркует user-сообщение к верху, follow подхватывает когда стрим заполняет вьюпорт. `pin`: старт сразу держит живой край. Открутка вверх всегда detach, возврат вниз всегда reattach. Оба режима используют один код, флаг меняет только стартовую парковку.

## 2. LiveMarkdown: легкий стрим, тяжелый финал

Файлы: `widgets/chat-transcript/ui/agent-turn.tsx` (`LiveMarkdown`), `shared/ui/markdown.tsx`, `entities/session/model/live-tail.ts`, `widgets/chat-transcript/model/turn-segments.ts`, `widgets/chat-transcript/ui/run-turn.tsx`.

Решение: во время стрима только `remark-gfm`. Полный пайплайн (`rehype-katex`, `highlight.js`, mermaid) включается по `done`. Код-блоки в стриме рисуются plain monospace без `highlightAuto` на каждый токен. Причина: `highlightAuto` перебирает все языки в главном потоке на каждую дельту (`markdown.tsx:60`).

Детали:

* `Markdown` получает проп `streaming?: boolean`. Стрим-ветка исключает `rehypeKatex` и вызывает `highlightCode` в режиме plain. Финальный рендер без изменений.
* Батчинг дельт через `requestAnimationFrame` уже есть в `live-tail.ts:47`. Оставить. Новых тредов и воркеров нет.
* Завершенные блоки memo и не ререндерятся. `RunTurn` memo (`run-turn.tsx:177`) дополнить: сравнение хвостового флага `streaming` уже есть, добавить ранний выход когда изменился только живой хвост (он идет через `useLiveTail`, а не через пропсы).
* Ключи: `segmentKey` (`turn-segments.ts:106`) оставить позиционными внутри рана (аппенд-стабильны). Коллизия чипов `key={`${tool.name}:${tool.phase}`}` (`spawn-card.tsx:119`) исчезает: вложенные тул-строки спавна ключуются по имени из `toolStats` (раздел 3).
* Курсор стрима: CSS-only caret на хвосте живого блока. Плейсхолдер `ThinkingLine text=""` при `pendingReply` (`agent-turn.tsx:159`) заменяется резервом в одну строку высоты, чтобы rail-узел не появлялся из ничего со сдвигом layout.

## 3. Единый концепт активности: тулы, спавны, map, handoff

Файлы: `widgets/chat-transcript/ui/activity-line.tsx`, `activity-rail.tsx`, `tool-line.tsx`, `tool-group.tsx`, `tool-run.tsx`, `spawn-card.tsx`, `map-items.tsx`, `handoff-card.tsx`, `ask-line.tsx`, `thinking-line.tsx`, `agent-turn.tsx` (`TurnSegmentView`).

Примитив один: `ActivityLine` на рейле `ActivityRail`. Строка = иконка 3.5 + лейбл + моно-хинт + бейджи + chevron. Так уже выглядят тулы и мысли. Спавны, map-воркеры и handoff переводятся на тот же примитив; карточные контейнеры в ленте исчезают. Скоуп раздела — лента; IDE-таб `spawn-view.tsx` не меняется.

Иерархия акцентов (единая для всех строк):

* running: shimmer лейбла и пульс иконки (существующие `thinking-shimmer`/`thinking-icon-pulse`, не трогаем), живой рейл. Никаких заливок фона.
* failed: `text-destructive` иконки и бейджа, заливка не больше `bg-destructive/8`.
* done: нейтральный `opacity-80`, без фона и рейла-акцента.
* `StatusDot` из ленты уходит: состояние несёт цвет иконки. `SURFACE`/`RAIL`/`DOT_TONE` из `spawn-card.tsx:11,17,23` и `map-items.tsx:7` удаляются.

**Spawn как строка.** `SpawnCard` переписывается на `ActivityLine`: иконка `BotIcon`, лейбл — имя агента, хинт — задача одной фразой (mono, truncate), бейджи — `steps · tokens · elapsed` (`tabular-nums`, тик `useNow` 5000 мс; `elapsed` через `SpawnInfo.startedAt`, счётчики уже в `spawn-groups.ts`). Живой ран: `active` как у тулов. Хвост строки — ghost-кнопка `open` в стиле `input`-кнопки `tool-line.tsx:99`, открывает spawn-таб (текущий клик по карточке, `onOpenSpawn`). Контент по chevron: полная задача (`ExpandableScroll`), последние тули как вложенные `ActivityLine` по одному на `toolStats`-имя со счётчиком (`read ×2 · edit ×1`), preview последней активности, строка stalled при паузе >90 с. Вся информация current-карточки сохраняется, меняется только упаковка.

**Map как вложенные строки.** `MapItemRow` (`map-items.tsx:19`) становится вложенным `ActivityLine` с `indentContent={false}` внутри строки map-тула: иконка `BotIcon`, лейбл `#index`, хинт — preview (truncate 120 уже в `map-groups.ts:55`), failed — `message` в контенте. Живой воркер: `active`. Заголовок `Sequential · 3/5 · 2 ok` (`map-items.tsx:62`) уходит в хинт родительской map-строки; итог `ok/failed` — бейджи родительской строки. Вложенные строки map сворачиваются общим правилом группы.

**Handoff как строка.** `HandoffCard` с `FeedNotice` (`handoff-card.tsx:12`) становится нехолопсируемой `ActivityLine` на рейле: иконка `ArrowRightLeftIcon`, лейбл `Handoff`, хинт — имя агента. `TurnSegmentView` (`agent-turn.tsx:260`) рендерит его как `ActivityRail` с одной строкой, рейл не обрывается между сегментами. `FeedNotice` остаётся для system/error/compaction-уведомлений: это не активность агента.

**Правило раскрытия.** Жив только хвост. Завершенная группа сворачивается в сводку при `items >= ACTIVITY_COLLAPSE_MIN = 2`. Сводка считает типы в группе: `3 tools · 1 agent`, `summarizeToolRun` (`tool-run-summary.ts:17`) расширяется спавнами; единая константа заменяет пару `TOOL_RUN_COLLAPSE_AT = 6` (`shared/config/constants.ts:17`) и `TOOL_GROUP_MIN = 2` (`tool-group.tsx:14`). Свёртка происходит только для групп выше живого края; ручное открытие (`manual` в `activity-line.tsx:44`) переживает новые события, смена `defaultOpen` при live→done высоту не дёргает. `Detail: full` (раздел 5) отключает авторсвёртку завершенных.

Результат инструмента доступен всегда: `ToolInputDialog` и `ToolDetailView` без изменений, сворачивается только контейнер. `AskLine` waiting-индикатор без изменений.

## 4. ExpandableScroll: убрать вложенную борьбу

Файлы: `shared/ui/expandable-scroll.tsx`, `widgets/chat-transcript/ui/thinking-line.tsx`, `widgets/chat-transcript/ui/tool-detail.tsx`.

Решение: во время live внутренних скроллбаров нет (`overflow-hidden` + удержание хвоста, уже реализовано `follow` в `expandable-scroll.tsx:40`). После done появляется `More/Less` с fade (уже есть). Изменения:

* Единый preview `max-h-28` для мыслей и деталей. Сейчас `thinking-line.tsx:42` и дефолт `max-h-32` (`expandable-scroll.tsx:5`) расходятся.
* Внутренним контейнерам `overscroll-behavior: contain` с пробросом колеса наружу на границе, чтобы внешний вьюпорт продолжал движение.
* Высота preview фиксируется при seal хвоста и не меняется от настроек или перехода live→done.

## 5. ChatPane: 4 ручки вместо 9

Файлы: `shared/lib/chat-preferences.ts`, `pages/settings/ui/chat-pane.tsx`.

Состав:

* `Follow`: `anchor | pin`. `ToggleGroup segment`, дефолт `anchor`. Описание: где паркуется новый терн и как догоняет стрим.
* `Detail`: `quiet | full`. Дефолт `quiet`. `quiet` сворачивает завершенные группы активности от 2 элементов (тулы, спавны, map-воркеры, мысли, раздел 3). `full` держит открытым как сегодняшний `expandTools`.
* `Stats`: `detailedStats`, без изменений.
* `Font size`: без изменений.

Удаляются из UI и стора: `expandThinking`, `expandTools`, `liveExpand`, `comfortFollow`, `comfortAnchor`, `comfortThreshold`, `comfortDuration`, три слайдера. Живое поведение всегда раскрыто, завершенное всегда по `Detail`.

Миграция `persist version 3` (`chat-preferences.ts:145`): `comfortFollow true → anchor`, `false → pin`. `expandTools true → full`, иначе `quiet`. Остальные поля дропаются. Старые ключи не читаются после миграции.

## 6. Кейсы: compaction, branch, errors, пустота, треды

* Retry, regenerate, branch, compaction, ошибки: программных скроллов нет. Исключения: скролл отправки (раздел 1) и клик кнопки возврата.
* `CompactionPendingCard`, `ForkSeparator`, `BranchPointBadge`, `FailedMessageView`, `ThreadEmpty`, `ChatSkeleton`: монтируются без сдвига уже видимого (якорь держит браузер).
* Переключение тредов: `MAX_MOUNTED_THREADS = 8` без изменений. Каждый смонтированный тред открывается на своем `last-anchor`.
* `prefers-reduced-motion`: существующий блок в `app/styles/base.css:147` без изменений. Кнопка возврата при reduced motion прыгает мгновенно.

## 7. Верификация

Юнит и e2e тесты запрещены правилами репозитория, `*.test.ts` не создаются. Проверка ручная через `agent-browser` на живом стенде (порты 3000/5173 уже заняты хозяином, второй стенд не поднимать):

1. Отправка ставит user-сообщение к верху с peek предыдущего.
2. Чтение истории во время стрима: вьюпорт стоит, растет счетчик unseen.
3. Кнопка возврата гасит счетчик и включает follow.
4. Завершенная группа активности (тулы, спавны, map) сворачивается в сводку с типами без прыжка, ручное открытие сохраняется.
5. Спавн, map-воркеры и handoff одной шириной и высотой строки с тулами; `open`-кнопка спавна открывает таб; заливок фона в ленте нет кроме failed.
6. Миграция настроек v2 → v3 маппит старые значения, слайдеры отсутствуют.
7. Длинный стрим с кодом: подсветка и mermaid появляются после done, во время стрима plain.
