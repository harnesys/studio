# Inline-сущности композера (скиллы чипами) Implementation Plan

> **For agent workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В композере чипы скиллов, вставляемые командой `/skills` в позицию курсора (несколько на сообщение), уходящие агенту обязывающим XML-блоком `<requested-skills>` по образцу mode-skills и отображаемые в ленте бейджами над текстом.

**Architecture:** Tiptap v3 (plain-text документ + атомарная inline-нода `inlineEntity {kind, ref}`), `@tiptap/suggestion` как единый движок автодополнения с двумя исходами (`execute` команды, `picker` вставки чипа). Извлечение в wire — одна функция `serializeComposerDoc`; сервер принимает `skills: string[]`, валидирует против каталога workspace ∩ allowlist агента и prependит директивный блок (источник правды — сервер, как с `<mode>`). Транскрипт вырезает блоки парсером и рисует бейджи; оптимистичный пузырь дорисовывает их из host-side sidecar в `useSessionStore`. Новые kinds (файлы БЗ, меншены) придут записями в те же реестры без правок каркаса.

**Tech Stack:** `@tiptap/{core,pm,react,extensions,extension-placeholder,suggestion}` 3.31.3 + `@floating-ui/dom` (peer suggestion); zod на сервере; Hono-контроллер `/runs`; zustand `session.store`; Base UI Badge/HoverCard; React 19, Vite.

**Spec:** `docs/superpowers/specs/2026-09-14-composer-inline-skills-design.md` — аргументация, границы скоупа и удалений там; здесь только разбивка.

## Факты разведки (база 2026-09-14; allowlist, capability-set пакет и composition перепроверены 2026-09-15)

- Композер: `widgets/chat-composer/ui/chat-composer.tsx` (352 строки) — `value`/`setValue` строка (:62), `slashIndex` (:65), `handleComposerKeyDown` (:196), `SlashMenu` (:146), `InputGroupTextarea` (:190), submit — `submitComposer({value,...})` (:317). Ряд addon'ов (`AttachMenu`, `ModeSelect`, `ContextRing`, `ModelSelect`, `EffortSelect`, send/stop) не меняется.
- Команды: `model/slash-commands.ts` (`SLASH_COMMANDS`, `matchSlashCommands`, `exactSlashCommand`), `model/slash-keydown.ts`, `ui/slash-menu.tsx`, `model/composer-submit.ts:26` (exact-проверка при submit), `model/run-slash-command.ts` (исполнение, остаётся).
- Отправка: `model/composer-send.ts` `uploadAndSend` → `features/send-message/model/send-message.ts:23` (клиентский `clientEventId`, optimistic `appendEvent`) → `shared/api/threads.ts:57` `sendThreadRun`.
- Сервер: wire-zod `server/src/adapters/http/thread/thread.body.ts:23` (`sendThreadRunBody`); use case `application/threads/send-thread-run.use-case.ts` — mode-блок `modeInstructionsBlock` (:159-174), `escapeXml` (:175), `prependBlock` (:183), сборка `input.text` (:117-120: mode вставляется только при `modeChanged`; skills-блок, по спеке §5, прикладывается всегда).
- Валидация скиллов прецедент: `application/agents/create-agent.use-case.ts:132-139` — dep `workspaceCatalog.listSkills: ListWorkspaceSkillsInput`, `execute({workspaceId})` → `listed.skills[].name`, `assertAllKnown(unknown,'skill')`; §7-валидация `validateConfig` (`capabilities/validate-agent-config.use-case.ts`) skills-каталог не проверяет, у делегатов — `skills ⊆ parent.skills` (:251-255). Allowlist — `agent.skills?: string[]`, closed-world: omitted/пусто = none (`shared/src/agent.ts:44-45`, `agent-definition.ts:64-65`); домен `Agent.skills: string[]` (`domain/agent.port.ts:43-44`); `dbAgentDefinition` отдаёт `agent.skills` as-is (`workspace-agent-definitions.ts:24`). `closed-world-materialization.ts` удалён (0b38362): миграция `capability_set_v1` skills не трогает, backfill пустых строк больше нет — у легаси-агента без skills просто нет скиллов; пресеты несут skills явно (assistant: `workspace-ops`).
- Каталог: `collectWorkspaceSkills(hx, plugins)` (`list-workspace-skills.use-case.ts:44-80`) — live-скиллы workspace + плагинные с префиксом `pluginName:` и карточки незагруженных (`inert`/`blocked_by_grant`/`dropped`, description пуст). Тип `WorkspaceSkill {name, description, whenToUse?, origin}` (`shared/src/workspace-config.ts:7-12`), `ComponentOrigin` (`shared/src/plugin.ts:26-28`), `ComponentStatus` (`plugin-ir.ts:44`). Клиентский хеллер: `shared/api/workspaces.ts:87-109` (`GET /api/workspaces/:id/skills`). Рантайм-зеркало фильтра — `effectiveSkillRegistry` = `filterSkills(merged, def.skills ?? [])` (`pack-run.ts:165-174`), через него же каталог модели (`llm.ts:127`); pack-выходы режет тот же allowlist (`capability-outputs.ts:25`). `filterSkills` (`skills-catalog.ts:5-35`) при `undefined` отдаёт всё, но рантайм-колл-сайты подставляют `?? []` — фактически пусто = none.
- Транскрипт: `widgets/chat-transcript/model/mode-tag.ts` (`MODE_TAG_RE`, `splitModeTags`, `ModeTagBadge`), `ui/mode-tag-badge.tsx` (`ModeTagBadges`), `ui/agent-turn.tsx:216-244` (`TurnSegmentView` user-ветка).
- Стор: `entities/session/model/session.store.ts` — `appendEvent` (:173), `removeEventByClientEventId` (:198, ключ `ce:`), `removeForThreads` (:52 в типе).
- Библиотечный `SessionEvent {type:'user'}` (`packages/harnesys/src/ports/session.ts:65-75`) не расширяем: sidecar живёт в сторе хоста.
- `@tiptap/suggestion` v3 позиционирует рендер через `clientRects`; кастомный renderer — объект `{render, update, destroy}`. DOC: https://tiptap.dev/docs/examples/mentions (реализацию сверить с docs актуальной версии, API `char/allowedPrefixes/command` стабилен в v3).
- Композер-mode: `model/composer-mode.ts` первым item кладёт `DEFAULT_MODE` (322944c) — селектор не трогаем, конфликту нет.
- Проверено 2026-09-15 (пакеты capability-set `1c6fdb3..94b3c35` + незакоммиченные пресеты/копирайт/роустер-правки): файлы плана не изменены — `chat-composer`, `chat-transcript`, `session.store`, `send-message`, `shared/api/threads|workspaces`, `list-workspace-skills.use-case`, `send-thread-run`, `thread.body` вне диффов. Ростер/спавн (`listScopedRoster`, `denied`+`agent.failed`, `parent` в `AgentsResolve`) и удаление `AgentRecord.tools` (0b38362) планом не используются. Новый `GET /api/agents/:id/capabilities` (`list-agent-capabilities.use-case.ts`, клиент `shared/api/agent-capabilities.ts`) даёт explain-строки skills без descriptions — источником picker не становится (Task 5 Step 1 остаётся каталог ∩ allowlist). Спека-ссылка `create-agent.use-case.ts:120-128` устарела: актуально `:132-139`.

## Расхождение со спекой (закрытие мира, f75ff4a)

Спека `2026-09-14-composer-inline-skills-design.md:37` («`agent.skills` пусто/нет — все») устарела: действует closed-world (omitted/пусто = none). Исполнитель следует плану (Task 2 Step 2, Task 5 Step 1); спека правится отдельно по команде хозяина.

## Global Constraints

- Тесты запрещены (AGENTS.md): никаких `*.test.ts`, vitest, playwright. Ворота каждого таска: `bun run lint` и `bun run typecheck` в корне. Ручная проверка стендом хозяина — в Task 6.
- Файлы ≤ ~300 строк; `chat-composer.tsx` в Task 4 обязан похудеть (value-механика уходит в `composer-editor.tsx`).
- Типы именованные, без `T['field']`/`Parameters<typeof fn>[0]` (biome plugin). Слайсы FSD — импорт только через `index.ts` (`noRestrictedImports` в `apps/studio/client/biome.json`): всё новое внутри `widgets/chat-composer` импортируется относительными путями, как соседи.
- Зависимости — строго названные пакеты с `^3.31.3` одним `bun add` в `apps/studio/client`; starter-kit не тянуть.
- Провод совместим: `skills` опционален, пустой массив приравнен к отсутствию; старые клиенты не затронуты.
- Дев-стенд (3000/5173) поднят хозяином: не рестартить, не убивать; перед браузерной проверкой прочитать скилл (`agent-browser skills get core`).

---

### Task 1: Нода inlineEntity и чип-рендер (без точки вставки)

**Files:**
- Modify: `apps/studio/client/package.json` (зависимости)
- Create: `apps/studio/client/src/widgets/chat-composer/model/entity-kinds.ts`
- Create: `apps/studio/client/src/widgets/chat-composer/model/inline-entity-node.ts`
- Create: `apps/studio/client/src/widgets/chat-composer/ui/entity-chip-view.tsx`

**Interfaces:**
- Produces: `type EntityKind = 'skill'`; `type EntityChipProps = { kind: EntityKind; ref: string }`; `INLINE_ENTITY_TYPE = 'inlineEntity'`; `type InlineEntityAttrs = { kind: EntityKind; ref: string }`; `$insertInlineEntity(editor: Editor, at: number, attrs: InlineEntityAttrs): void` — insertContent по позиции + focus после ноды; `isInlineEntityNode(node): boolean` — по `node.type.name` + атрибутам.

- [ ] **Step 1:** `bun add` в `apps/studio/client`: `@tiptap/core@^3.31.3 @tiptap/pm@^3.31.3 @tiptap/react@^3.31.3 @tiptap/extensions@^3.31.3 @tiptap/extension-placeholder@^3.31.3 @tiptap/suggestion@^3.31.3 @floating-ui/dom@^1.6.0`.
- [ ] **Step 2:** `entity-kinds.ts`:

```ts
export type EntityKind = 'skill';
export type EntityChipProps = { kind: EntityKind; ref: string };
const REF_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;
export function isValidEntityRef(kind: EntityKind, ref: string): boolean {
  return REF_PATTERN.test(ref);
}
```

- [ ] **Step 3:** `inline-entity-node.ts` — `Node.create<InlineEntityAttrs>`: `name: INLINE_ENTITY_TYPE`, `group:'inline'`, `inline: true`, `atom: true`, `addAttributes: kind/ref (validate через isValidEntityRef, parseHTML по `data-inline-entity`/`data-entity-ref`)`, `renderHTML` → `<span data-inline-entity="skill" data-entity-ref=…>`, `renderText: ({node}) => node.attrs.ref`, `addNodeViews: () => ({ [INLINE_ENTITY_TYPE]: { component: EntityChipView } })`. Плюс хелперы:

```ts
export function $insertInlineEntity(editor: Editor, at: number, attrs: InlineEntityAttrs): void {
  editor.chain().focus().insertContentAt(at, { type: INLINE_ENTITY_TYPE, attrs }).run();
}
```

- [ ] **Step 4:** `entity-chip-view.tsx` — `NodeViewWrapper as="span" class="inline-flex h-5 items-center gap-1 rounded-md border border-border bg-secondary px-1.5 align-middle text-[11px] font-medium leading-none"` c `ZapIcon className="size-3 text-muted-foreground"` и именем; компонент принимает `NodeViewProps`, читает `props.node.attrs`.
- [ ] **Step 5:** `bun run lint && bun run typecheck`; коммит `feat(studio): inline entity node and chip view for the composer`.

### Task 2: Провод и сервер: `skills` + `<requested-skills>`

**Files:**
- Modify: `apps/studio/server/src/adapters/http/thread/thread.body.ts:23-34`
- Modify: `apps/studio/server/src/application/threads/send-thread-run.use-case.ts`
- Modify: `apps/studio/server/src/adapters/http/thread/thread.controller.ts` (проброс `skills` в request use case)
- Modify: `apps/studio/server/src/composition/create-host.ts:267` (deps `SendThreadRunUseCase`: добавить `listSkills: new ListWorkspaceSkillsUseCase(store.workspaceRepo, workspaceHarnesys)` — те же два аргумента, что в `wire-agent-controllers.ts:47`)
- Modify: `apps/studio/client/src/shared/api/threads.ts` (`SendRunInput.skills?: string[]` в тело)

**Interfaces:**
- Consumes: `ListWorkspaceSkillsInput` (as `create-agent.use-case.ts:132-139`).
- Produces: текст user-события может содержать блок `<requested-skills names="a, b">For this request, call load_skill for each listed skill before working.</requested-skills>`; wire-контракт `skills?: string[]` (regex имени `^[A-Za-z0-9:_-]{1,120}$`, ≤10, только с непустым `text`), иначе 400.

- [ ] **Step 1:** zod: `skills: z.array(z.string().regex(/^[A-Za-z0-9:_-]{1,120}$/)).max(10).optional()` в `sendThreadRunBody`; в существующий `.refine` добавить условие `skills?.length ? (value.text?.length ?? 0) > 0 : true` с message `skills require text`.
- [ ] **Step 2:** Use case: в `SendThreadRunDeps` добавить `listSkills: ListWorkspaceSkillsInput`; в `execute` после `resolveModeId`: дедуп `const skills = [...new Set(request.skills ?? [])]`; при `skills.length` — `listed = await this.listSkills.execute({ workspaceId: thread.workspaceId })`, `known = new Set(listed.skills.map(s => s.name))`, allowlist — `agentRow.skills` (`domain/agent.port.ts:43-44`: `skills: string[]`, closed-world пусто = none; рантайм-зеркало `effectiveSkillRegistry`), неизвестные/запрещённые → `ValidationError('skills not available to this agent: a, b')`.
- [ ] **Step 3:** Блок и порядок инъекции (существующие строки 117-120: `modeBlock`, `modeChanged`, `input.text = modeBlock && modeChanged ? prependBlock(modeBlock, request.text) : request.text`):

```ts
function requestedSkillsBlock(skills: string[]): string {
  const names = skills.map(escapeXml).join(', ');
  return `<requested-skills names="${names}">For this request, call load_skill for each listed skill before working.</requested-skills>`;
}
// заменить сборку input.text: skills на text всегда, затем mode поверх (gate modeChanged сохраняется)
let text = skills.length > 0 ? prependBlock(requestedSkillsBlock(skills), request.text) : request.text;
if (modeBlock && modeChanged) text = prependBlock(modeBlock, text);
input.text = text;
```

Итоговый порядок: mode → skills → текст (спека §5); skills-блок per-message всегда, mode — только при смене.
- [ ] **Step 4:** Компиляция контроллера: `skills: body.skills` в use-case request; wire: `create-host.ts:267` — `listSkills` в deps `SendThreadRunUseCase` (список Files).
- [ ] **Step 5:** Клиент `sendThreadRun`: `skills?: string[]` в input, тело `...(skills?.length ? { skills } : {})`.
- [ ] **Step 6:** `bun run lint && bun run typecheck`; curl-проверка на стенде хозяина: POST `/api/threads/<id>/runs` с `skills:["нет-такого"]` → 400 с именем; коммит `feat(studio): skills on the run wire and requested-skills directive block`.

### Task 3: Транскрипт: парсер директив, бейджи, sidecar

**Files:**
- Rename+Modify: `widgets/chat-transcript/model/mode-tag.ts` → `model/directive-tag.ts`
- Modify: `widgets/chat-transcript/ui/mode-tag-badge.tsx`
- Modify: `widgets/chat-transcript/ui/agent-turn.tsx:216-244`
- Modify: `entities/session/model/session.store.ts`
- Modify: `features/send-message/model/send-message.ts` (проброс `skills` в `SendMessageOptions`, запись sidecar)
- Modify: `widgets/chat-transcript/index.ts` (баррель: экспорт при переименовании)

**Interfaces:**
- Consumes: блок из Task 2.
- Produces: `type DirectiveBadge = { kind: 'mode'; id; name; body } | { kind: 'skills'; body } | { kind: 'skill'; name: string }`; `splitDirectiveTags(text): { text: string; badges: DirectiveBadge[] }`; стор: `setSentSkills(threadId: string, clientEventId: string, skills: string[]): void`, `sentSkillsFor(clientEventId: string): string[] | undefined`.

- [ ] **Step 1:** Парсер: `SKILLS_TAG_RE = /<requested-skills\s+names="([^"]*)">[\s\S]*?<\/requested-skills>\n?/g`; в `splitModeTags` (переименовать в `splitDirectiveTags`) вторым проходом матчить, имена: `match[1].split(',').map(unescapeXml)`, trim, пушить `{kind:'skill', name}`. Очистка префикса `\n+` остаётся.
- [ ] **Step 2:** Стор: `sentSkills: Record<string, string[]>` по `ce:${clientEventId}` (тот же ключ, что `removeEventByClientEventId:205`); `setSentSkills`; чистка в `removeForThreads`; экспортировать селектор `sentSkillsFor`.
- [ ] **Step 3:** `send-message.ts`: `skills?: string[]` в опции; после генерации `clientEventId` — `if (skills?.length) useSessionStore.getState().setSentSkills(threadId, clientEventId, skills)`.
- [ ] **Step 4:** Бейджи: в `mode-tag-badge.tsx` к ряду mode-бейджей добавить `skillsBadges = badges.filter(b => b.kind==='skill')` (+ sidecar-дополнение, когда их нет); каждый — `Badge` с `ZapIcon` и именем, `HoverCard` с description из workspace-skills query (хеллер `shared/api/workspaces`, уже кэшируется; при отсутствии записи — только имя).
- [ ] **Step 5:** `TurnSegmentView`: `splitDirectiveTags(rawText)`; если в разметке нет `skill`-бейджей и есть `segment.event.clientEventId` — взять `sentSkillsFor(clientEventId)`. Стилистически бейджи одной строкой над пузырём (`flex flex-wrap justify-end gap-1`).
- [ ] **Step 6:** `bun run lint && bun run typecheck`; curl-отправка сообщения с `skills:["agent-browser"]` → в ленте бейдж, в тексте директивы нет; reload — идентично; коммит `feat(studio): requested-skills badges in the transcript with optimistic sidecar`.

### Task 4: Tiptap-редактор в композере + команды через suggestion

**Files:**
- Create: `widgets/chat-composer/ui/composer-editor.tsx`, `model/composer-doc.ts`, `ui/suggestion-menu.tsx`, `ui/composer-editor.css`
- Modify: `widgets/chat-composer/ui/chat-composer.tsx`, `model/composer-submit.ts`, `model/composer-send.ts`, `model/slash-commands.ts`
- Delete: `ui/slash-menu.tsx`, `model/slash-keydown.ts`; функции `matchSlashCommands`, `exactSlashCommand`

**Interfaces:**
- Consumes: ноды Task 1 (в доке, без вставки).
- Produces: `type ComposerPayload = { text: string; skills: string[] }`; `serializeComposerDoc(doc: PMNode): ComposerPayload`; `ComposerEditorHandle = { getPayload(): ComposerPayload; clear(): void; focus(): void; }`; `onChange(payload: ComposerPayload): void` из редактора; `SlashCommand = { name: string; description: string; outcome: { type: 'execute'; run(ctx: SlashCommandContext): Promise<string | undefined> } | { type: 'picker'; kind: EntityKind } }`.

- [ ] **Step 1:** `composer-doc.ts`: обход блоков верхнего уровня: Text node → строка, `hardBreak` → `\n`, `inlineEntity` kind `skill` → `skills.push(ref)` (дедуп по первому вхождению) и ничего в текст; между блоками `\n`; в конце `text.replace(/ {2,}/g,' ').trim()`.
- [ ] **Step 2:** `composer-editor.tsx`: `useEditor` (extensions: Document, Paragraph, Text, HardBreak, InlineEntity, UndoRedo из `@tiptap/extensions`, Placeholder с `data-placeholder`, Suggestion-плагин из шага 4), `editorProps.attributes` = `class="tiptap px-3 py-3 text-[15px] leading-6 min-h-14 outline-none"`, `editable: !disabled`, `onUpdate: ({editor}) => onChange(serializeComposerDoc(editor.state.doc))`; `handleKeyDown`: Enter без Shift → `onSubmit()` (свой перехват; suggestion-плагин стоит раньше и, пока меню открыто, Enter потребляет сам). `useImperativeHandle` → `ComposerEditorHandle` (`getPayload` = сериализация, `clear` = `commands.clearContent()`). CSS в `composer-editor.css`: `.is-editor-empty:first-child::before` (placeholder, `text-muted-foreground`), `p { margin: 0 }`, `.tiptap { outline: none }`.
- [ ] **Step 3:** `chat-composer.tsx`: `value`/`slashIndex`/`setValue` удалены; состояние `payload: ComposerPayload` (обновляется `onChange`); `canSend = payload.text.trim() || pending.length`; `placeholder` прокидывается в `ComposerEditor`; `executeComposerSlash` принимает `{ clear: () => editorRef.current?.clear(), ... }` вместо `setValue`; submit шлёт `payload`; InputGroup/Draft/Addon-ряд без изменений. Файл обязан уложиться в ~300 строк; при упоре — вынести usage-блок (`generationUsages…`) в `model/composer-context.ts` (чистый перенос, поведение 1:1).
- [ ] **Step 4:** `slash-commands.ts`: тип из Interfaces; `/compact` = `execute` (`run` — текущее тело). Сигнатура `matchCommands(query: string): SlashCommand[]` (префикс-фильтр от `suggestion.query`), exact-поиск при submit удалён за ненадобностью (команда матчится меню).
- [ ] **Step 5:** `suggestion-menu.tsx`: `render: () => Renderer<CommandItem>` для `@tiptap/suggestion` (`char: '/'`, `allowedPrefixes: [null, ' ']`, `allow: () => !disabledRef.current`): `start({clientRects, ...})` создаёт fixed-попап над editor (портал в `document.body`, `bg-popover rounded-xl border-border shadow-md max-h-56`, позиции по `clientRects()`), список команд (разметка как в удалённом `SlashMenu`: `font-mono` имя + description, active `bg-accent`), стрелки/Enter/Esc через keydown-перехват на `editorProps` (items держим в ref коллбэка рендера); выбор execute-команды: удалить токен (`range` из `command({context})`) и `executeComposerSlash`. `update({query})` — перфильтр, `destroy()` — teardown.
- [ ] **Step 6:** `bun run lint && bun run typecheck`; ручная smoke на стенде (открыть 5173, набрать `/comp`, Enter → compact-уведомление; `/x` меню не держит, `1/2` не открывает; IME-строка набирается); коммит `feat(studio): tiptap composer editor with suggestion-driven slash commands`.

### Task 5: `/skills` picker: вставка чипов и отправка

**Files:**
- Create: `model/composer-providers.ts`, `model/skill-source.ts`
- Modify: `ui/suggestion-menu.tsx` (picker-модалность), `model/composer-doc.ts` (use skills), `model/composer-submit.ts`/`model/composer-send.ts` (payload.skills в провод), `features/send-message` вызов (skills → Task 3 API)

**Interfaces:**
- Consumes: `$insertInlineEntity` (Task 1), `SlashCommand.outcome.picker` (Task 4), `sendThreadRun.skills` (Task 2), sidecar (Task 3).
- Produces: `type SkillOption = { name: string; description: string }; useComposerSkillOptions(): { options: SkillOption[]; loading: boolean }`.

- [ ] **Step 1:** `skill-source.ts`: `useQuery(workspaceSkillsQuery(workspaceId))` + allowlist `new Set(agent?.skills ?? [])` (closed-world: omitted/пусто = none → options `[]`); загружаемые — только `origin.kind === 'workspace'` или plugin со `status === 'native'` (карточки `inert`/`blocked_by_grant`/`dropped` с пустым description `load_skill` не загрузит); `useMemo` → `SkillOption[]`. Хук живёт в `widgets/chat-composer` (read-only данные, не фича: запись нет). Пустой итог — picker показывает пустое состояние («у агента нет доступных скиллов»), команда из меню не прячется.
- [ ] **Step 2:** `composer-providers.ts`: `commandItems(state)`/`pickerItems(query, options)` — чистые функции над реестром; `SlashCommand { name:'skills', description:'Attach a skill to this message', outcome: { type:'picker', kind:'skill' } }` в `SLASH_COMMANDS`.
- [ ] **Step 3:** Меню picker-фаза: при выборе picker-команды — запомнить `range` токена, закрыть suggestion-состояние (токен удалить), открыть тот же попап в режиме picker (локальный `query` state, ввод после этого момента ловит editor `handleKeyDown`, пока picker открыт). Стрелки/Enter/Esc как в commands-фазе; Enter → `$insertInlineEntity(editor, range.from, {kind:'skill', ref})`, затем обычный `' '` по позиции вставки, focus в редактор; выбор закрывает picker. Повторный `/skills` даёт второй чип.
- [ ] **Step 4:** Провод: `submitComposer` берёт `payload` (текст из п.1 Task 4 уже без чипов, skills из `serializeComposerDoc`), `uploadAndSend`/`sendMessage` принимают `skills`, `sendMessage` пишет sidecar и шлёт в body (API уже из Task 2/3 — вызов дополнить).
- [ ] **Step 5:** `bun run lint && bun run typecheck`; smoke на стенде: `/skills` вставить два чипа в разные места (после пробела в середине строки — тоже), Backspace снимает чип, отправить, в ленте бейджи + текст без директив; коммит `feat(studio): skill chips via /skills picker wired to the run payload`.

### Task 6: Зачистка и сквозная проверка

**Files:**
- Modify: только правки по итогам проверки

**Interfaces:**
- Consumes: всё выше. Produces: чистное дерево без следов удалённой механики.

- [ ] **Step 1:** `rg` на отсутствие: `slash-menu`, `slash-keydown`, `matchSlashCommands`, `exactSlashCommand`, `handleComposerKeyDown`, `InputGroupTextarea` внутри `widgets/chat-composer` (в `shared/ui/input-group.tsx` примитив остаётся); следы `splitModeTags` (переименован в `splitDirectiveTags`, баррель транскрипта обновлён).
- [ ] **Step 2:** `bun run lint && bun run typecheck`; `wc -l` тронутых файлов (≤~300).
- [ ] **Step 3:** agent-browser (`skills get core` перед прогоном), стенд хозяина 5173/3000: чек-лист спецификации п.7 — `/skills` с начала строки и после пробела, `1/2` молчит, два чипа в одном сообщении, Backspace по чипу целиком, отправка с текстом и без него (без — toast/400), бейджи+hover description в ленте, reload треда — та же картина, другой тред/`/compact` не сломаны.
- [ ] **Step 4:** Правки по итогам; коммит `fix(studio): composer skill chips polish after manual pass` (или `chore: drop dead composer slash machinery`, если правок нет).
