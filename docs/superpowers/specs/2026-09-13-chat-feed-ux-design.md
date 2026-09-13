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
* Ключи: `segmentKey` (`turn-segments.ts:106`) оставить позиционными внутри рана (аппенд-стабильны), убрать коллизию чипов спавнов `key={`${tool.name}:${tool.phase}`}` (`spawn-card.tsx:119`) добавлением индекса.
* Курсор стрима: CSS-only caret на хвосте живого блока. Плейсхолдер `ThinkingLine text=""` при `pendingReply` (`agent-turn.tsx:159`) заменяется резервом в одну строку высоты, чтобы rail-узел не появлялся из ничего со сдвигом layout.

## 3. ActivityLine: единый стиль активности

Файлы: `widgets/chat-transcript/ui/activity-line.tsx`, `activity-rail.tsx`, `tool-line.tsx`, `tool-group.tsx`, `tool-run.tsx`, `spawn-card.tsx`, `ask-line.tsx`, `thinking-line.tsx`.

Решение: одна строка для всех. Иконка `size-3.5`, лейбл, моно-хинт, бейджи. База `text-[13px] opacity-80` из `activity-line.tsx:50` остается. Фон только у двух состояний: `running` и `failed`. `done` плоский.

* `SpawnCard`: убрать заливку `color-mix live 7%` (`spawn-card.tsx:18`), оставить `bg-muted/25` для done, `bg-destructive/8` для failed, running помечать rail `bg-live` 3px и `StatusDot` (уже есть). Карточный контейнер сохраняется, выразительность падает до уровня остальных строк.
* Мета спавна `tabular-nums`, тик `useNow` с 1000 мс до 5000 мс (`spawn-card.tsx:73`). Порог stalled 90 сек без изменений.
* Правило раскрытия: жив только хвост. Завершенная группа от 2 тул-пар сворачивается в сводку `summarizeToolRun` (“3 tools · read×2 +1”). Ручное открытие (`manual` в `activity-line.tsx:44`) переживает новые события, смена `defaultOpen` при переходе live to done высоту не дергает.
* Единая константа схлопывания `ACTIVITY_COLLAPSE_MIN = 2` вместо пары `TOOL_RUN_COLLAPSE_AT = 6` (`shared/config/constants.ts:17`) и `TOOL_GROUP_MIN = 2` (`tool-group.tsx:14`). Изменение поведения: `ToolRun` сворачивается с 2 пар вместо 6.
* Результат инструмента доступен всегда: `ToolInputDialog` и `ToolDetailView` без изменений, сворачивается только контейнер.
* `AskLine` waiting-индикатор без изменений. `FeedNotice` для system/error без изменений.

## 4. ExpandableScroll: убрать вложенную борьбу

Файлы: `shared/ui/expandable-scroll.tsx`, `widgets/chat-transcript/ui/thinking-line.tsx`, `widgets/chat-transcript/ui/tool-detail.tsx`.

Решение: во время live внутренних скроллбаров нет (`overflow-hidden` + удержание хвоста, уже реализовано `follow` в `expandable-scroll.tsx:40`). После done появляется `More/Less` с fade (уже есть). Изменения:

* Единый preview `max-h-28` для мыслей и деталей. Сейчас `thinking-line.tsx:42` и дефолт `max-h-32` (`expandable-scroll.tsx:5`) расходятся.
* Внутренним контейнерам `overscroll-behavior: contain` с пробросом колеса наружу на границе, чтобы внешний вьюпорт продолжал движение.
* Смена `liveExpand` больше не меняет высоту preview на лету: высота фиксируется при seal хвоста.

## 5. ChatPane: 4 ручки вместо 9

Файлы: `shared/lib/chat-preferences.ts`, `pages/settings/ui/chat-pane.tsx`.

Состав:

* `Follow`: `anchor | pin`. `ToggleGroup segment`, дефолт `anchor`. Описание: где паркуется новый терн и как догоняет стрим.
* `Detail`: `quiet | full`. Дефолт `quiet`. `quiet` сворачивает завершенные группы от 2 тулов, мысли закрыты, спавны одной строкой. `full` держит открытым как сегодняшний `expandTools`.
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
4. Завершенная группа тулов сворачивается без прыжка, ручное открытие сохраняется.
5. Миграция настроек v2 → v3 маппит старые значения, слайдеры отсутствуют.
6. Длинный стрим с кодом: подсветка и mermaid появляются после done, во время стрима plain.
