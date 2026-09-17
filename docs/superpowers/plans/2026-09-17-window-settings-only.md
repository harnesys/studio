# Window `/settings` only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/settings` содержит только Window: Profile, Appearance, Chat. Domain ноды с этой страницы убрать. Футер ведёт только сюда.

**Architecture:** Phase 1 уже положил `/settings` без `workspaceId`. Смешанный `SETTINGS_GROUPS` режется до Window. Панели Providers/Skills/MCP/… остаются файлами: Phase 3b вставит их в модалку ноды. Host registry не рисовать. Host-global domain API не расширять.

**Tech Stack:** React Router, существующие panes.

**Spec:** `docs/superpowers/specs/2026-09-17-workspace-node-design.md` (Settings UI, часть Window).

**Sequence:** Phase 2.

## Global Constraints

- Тесты запрещены. `bun run lint` / `bun run typecheck` из корня.
- Не делать приёмку «модалка пишет только в store ноды».
- Не делать destructive General, Capabilities как правду изоляции, заглушку списка hosts.
- Не расширять `GET/POST /api/providers` и прочий host-global bag.
- FSD, именованные типы, не второй стенд.

---

## File map

| файл | ответственность |
|---|---|
| `apps/studio/client/src/shared/config/settings-nav.ts` | только Window categories |
| `apps/studio/client/src/widgets/settings-nav/ui/settings-nav.tsx` | nav из новых групп |
| `apps/studio/client/src/pages/settings/ui/settings-page.tsx` | Profile / Appearance / Chat |
| `apps/studio/client/src/shared/config/routes.ts` | `WindowSettingsCategory` |
| `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-sidebar.tsx` | footer уже `/settings` |

Domain panes (`models-pane.tsx`, `skills-pane.tsx`, …) не удалять.

---

### Task 1: `WindowSettingsCategory`

**Files:**
- Modify: `apps/studio/client/src/shared/config/settings-nav.ts`
- Modify: `apps/studio/client/src/shared/config/routes.ts`

**Interfaces:**

```ts
export const WINDOW_SETTINGS_CATEGORIES = ['profile', 'appearance', 'chat'] as const;
export type WindowSettingsCategory = (typeof WINDOW_SETTINGS_CATEGORIES)[number];

export const WINDOW_SETTINGS_GROUPS = [
  {
    id: 'window',
    label: 'Window',
    items: [
      { id: 'profile' as const, label: 'Profile', description: 'How agents address you in this window.' },
      { id: 'appearance' as const, label: 'Appearance', description: 'Theme, scale, and accent.' },
      { id: 'chat' as const, label: 'Chat', description: 'Transcript preferences for the desk.' },
    ],
  },
] as const;
```

Старый `SETTINGS_CATEGORIES` / `SettingsCategory` / `SETTINGS_GROUPS` удалить из публичного config, когда не останется импортов. Domain id (`providers`, `workspace`, …) переедут в Phase 3b как `WorkspaceSettingsCategory` в слайсе модалки, не в window config.

`studioPath.settings` принимает только `WindowSettingsCategory`. Ветка `providers/:providerId` с window page убрать.

`parseWindowSettingsCategory(value: string | undefined): WindowSettingsCategory` — unknown → `'profile'`.

- [ ] **Step 1: Заменить типы и grep импортов `SettingsCategory` / `SETTINGS_GROUPS`.**
- [ ] **Step 2: Lint / typecheck.**
- [ ] **Step 3: Commit** `refactor(studio): window settings categories only`

---

### Task 2: Settings page chrome

**Files:**
- Modify: `apps/studio/client/src/pages/settings/ui/settings-page.tsx`
- Modify: `apps/studio/client/src/widgets/settings-nav/ui/settings-nav.tsx`
- Modify: `apps/studio/client/src/app/routes/index.tsx` если остался `settings/:category/:providerId`

- [ ] **Step 1**

`SettingsPage` рендерит только `AppearancePane`, `ChatPane`, profile stub (как сейчас). Switch по `workspace` / `providers` / `skills` / `mcp` / `plugins` / `tools` / `mode-presets` / `memory` / `git` / `exports` удалить с этой страницы.

Back: `studioPath.desk`. Заголовок/описание: Window, не «this workspace».

Роут `settings/:category/:providerId` удалить.

`SettingsNav` читает `WINDOW_SETTINGS_GROUPS`.

- [ ] **Step 2: Footer**

`nav-settings` → `openSettings()` без workspace id (Phase 1). Проверить, что нет `openSettings('providers')` с футера.

- [ ] **Step 3: Lint / typecheck / commit** `feat(studio): /settings is window chrome only`

---

## Приёмка Phase 2

- `/settings` и `/settings/appearance` / `chat`: нет Providers, Skills, MCP, Plugins, Packages, Mode presets, Memory, Git, Workspace general, Exports.
- Футер открывает только это.
- Нет UI «реестр hosts» и нет пункта pairing.
- `bun run lint` / `typecheck` зелёные.

**Не в этой фазе:** модалка ноды, `config.json`, изоляция bag.
