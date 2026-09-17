# Workspace settings modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domain-настройки ноды открываются модалкой с левым nav (General / Capabilities / Data) от конкретного node id. `/settings` остаётся Window.

**Architecture:** Паттерн как `agent-config-dialog` + `agent-config-nav`. Панели Phase 2 снятые со страницы (`ModelsPane`, `SkillsPane`, …) монтируются в модалку с явным `workspaceId`. Capabilities бьют в существующие API с id ноды; изоляция bag — Phase 4a. Wipe файлов — confirm в Phase 4b; здесь снять с host без обязательного wipe.

**Tech Stack:** overlay `dialog` (`@/shared/services/overlay`), существующие panes.

**Spec:** `docs/superpowers/specs/2026-09-17-workspace-node-design.md` Settings UI (модалка).

**Sequence:** Phase 3b (после Phase 3).

## Global Constraints

- Тесты запрещены. `bun run lint` / `typecheck`.
- Модалка всегда от конкретного id, не от selection. Multi-select не дизейблит вход.
- Switcher «другая нода» внутри модалки не делать.
- Приёмка store «пишет только в свою db» не эта фаза.
- Реестр hosts не добавлять.
- FSD: новый feature `manage-workspace-settings` (вход из sidebar + пустой стол). Панели можно оставить в `pages/settings/ui` и импортировать в feature через… **нет**: pages нельзя импортировать из features. Перенести domain panes из `pages/settings/ui` в feature (или в widgets, если уже так заведено). Сейчас panes живут в `pages/settings/ui` — перенос в `features/manage-workspace-settings/ui` вместе с модалкой.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/client/src/features/manage-workspace-settings/` | модалка, nav, open from id |
| `apps/studio/client/src/features/manage-workspace-settings/model/workspace-settings-nav.ts` | `WorkspaceSettingsCategory` |
| `apps/studio/client/src/pages/settings/ui/*-pane.tsx` | перенос в feature |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-header.tsx` | пункт меню аватара / ⋯ |
| `apps/studio/client/src/features/create-workspace/model/workspace-dialogs.ts` | edit/delete → General |

---

## Types

```ts
export type WorkspaceSettingsGroupId = 'workspace' | 'capabilities' | 'data';

export type WorkspaceSettingsCategory =
  | 'general'
  | 'providers'
  | 'skills'
  | 'mcp'
  | 'plugins'
  | 'tools'
  | 'mode-presets'
  | 'memory'
  | 'git'
  | 'exports';
```

Группы как в node-спеке: Workspace → General; Capabilities → Providers, Skills, MCP, Plugins, Packages, Mode presets; Data → Memory, Git, Exports.

---

### Task 1: Nav + dialog shell

**Files:**
- Create: `features/manage-workspace-settings/model/workspace-settings-nav.ts`
- Create: `features/manage-workspace-settings/ui/workspace-settings-dialog.tsx`
- Create: `features/manage-workspace-settings/model/workspace-settings-dialogs.ts`
- Create: `features/manage-workspace-settings/index.ts`

**Interfaces:**

```ts
export function openWorkspaceSettingsDialog(workspaceId: string): Promise<void>;
```

Паттерн `dialog.open` как `openCreateWorkspaceDialog`. Проп: `{ workspaceId: string }`. Левый nav, контент справа. `data-testid="workspace-settings-dialog"`.

- [ ] **Step 1: Shell по образцу `agent-config-dialog.tsx` (ширина, nav, scroll).** Не табы selection.
- [ ] **Step 2: Export из index.ts.**
- [ ] **Step 3: Lint / typecheck / commit** `feat(studio): workspace settings modal shell`

---

### Task 2: General

**Files:**
- Create: `features/manage-workspace-settings/ui/general-pane.tsx`
- Modify: create-workspace update/delete helpers

Поля: имя, путь, id (read-only), host id (`local` до Phase 6). Действия:

- Убрать из окна: `selection.toggle` / снять id из `window.desk.selectedNodeIds`; нода на host жива; закрыть модалку.
- Снять с host: существующий `DELETE /api/workspaces/:id` (Phase 3: registry + rows в studio.db, папка на диске). Confirm текстом, что папка остаётся. Wipe `workspace.db` не обещать и не делать.
- Edit name/path: `PATCH` как сейчас.

Не дизейблить General из-за multi-select.

- [ ] **Commit** `feat(studio): workspace settings general lifecycle`

---

### Task 3: Перенос Capabilities / Data panes

**Files:**
- Move: panes из `pages/settings/ui/` в feature `ui/`
- Wire: category → pane с `workspaceId`

Skills/MCP/Memory/Git/Packages уже берут workspace из URL. Передать явный `workspaceId` пропом. Providers / Mode presets / Plugins пока бьют host-global API: оставить вызовы как есть, в UI подписать ноду (id в шапке модалки). Не делать вид, что изоляция уже есть: не писать «только эта нода» в приёмке. Не расширять host-global API.

`pages/settings` не импортирует эти panes.

- [ ] **Commit** `feat(studio): move domain settings panes into workspace modal`

---

### Task 4: Входы

**Files:**
- Modify: `workspace-header.tsx` (context / ⋯ на аватар)
- Modify: overflow menu: пункт Settings для конкретной ноды
- Optional: ⋯ у `WorkspaceGroupLabel` в секции

Всегда `openWorkspaceSettingsDialog(item.id)`. Footer не открывает модалку.

Удалить `openEditWorkspaceDialog` как отдельный вход, если General его заменяет; либо оставить alias на General.

- [ ] **Lint / typecheck / commit** `feat(studio): open workspace settings from node chrome`

---

## Приёмка Phase 3b

- `/settings` без domain-категорий (Phase 2).
- Модалка с nav General / Capabilities / Data для выбранного id.
- Два included workspace: модалка A не требует selection tabs.
- Футер не открывает domain.
- Снять с host / убрать из окна работают через Phase 3 API.
- `bun run lint` / `typecheck`.

**Не в этой фазе:** «модалка пишет только в db этой ноды», wipe каталога, registry hosts.
