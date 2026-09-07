# Spawn / handoff и каталог агентов — дизайн

Дата: 2026-09-07  
Статус: согласовано (подход A, хранение только в БД, пресеты хостовые JSON в скилле).

## Контекст

В словаре `AgentDefinition` уже есть `control:spawn` и `control:handoff`. Валидатор знает форму; интерпретатор падает с `node_unsupported` (бюджетная спека 2026-09-06). `AgentsResolve.resolve` и `RuntimeState.child(spawnId)` существуют, исполнения нет.

Цель хозяина: сказать одному агенту, какая команда нужна; агент создаёт членов команды в workspace и делегирует через spawn/handoff. Пресеты (Explorer, Coder, …) ускоряют старт в UI и служат JSON-примерами в скилле. Связи «создан из пресета» в БД нет.

## Решения

1. **Порядок:** runtime spawn/handoff → порт каталога + capability tools → скилл с JSON-пресетами → Studio wiring и From Preset.
2. **Хранение:** единственный runnable агент — запись в БД Studio. Сгенерированные остаются в команде, пока пользователь не удалит.
3. **Пресеты:** только хост. Чертежи в JSON рядом со скиллом; From Preset читает тот же каталог. После create связи с пресетом нет.
4. **Отбор:** оркестратор смотрит `agents_list` (роль, затем instructions/name), reuse или `agents_create`. Отдельного `ensure_preset` tool нет.
5. **ReAct:** пример шаблона в скилле и дефолт Studio `buildReactGraph`, когда create без явного graph. Библиотечный tool graph не навязывает.
6. **Библиотека не знает пресетов.** Порт и tools оперируют определением агента и id.

## Библиотека: spawn / handoff

### `control:spawn`

Узел уже в `domain/agent-definition.ts`:

```ts
{
  type: 'control:spawn';
  calls: Expr;
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: { policy: 'all' };
}
```

Runtime-контракт `calls` после eval: массив

```ts
type SpawnCall = { agentId: string; input: unknown };
```

Поведение:

- каждый call: `agents.resolve(agentId)`; нет определения → ошибка рана с `code: 'spawn_target_missing'`;
- дочерний ран на `RuntimeState.child(spawnId)`; событие `agent.spawned` (`events.ts`);
- `sequential` — по порядку; `parallel` — совместно; `barrier.policy: 'all'` — ждать всех;
- `$output` родителя: массив результатов по порядку calls (`status`, `output` или ошибка на элемент);
- бюджет ребёнка — из его `AgentDefinition.budget`; шаги/токены родителя считаются в родительском ране отдельно (общий пул лимитов в v1 не вводим).

### `control:handoff`

```ts
{
  type: 'control:handoff';
  agentId: string | Expr;
  input: Expr | Record<string, Expr | unknown>;
}
```

Поведение:

- resolve целевого агента; нет → ошибка `handoff_target` (как в `check.ts` для статического id);
- текущий ран завершается передачей; сессия продолжает работу под целевым агентом с вычисленным `input`;
- динамический `agentId` (expr) резолвится в рантайме.

`custom:*` по-прежнему `node_unsupported`.

### Проверка

`check` / `validateStructural` уже покрывают форму spawn/handoff и статический handoff target при переданном `opts.agents`. После реализации интерпретатора убрать/заменить ветку `node_unsupported` для этих двух типов в `graph.ts`.

## Библиотека: порт и capability

### Порт

Новый файл `packages/harnesys/src/ports/agents-catalog.ts` (имя при реализации можно уточнить, смысл тот же):

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
  /** Если задан — сохранить как graph агента. Если нет — хост решает дефолт (Studio: ReAct). */
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

Порт не содержит preset id, marketplace, Studio UI. `role` не уникален. Уникальность `name` в workspace — правило хоста (Studio уже кидает conflict).

`AgentsResolve` для spawn/handoff остаётся отдельным read-путём рантайма (`createRuntime({ agents })`). Хост обязан, чтобы `create` сразу был виден через `resolve(id)`.

### Capability pack

Пачка `agents`: tools `agents_list`, `agents_create` над портом. Включение через `AgentDefinition.capabilities.agents` по образцу plan/threads. Промпт-фрагмент пачки описывает list→create и делегирование по id; пресеты не упоминает.

Имена tools и поля схем — без preset.

## Скилл и JSON-пресеты

Расположение (хост): `apps/studio/skills/author-agents/` (seed/копия в workspace `.agents/skills/author-agents` при необходимости, чтобы `FsSkillRegistry` видел скилл):

```
SKILL.md
presets/
  orchestrator.json
  explorer.json
  researcher.json
  coder.json
  reviewer.json
  tester.json
  planner.json
  writer.json
```

`SKILL.md` учит:

- словарь нод, expr, budget на циклы;
- минимальный ReAct-граф (как в `buildReactGraph` / JSON-пример);
- оркестратор со `control:spawn` / `control:handoff`;
- порядок: `agents_list` (роль → instructions) → reuse или `agents_create` → spawn/handoff по `id`;
- валидацию через ошибки create/save (тот же structural check), без второго валидатора в тексте скилла как «истины».

JSON пресетов: поля, достаточные для `AgentCatalogCreateInput` / Studio create (`name`, `role`, `instructions`, `tools`, …; у orchestrator — явный `graph`). Это чертежи для копирования в create, не записи БД.

Скилл кладётся туда, откуда workspace skills registry его видит (копия/seed в `.agents/skills` workspace или общий root, который Studio уже монтирует). From Preset читает **те же** `presets/*.json`.

## Studio

### Адаптер порта

`AgentsCatalogPort` → `AgentRepository` + `CreateAgentUseCase` (и при необходимости тонкий get/list). Create:

- `graph` передан → `assertAgentGraphValid`, сохранить;
- `graph` нет → `buildReactGraph` как сейчас.

### Update и кастомный graph

Сейчас смена `tools` в `update-agent.use-case.ts` пересобирает ReAct и затирает кастомный graph. В этой работе: не перезаписывать graph, если он не стоковый ReAct (эвристика сравнения со `buildReactGraph` от текущих tools) или если patch явно принёс `graph`.

### From Preset

Кнопка в сайдбаре (сейчас toast «coming soon»): список из `presets/*.json` → create тем же use case. Если `name` занято — суффикс (`Coder 2`, `Coder 3`, …).

Стартовый набор ролей в JSON: Orchestrator, Explorer, Researcher, Coder, Reviewer, Tester, Planner, Writer.

### Wiring runtime

`resolve` уже из БД (`workspace-harnesys.registry.ts`). После create новый id должен резолвиться без рестарта runtime (текущий `findById` это даёт). Зарегистрировать capability `agents` с адаптером порта в composition, по образцу plan/scheduler.

## Поток

```
пользователь / оркестратор
        ↓
agents_list (роль, instructions)
        ↓
reuse id  или  agents_create (из головы / из JSON пресета)
        ↓
запись в БД  →  resolve(id)
        ↓
control:spawn | control:handoff
```

UI From Preset входит в ту же воронку на шаге create.

## Вне скоупа

- `custom:*` ноды;
- общий пул бюджета родитель↔дети;
- marketplace пресетов;
- export/import JSON как отдельная фича (сериализация записи уже достаточна позже);
- автоудаление сгенерированных агентов;
- поле связи агента с пресетом в БД.

## Критерии приёмки

1. Граф с `control:spawn` / `control:handoff` исполняется; неизвестный target падает явно.
2. `agents_list` / `agents_create` работают через порт; в библиотечном коде нет слова preset.
3. Create без graph в Studio даёт ReAct; create с graph оркестратора сохраняет spawn-узлы и переживает update tools без затирания.
4. Скилл содержит ReAct-пример и `presets/*.json`; From Preset создаёт агента из того же файла.
5. Два агента с одной `role` допустимы; отбор для задачи — list + решение модели/пользователя.
`)