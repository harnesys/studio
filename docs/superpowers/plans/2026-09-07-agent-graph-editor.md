# Agent graph editor

**Goal:** Вкладка Graph в конфиге агента: палитра, канвас, инспектор; граф сохраняется в БД.

**Spec:** `docs/superpowers/specs/2026-09-07-agent-graph-editor-design.md`

**Стек:** Studio, `@xyflow/react`, dagre. Библиотека `harnesys` без правок API. Тесты не писать.

## Файлы

Создать в `apps/studio/client/src/features/manage-agent/`:
- `model/agent-graph-document.ts` — `StudioGraphDocument`, strip layout, `toFlow` / `fromFlow`, default ReAct
- `model/agent-graph-catalog.ts` — спецификации типов (без React-форм)
- `model/agent-graph-layout.ts` — dagre `layoutGraph(rankdir)`
- `ui/agent-graph-pane.tsx` — три колонки
- `ui/agent-graph-palette.tsx`
- `ui/agent-graph-canvas.tsx`
- `ui/agent-graph-node.tsx`
- `ui/agent-graph-inspector.tsx` (+ формы по типам, если файл толстеет)

Править: overlay store/provider; `agent-config-dialog.tsx`; `agent-config.ts`; create/update client; `Agent` / `AgentRecord`; HTTP body + controller + update use case; `parseGraph`; `assertAgentGraphValid` (strip layout); `package.json` студии.

## Задачи

1. Persist + overlay: `graph` (+ optional `layout`) через HTTP и клиент; `patchOptions` для размера диалога.
2. Модель канваса: каталог, document, dagre TB/LR.
3. UI + проводка в диалог: Graph вкладка, свёртка навбара, Save отдаёт graph.

Чекеры и browser после сборки, не после каждой задачи.
