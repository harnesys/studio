# Inline-сущности композера: чипы скиллов, реестр провайдеров, директивные XML-блоки

Факт: композер сейчас — `InputGroupTextarea` с plain-string значением (`chat-composer.tsx:190`), команды живут в трёх модулях (`slash-commands.ts`, `slash-keydown.ts`, `slash-menu.tsx`) и понимают только `/compact`. Скиллы режима попадают агенту через серверный XML-блок `<mode>` (`send-thread-run.use-case.ts:158-173`), транскрипт вырезает его парсером `mode-tag.ts`. Нужно: крепить скиллы к сообщению чипами в позиции курсора (несколько на сообщение), выбирать их командой `/skills`, отправлять агенту обязывающий XML-блок по образцу mode-skills. Задел на будущее: inline-ссылки на файлы базы знаний, меншены агентов, новые команды.

Подход: Tiptap v3 как редактор (document-модель с атомарными inline-нодами, `@tiptap/suggestion` как единый движок автодополнения), один тип ноды `inlineEntity {kind, ref}` поверх реестра kinds, извлечение сущностей в типизированное поле wire, сборка XML-блока на сервере (источник правды — сервер, как с mode). Позиция чипа в тексте — удобство набора; агент получает директиву списком перед текстом. Провод остаётся совместимым: новые kinds = новые поля, не новая архитектура.

## 1. Каркас редактора

Файлы: `apps/studio/client/package.json`, новые `widgets/chat-composer/ui/composer-editor.tsx`, `model/composer-doc.ts`; правка `ui/chat-composer.tsx`.

Зависимости (все 3.31.3, peers официально покрывают React 19.2): `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/extensions` (UndoRedo), `@tiptap/extension-placeholder`, `@tiptap/suggestion` (+ peer `@floating-ui/dom`).

Документ минимальный: Document, Paragraph, Text, HardBreak, inlineEntity. Marks нет — композер остаётся plain text'ом с вложениями-нодами. Точки расширения на год вперёд (формотирование, markdown-вставка, коллаб) в модели ProseMirror есть, но сейчас не включаются.

`ComposerEditor`: `useEditor` + `EditorContent` на месте textarea внутри текущего `InputGroup`; ряд addon'ов (attach, mode, model, effort, send) не меняется. Поведение клавиш: Enter отправляет, Shift+Enter — hard break; при открытом suggestion-меню Enter перехватывает меню. `disabled` (`streaming`/`hitl`/нет агента) → `editor.setEditable(false)`. Placeholder — та же формулировка, что сейчас. `onDrop`/`onPaste` остаются на обёртке `InputGroup`: attach-draft и paste-as-file не меняются. Черновик между тредами не переживает перезагрузку (как сегодня).

Редактор отдаёт родителю ref: `{ getPayload(): { text, skills }, clear(), focus() }` (`getPayload` — обёртка над `serializeComposerDoc`, п.4; text без entity-нод); строковое `value`/`setValue` из `ChatComposer` удаляются.

## 2. Нода inlineEntity и чип

Файлы: новые `model/entity-kinds.ts`, `model/inline-entity-node.ts`, `ui/entity-chip-view.tsx`.

Нода: inline, atom, attrs `{ kind: 'skill', ref: string }` (`ref` — имя скилла). `renderText: ref` — при копировании наружу чип виден как имя; wire-текст строит обход из п.4, который entity-ноды пропускает. Реестр `ENTITY_KINDS` сопоставляет kind → компонент чипа и способ валидации; пока одна запись `skill`.

Чип: inline-`Badge` (`h-5`, `ZapIcon`, имя, `text-[11px]`, токены `bg-secondary`/`border-border`), node view на `@tiptap/react`. Atom-механика (курсор не входит, Backspace снимает целиком) бесплатна из модели PM.

## 3. Реестр провайдеров: команды и пикеры

Файлы: правка `model/slash-commands.ts`, новые `model/composer-providers.ts`, `model/skill-source.ts`, `ui/suggestion-menu.tsx`; удаление `ui/slash-menu.tsx`, `model/slash-keydown.ts` и `matchSlashCommands`/`exactSlashCommand`.

Форма команды: `SlashCommand = { name, description, outcome: { type: 'execute', run(ctx) } | { type: 'picker', kind: EntityKind } }`. `/compact` — execute; `/skills` — picker. Реестр остаётся одной точкой добавления будущих команд.

`@tiptap/suggestion`: `char: '/'`, `allowedPrefixes: [null, ' ']` (строка с начала или после пробела; `1/2` меню не зовёт). Меню — одна React-попап-компонента на два режима с позиционированием из `clientRects` провайдера, визуально текущий `SlashMenu` (`bg-popover`, `rounded-xl`, hover/active-подсветка, `font-mono` для имён, `max-h-56`).

Двухступенчатый поток пикера: выбор `/skills` съедает токен, та же попап-область становится поиском по скиллам; фильтрация локальная по подстроке имени/description; строка = имя + description; Enter вставляет чип в позицию съеденного токена и добавляет после него обычный пробел, Esc — обычное закрытие с восстановлением текста. Повторный `/skills` даёт второй чип; порядок чипов в сообщении произвольный.

`skill-source.ts`: `useQuery` на `GET /api/workspaces/:id/skills` (клиентский хеллер уже есть, `shared/api/workspaces.ts:87-109`) с фильтром по allowlist агента: `agent.skills` пусто/нет — все, иначе пересечение. То же правило, что `filterSkills` каталога `load_skill` (`packages/harnesys/src/application/skills/skills-catalog.ts:5-35`).

## 4. Извлечение и клиентский провод

Файлы: правки `model/composer-submit.ts`, `model/composer-send.ts`, `features/send-message/model/send-message.ts`, `shared/api/threads.ts`.

`serializeComposerDoc(doc): { text: string; skills: string[] }` — обход блоков: text-ноды дают строки, `br` — `\n`, `inlineEntity(kind:'skill')` пушит `ref` в `skills` (дедуп по первому вхождению, порядок по документу) и ничего не пишет в `text`; схлопывание кратных пробелов на местах удалённых токенов, trim по блокам. Это единственная функция, знающая про wire-формат композера: будущие kinds добавляют поле в результат, не трогают submit.

`canSend`: `text.trim()` или файлы (скиллы без текста не отправляются — клиент и сервер согласованы). Цепочка `submitComposer → uploadAndSend → sendMessage → sendThreadRun` прокидывает `skills: string[]`; в `sendThreadRun` (POST `/api/threads/:id/runs`) тело дополняется полем.

## 5. Сервер: валидация и блок `<requested-skills>`

Файлы: правки `server/src/adapters/http/thread/thread.body.ts`, `server/src/application/threads/send-thread-run.use-case.ts`.

`sendThreadRunBody.skills`: `z.array(z.string().regex(/^[A-Za-z0-9:_-]{1,120}$/)).max(10).optional()` (regex покрывает `plugin:skill`); refine: непустые `skills` требуют непустого `text`.

Use case после резолва mode: валидация имён против `collectWorkspaceSkills(workspace)` ∩ allowlist агента (как `create-agent.use-case.ts:120-128`); неизвестные → 400 со списком. Сборка блока:

```
<requested-skills names="a, b">For this request, call load_skill for each listed skill before working.</requested-skills>
```

`names` — через `escapeXml` на каждом имени. Блок прикладывается всегда (per-message, дедуп mode здесь не нужен). Порядок префиксации: mode-блок → skills-блок → текст (`prependBlock` дважды). Текст события `SessionEvent {type:'user'}` содержит блоки; replay в библиотеке не меняется.

## 6. Транскрипт: лента показывает собранное сообщение

Файлы: `model/mode-tag.ts` → переименование в `directive-tag.ts`, `ui/mode-tag-badge.tsx`, `ui/agent-turn.tsx` (`TurnSegmentView`), `entities/session/model/session.store.ts`, `features/send-message/model/send-message.ts`.

Парсер: тот же модуль дополняется `SKILLS_TAG_RE = /<requested-skills\s+names="([^"]*)">[\s\S]*?<\/requested-skills>\n?/g`; `ModeTagBadge` → union-вариант `{kind:'skill', name}` (unescape по элементам, разделитель `, `). Строка бейджей над пузырём текста: по `Badge` на скилл (`ZapIcon`, имя) + `HoverCard` с description из skills-запроса (при отсутствии данных — только имя); режимный бейдж остаётся как сейчас (`mode-tag-badge.tsx`).

Оптимистичный пузырь: `SessionEvent` библиотечный не расширяется; в `useSessionStore` host-side sidecar `sentSkills: Map<clientEventId, string[]>` (`setSentSkills`/`getSentSkills`), пишет `sendMessage`, чистит `removeForThreads`. `TurnSegmentView` берёт бейджи из разобранного блока, а пока блока нет (до реплея) — из sidecar по `clientEventId`. Пузырь в момент отправки, после реплея и после перезагрузки выглядит одинаково: чипы над текстом, директивы из текста вырезаны.

## 7. Удаления и границы

Удаляются без следа (RULE D): `slash-menu.tsx`, `slash-keydown.ts`, `matchSlashCommands`, `exactSlashCommand`, state `value`/`slashIndex` в `chat-composer.tsx`; `InputGroupTextarea` остаётся в `shared/ui` (примитив, другим местам нет дела до композера). `AttachDraft`, `AttachMenu`, `paste-as-file`, usage/effort/model-ряд — без изменений.

Вне скоупа спецификации: меншены агентов, файлы базы знаний, картинки в композере, история черновиков. Слоты для них: запись в `ENTITY_KINDS`, provider в реестре, поле в `serializeComposerDoc`/body, вариант в парсере транскрипта. Ни одного из этих слоёв заранее не заводится.

Проверка: автотесты запрещены (AGENTS.md). Ворота — `bun run lint` + `bun run typecheck`, ручной прогон через agent-browser на стенде хозяина (3000/5173): `/skills` с начала строки и после пробела, `1/2` меню не открывает, два чипа в разных местах, Backspace снимает чип целиком, отправка, бейджи+hover в ленте, reload треда — та же картина, сообщение только с чипами без текста отклоняется сервером.
