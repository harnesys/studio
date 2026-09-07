# Редактор графа агента в конфиге Studio — дизайн

Дата: 2026-09-07  
Статус: согласовано в чате (вкладка Graph, свёртка навбара, канвас Studio, каталог нод, dagre TB/LR).

## Контекст

`control:spawn` и `control:handoff` живут в графе агента (`packages/harnesys/src/domain/agent-definition.ts`). В диалоге конфига графа нет: клиентский `Agent` поле не несёт, HTTP create/patch его не принимают. Модель вызывает `control:spawn` как tool и получает `tool not found`. Пресет Orchestrator в instructions пишет про spawn/handoff, в `graph` оставляет ReAct (`start` / `think` / `act` / `end`).

Цель v1: смотреть и править граф в конфиге агента, видеть `control:handoff` с канваса, сохранять валидный Harnesys-граф.

Референс раскладки: Jax `flow-graph` (`AgentDialog` + `AgentFlowSection`). Берём идею трёх зон и dagre TB/LR. Визуал, плотность, токены: Studio (`popover`, `sidebar-accent`, `--sidebar-ring`, `Field` / `FieldLabel`).

## Решения

1. Новая секция **Graph** в `AgentConfigDialog` (`features/manage-agent`).
2. На Graph диалог крупнее обычного конфига: `w-[min(80vw,64rem)] h-[min(78vh,48rem)]`. Остальные секции остаются `sm:max-w-3xl`.
3. Навбар секций (`w-40`) сворачивается на любой вкладке. Скрыт: колонка уходит, слева узкий шеврон вернуть меню. Состояние на время открытого диалога.
4. Graph: палитра | канвас `@xyflow/react` | инспектор. Preset picker и Run из Jax в v1 нет.
5. Словарь нод: Harnesys. Публичный API `harnesys` не меняем.
6. Каталог спецификаций в Studio: палитра, defaults, ports, inspector читают одну таблицу.
7. Координаты и ось: Studio-`layout` рядом с `{ nodes, edges }`. Перед `validateStructural` / `assertAgentGraphValid` `layout` срезается.
8. Auto-layout: dagre, `rankdir` TB | LR. Переключатель оси двигает handles. Кнопка Auto пакует ноды текущим `rankdir`.

## Оболочка диалога

`OverlayProvider` задаёт `DialogContent.className` из `options.className` при `open`. Для смены размера без remount в overlay store нужен патч `options.className` (диалог вызывает его при входе/выходе с Graph и при свёртке навбара не обязан менять размер).

Контент Graph: `overflow-hidden min-h-0 flex`. Поля остальных секций по-прежнему `overflow-y-auto`.

Черновик графа в диалоге (как `capabilitiesRef`). Save пишет граф вместе с полями и capabilities.

Файлы остаются в `manage-agent`. Новый feature-slice не заводим.

## Контракт данных

Harnesys (в библиотеку и в `assertAgentGraphValid`):

```ts
type AgentGraph = {
  nodes: Record<string, Node>;
  edges: Array<{ from: string; to: string; when?: Expr }>;
};
```

Хранение Studio в `agents.graph_json`:

```ts
type StudioGraphDocument = AgentGraph & {
  layout?: {
    rankdir: 'TB' | 'LR';
    positions: Record<string, { x: number; y: number }>;
  };
};
```

Позже viewport или группы добавляются в `layout`, не на `Node`.

Провод хоста (сейчас дыра):

- `AgentRecord.graph` в `apps/studio/shared/types.ts`
- клиентский `Agent.graph`
- `CreateAgentInput` / `UpdateAgentInput` и zod `createAgentBody` / `updateAgentBody`
- `toClientAgent`, `createAgent`, `updateAgent`
- use case create уже принимает `graph`; HTTP его не прокидывает

Create без правок канваса: хост как сейчас вызывает `buildReactGraph`. Если пользователь тронул Graph, в POST уходит черновик.

Нет `layout.positions` при открытии (ReAct с диска): один auto-layout текущим `rankdir` (по умолчанию `TB`).

## Канвас

Зависимость: `@xyflow/react` + `dagre` в `apps/studio/client`.

Перевод: `toFlow(document)` / `fromFlow(xyflowState)` → `{ graph, layout }`. xyflow не попадает в HTTP.

Нода xyflow: `id` = ключ `graph.nodes`, визуальный `type` общий (`agent-graph-node`), в `data.spec` Harnesys `Node`. Ребро: `source`/`target` = `from`/`to`, `when` в data. Несколько рёбер между одной парой id допустимы (ReAct: два `think → end`).

Handles зависят от `layout.rankdir`: TB = Top/Bottom, LR = Left/Right. `core:start` только source, `core:end` только target, остальные оба.

Связи: в start входящих нет, из end исходящих нет. Циклы разрешены (ReAct `act → think`).

Палитра: клик добавляет, drag тоже. Новый id: тип без префикса (`handoff`, `handoff-2`).

Кнопка Auto вызывает `layoutGraph(nodes, edges, rankdir)` (обёртка dagre: `nodesep`/`ranksep` как порядок величины Jax 60/80). Переключатель TB/LR меняет handles сразу; позиции до Auto не пересчитывает.

Контролы канваса: zoom, fit, Auto, ось. MiniMap нет.

Delete/Backspace удаляет выбранные ноды и рёбра. Переименование id в инспекторе патчит ключ и `from`/`to`.

`validateStructural` на черновике: кольцо на ноде (`path` `graph.nodes.<id>`), список в инспекторе. Save по-прежнему режет сервер через `assertAgentGraphValid`.

## Каталог нод

Одна таблица спецификаций. Канвас, палитра и инспектор не содержат `switch` по всем типам.

```ts
type GraphNodeGroup = 'core' | 'llm' | 'tool' | 'control';

type GraphNodeSpec = {
  type: string;
  group: GraphNodeGroup;
  label: string;
  inPalette: boolean;
  ports: { in: boolean; out: boolean };
  defaults: () => Node;
  Inspector: ComponentType<{ id: string; node: Node; onChange: (node: Node) => void }>;
};
```

Неизвестный тип и `custom:*`: канвас рисует общий вид, инспектор JSON. В палитру `custom:*` не кладём.

v1 в палитре и defaults:

| type | group | defaults |
|---|---|---|
| `core:start` | core | `{}` |
| `core:end` | core | optional `output` |
| `llm:generate` | llm | `prompt: "main"`, `messages: "$state.messages"` |
| `tool:call` | tool | batch: `calls: "$output.toolCalls"`, `concurrency: "parallel"` |
| `control:assign` | control | `patch: {}` |
| `control:spawn` | control | `calls` expr, `concurrency: "parallel"` |
| `control:handoff` | control | `agentId`, `input` |
| `control:goto` | control | `target` expr |
| `control:interrupt` | control | `reason`, `resumeSchema` |

Инспектор: те же `Field` / `Input` / `Textarea`, что Identity. Пусто: «Select a node.» Клик по ребру открывает `when`.

Вид ноды: `rounded-md`, имя = id, type-pill (`control:handoff`). Выделение: `bg-sidebar-accent` и кольцо `--sidebar-ring`.

## Файлы (ответственность)

В `apps/studio/client/src/features/manage-agent/`:

| файл | ответственность |
|---|---|
| `model/agent-graph-document.ts` | `StudioGraphDocument`, strip `layout`, `toFlow` / `fromFlow` |
| `model/agent-graph-catalog.ts` | таблица спецификаций и defaults |
| `model/agent-graph-layout.ts` | `layoutGraph(rankdir)` над dagre |
| `ui/agent-graph-pane.tsx` | три колонки, встраивание в диалог |
| `ui/agent-graph-palette.tsx` | группы каталога |
| `ui/agent-graph-canvas.tsx` | xyflow, Auto, ось, fit |
| `ui/agent-graph-node.tsx` | один вид ноды + handles |
| `ui/agent-graph-inspector.tsx` | слот инспектора из каталога, ребро `when` |

Плюс правки: `agent-config-dialog.tsx`, overlay store, `agent-config.ts` / create / update / `AgentRecord` / HTTP body.

## Вне скоупа v1

Preset picker и нижняя панель Run (Jax). Мобильный drawer инспектора. `custom:*` в палитре. Отдельный экран графа. Смена API `harnesys`. Глобальный `flowOrientation` в settings. Потолок `max-w-[1600px]` и вечный `90vw` как у Jax `AgentDialog`.
