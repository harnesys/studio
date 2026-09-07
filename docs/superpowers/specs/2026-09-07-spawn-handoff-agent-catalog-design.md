# Команда агентов, handoff, ветки и shell студии — дизайн

Дата: 2026-09-07  
Статус: согласовано в чате (runtime + каталог + пресеты + thread-first shell + slide + ветки).

## Контекст

В словаре уже есть `control:spawn` / `control:handoff`, исполнение — `node_unsupported`. Хозяин хочет собирать команду агентов, делегировать, отдавать разговор другому агенту и уводить боковые обсуждения в ветки без каши в основном треде.

Текущий клиент склеивает «владелец треда», «кто отвечает» и «полка в сайдбаре» в одно поле `thread.agentId` плюс лендинг агента. На handoff и ветках это ломается. В этой работе пересобираем модель треда и shell вместе с runtime и каталогом.

## Решения

1. **Тред — контейнер разговора** (thread-first). Агент не владеет тредом эксклюзивно.
2. **`originAgentId`** — кто завёл; **`agentId`** — кто отвечает сейчас (current). Участники для UI — origin + current (+ позже явный список, если понадобится).
3. **Handoff** — смена current на той же линии треда; notice в ленте; таб/URL остаются на `threadId`.
4. **Ветка** — новый тред с `parentThreadId` + `forkAt` (событие/сообщение). Родитель не засоряется.
5. **Spawn** — субподряд в runtime; `$output` родителю; отдельный UI-тред не обязателен в v1.
6. **Сайдбар slide:** Agents → Threads(filter по участию агента) → back. Лендинг агента убрать из основного потока; настройки агента — с строки агента.
7. **Табы** — только открытая работа. История — в slide-панели Threads.
8. **Каталог агентов:** порт + tools в библиотеке; пресеты только хост (`~/.harnesys/skills/author-agents/presets`).
9. **Скиллы:** `~/.harnesys/skills` (система) + `<workspace>/.harnesys/skills` (workspace). Мета workspace: `<workspace>/.harnesys/` (legacy `.studio` / `.agents/skills` — one-shot migrate).
10. **Порядок реализации:** схема треда и shell → handoff UI на чистой модели → ветки → runtime spawn/handoff → порт/tools → скилл/пресеты/From Preset. Библиотечный runtime можно вести параллельно после стабилизации контракта событий.

## Модель треда (Studio)

```ts
type Thread = {
  id: string;
  workspaceId: string;
  /** Current speaker: RunTargets / следующий send. */
  agentId: string;
  /** Who opened the thread; stable for lists and «opened by». */
  originAgentId: string;
  title: string;
  kind: ThreadKind;
  /** Branch: parent conversation. */
  parentThreadId?: string | null;
  /** Branch: journal/session event id (or message id) where the fork starts. */
  forkAt?: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
};
```

Миграция: для существующих строк `originAgentId = agentId`.  
`ThreadPatch` умеет `agentId` (handoff), title/kind/metadata как сейчас.  
`deleteByAgent` не обязан удалять треды, где агент только origin/participant — политика: удалять треды, где `originAgentId` или current совпал, либо мягко переназначить; выбрать при реализации: **удалять, если origin или current = удаляемый агент** (простое правило v1).

Фильтр «треды агента X»: `originAgentId = X OR agentId = X` (в v1 без отдельной таблицы participants).

## Handoff (продукт + UI)

1. Runtime/session отдаёт событие (SessionEvent `agent.handoff` с `agentId`).
2. Сервер пишет `thread.agentId = target` (origin не трогает); desk/SSE доходит до клиента.
3. Клиент: patch store; `FeedNotice` в ленте; шапка — стопка аватаров, current выделен; IDE-таб и `?agent=` обновляются **in place** без ухода с треда и без remount ленты.
4. Inspector на открытом треде — от **current** агента.

Анти-паттерны: новый тред на каждый handoff; фильтр сайдбара только по current; remount transcript; exclusive «полка» агента.

## Ветки

Действие «Branch from here» на сообщении/событии:

- `POST` create thread: `parentThreadId`, `forkAt`, `originAgentId` = текущий пользовательский выбор (обычно current или origin родителя), `agentId` = кто ведёт ветку (тот же или другой).
- Контекст: хост при первом send в ветку подмешивает префикс/ссылку на fork-точку (детали промпта — в плане; минимум: клиент показывает связь, ран видит обычный input пользователя в ветке).
- В списках: бейдж branch + навигация parent ↔ child.
- Handoff внутри ветки — те же правила, что на корневом треде.

## Spawn vs handoff vs branch

| | Spawn | Handoff | Branch |
|--|--------|---------|--------|
| Линия треда | та же (без смены current) | та же, current меняется | новая |
| Результат | массив в `$output` родителя | продолжение под новым агентом | боковой разговор |
| UI v1 | события journal достаточно | notice + аватары | новый тред + связи |

## Сайдбар и маршруты

```
[Agents]
  click agent → slide
[Threads · Agent name]  (filter: origin|current = agent)
  back → Agents
  click thread → open tab + desk (`/w/:ws/thread/:threadId`, query agent = current)
```

- Маршрут `/w/:ws/agent/:agentId` как хаб-лендинг убрать из основного UX (редирект на slide Threads или только settings deep-link).
- Навигация и IDE sync: **threadId первичен**; agent на табе = current, обновляется при handoff.
- Active-thread storage: не единственный source of truth per-agent; recents/open tabs thread-centric.

Шапка треда: аватары участников (origin, current; при появлении других спикеров в journal — дополнять из событий handoff).

## Библиотека: spawn / handoff

### `control:spawn`

```ts
{
  type: 'control:spawn';
  calls: Expr;
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: { policy: 'all' };
}
```

После eval `calls`: `SpawnCall[]` = `{ agentId: string; input: unknown }`.

- resolve через `agents.resolve`; нет → `code: 'spawn_target_missing'`;
- `RuntimeState.child(spawnId)`; события `agent.spawned` / `agent.completed` / `agent.failed`;
- sequential | parallel; barrier `all`;
- `$output` = массив результатов по порядку;
- бюджет ребёнка из его definition; общий пул с родителем в v1 не вводим.

`GraphOpts` / `RunEngineDeps` получают `agents: AgentsResolve`.

### `control:handoff`

```ts
{
  type: 'control:handoff';
  agentId: string | Expr;
  input: Expr | Record<string, Expr | unknown>;
}
```

- resolve target; нет → `handoff_target`;
- в том же `startGraph`: ребинд на definition цели (plan/tools/input), continue с start цели;
- наружу SessionEvent `agent.handoff` (например через `agent.spawned` + `metadata.handoff: true`).

`custom:*` — по-прежнему `node_unsupported`.

## Библиотека: порт каталога

`packages/harnesys/src/ports/agents-catalog.ts`:

```ts
export type AgentCatalogSummary = {
  id: string;
  name: string;
  role: string;
  instructions: string;
};

export type AgentCatalogCreateInput = {
  name: string;
  role: string;
  instructions: string;
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
  budget?: AgentBudget;
  capabilities?: Record<string, CapabilityConfig | null>;
  graph?: AgentGraph;
  model?: AgentModelRef;
};

export type AgentsCatalogPort = {
  list(
    scope: CapabilityScope,
    filter?: { role?: string; name?: string },
  ): Promise<AgentCatalogSummary[]>;
  get(scope: CapabilityScope, id: string): Promise<AgentDefinition | null>;
  create(
    scope: CapabilityScope,
    input: AgentCatalogCreateInput,
  ): Promise<{ id: string; name: string }>;
};
```

Пачка `agents`: tools `agents_list`, `agents_create`. Пресеты в библиотеке не упоминаются. Включение: `capabilities.agents`.

## Скиллы и пресеты (хост)

Roots `FsSkillRegistry`:

1. `~/.harnesys/skills` (или `$HARNESYS_HOME/skills`)
2. `<workspace>/.harnesys/skills`

Workspace meta: `<workspace>/.harnesys/` (`mcp.json`, threads attachments, …). Legacy: `.studio` → rename; `.agents/skills` → `.harnesys/skills`.

Скилл команды:

```
~/.harnesys/skills/author-agents/
  SKILL.md
  presets/*.json   # orchestrator, explorer, researcher, coder, reviewer, tester, planner, writer
```

From Preset и скилл читают один каталог JSON. После create связи preset→agent в БД нет. `role` не уникален; отбор list → role → instructions.

## Studio: каталог и graph

- Адаптер порта → repository + `CreateAgentUseCase`.
- Create: явный `graph` или `buildReactGraph`.
- Update tools: не затирать non-stock graph.
- Capability `agents` в `wire-capabilities`.
- From Preset: суффикс имени при конфликте (`Coder 2`).

## Поток команды

```
agents_list → reuse или agents_create → resolve(id)
        ↓
control:spawn (субподряд)  |  control:handoff (смена current)
        ↓
UI: notice / аватары / slide filter
```

Ветка — отдельный пользовательский жест на сообщении, не обязана идти из графа в v1.

## Вне скоупа

- `custom:*`;
- общий пул бюджета parent↔child;
- marketplace пресетов;
- отдельный export/import JSON;
- автоудаление сгенерированных агентов;
- `sourcePresetId`;
- merge ветки обратно в родителя;
- отдельная таблица participants (v1 = origin|current);
- UI-тред на каждый spawn child.

## Критерии приёмки

1. Сайдбар: slide Agents ↔ Threads(filter); лендинг не хаб.
2. Handoff меняет current, origin стабилен; notice + аватары; таб остаётся на том же threadId.
3. Branch from message создаёт child thread со связью parent/forkAt.
4. `control:spawn` / `control:handoff` исполняются; неизвестный target — явная ошибка.
5. `agents_list` / `agents_create` через порт; в `packages/harnesys` нет preset.
6. Create без graph → ReAct; custom graph переживает update tools.
7. Системные и workspace скиллы монтируются из `.harnesys/skills`; From Preset из `author-agents/presets`.
8. Два агента с одной role допустимы.
`)