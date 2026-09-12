# Agent Modes Design

**Status:** implemented (2026-09-12; v1 от 2026-09-11 заменена: режимы-имена упразднены, введены пресеты)
**Scope:** Studio host + `@harnesys/studio-shared` + одно дженерик-дополнение в `packages/harnesys` (Deferred-2).

## Goal

Режимы — данные, не имена. Глобальный каталог пресетов режимов, у агента — экземпляры-копии, у треда — id режима. Бекенд и библиотека не знают ни одного литерала имени режима: только пермишены по группам операций, список паков и текст инструкций. Единственный зарезервированный id — `ask`, встроенный пресет-фолбэк.

## Findings (real code)

- Имена режимов живут в: `RUN_MODES` (`apps/studio/shared/types.ts:181`), `PermissionMode`/`PERMISSION_MODES` (реэкспорт из `harnesys/domain`, `shared/types.ts:177`), `COMPOSER_MODES` (`apps/studio/client/src/widgets/chat-composer/model/composer-mode.ts:24`), `ThreadRunMode` (`apps/studio/server/src/domain/thread.port.ts:30`), `isThreadRunMode` (`thread.helpers.ts:35`), `isRunMode`/`isPermissionMode`/`permissionMapFor` (`tool-confirm-policy.ts`), zod-enum (`thread.body.ts:29`), `ScheduleRecord.mode: PermissionMode` (`schedule.port.ts:13`, CHECK в `schedules.ts:53`), plan-гейт по имени (`wire-packs.ts:125-130`), plan-инъекция (`send-thread-run.use-case.ts:131`, текст из `apps/studio/assets/plan-mode.md` через `plan-mode-prompt.ts:5`).
- `permissionMapFor` на неизвестной строке даёт `fs.write: allow` (`tool-confirm-policy.ts:39`) — функция по именам удаляется, не чинится.
- Библиотека имён не видит: `RunTarget.permissions` — `PermissionMap` (`ports/run-targets.ts:14`), план-пак получает `isPlanRunMode: () => boolean` (`packages/harnesys/src/packs/plan/index.ts:8`).
- Инструменты паков аттачатся внутри библиотеки в момент подготовки рана (`attachPackTools`, `packages/harnesys/src/application/packs/pack-run.ts:164`), после отдачи `RunTarget`. Отложенность схемы — поле `exposure: 'always' | 'deferred'` на `ToolDefinition` (`ports/tools.ts:39`); deferred-схемы не входят в контекст, но видны в каталоге `load_tools` (`application/tools/exposure.ts:17-38`, `application/llm.ts:127-138`). Студия не может пометить pack-инструменты deferred без расширения `RunTarget`.
- Включённые паки агента: `AgentRecord.capabilities` (`shared/src/agent.ts:51`) → `AgentDefinition.packs` (`workspace-harnesys.registry.ts:205`). Имена паков студии: `files`, `shell`, `fetch`, `lsp`, `agents`, `plan`, `threads`, `scheduler`.
- Скиллы агента: `AgentRecord.skills` (allowlist, пусто = все, `shared/src/agent.ts:44`).
- Пресеты агентов — read-only JSON на FS (`agent-presets-fs.adapter.ts`), для режимов не годятся: нужен CRUD.
- Расписания: `fire-due-schedules.use-case.ts:83` кладёт `schedule.mode` в `SendThreadRunRequest.mode`; диалог`schedule-config-dialog.tsx:139-165` рендерит select из `PERMISSION_MODES`.
- Создание агента из пресета (`agents-section.tsx:77`, `agent-subagents-pane.tsx:43`) сразу создаёт агента и открывает тред (`openCreated`). Диалог агента принимает `{ agent: Agent | null }` и строит форму из `agentFieldsFrom` (`agent-config-dialog.tsx:70-73`) — префилл возможен синтетическим draft-объектом.

## Decisions

1. **Пресеты — глобальный CRUD.** Таблица `mode_presets` на всю студию (не per-workspace). Пресет: `id`, `name`, `description`, `instructions`, `skills?`, `packs?`, `permissions?`, `builtin`, `installedByDefault`. `builtin` пресеты нельзя удалять. Сид из кода: `INSERT OR IGNORE` при старте — пользовательские правки builtin-пресетов сохраняются. Сид-значения:
   - `ask`: все четыре гейта `ask`; `builtin`, `installedByDefault: true`.
   - `auto`: `fs.write: allow`, остальное `ask`; `installedByDefault: true`.
   - `plan`: `fs.write: deny`, `process: deny`, `network: allow`, `mcp: allow`; `packs: ['plan']`; `instructions` — текст `apps/studio/assets/plan-mode.md` на момент сида; `installedByDefault: true`.
   - `dont_ask`: `fs.write: allow`, `process: deny`, `network: deny`, `mcp: deny`; `installedByDefault: false`.
   - `bypass`: все `allow`; `installedByDefault: false`.
2. **Копия, не ссылка.** Установка пресета на агента копирует поля в `AgentMode`. Правка пресета не меняет живых агентов; правка режима агента не меняет пресет. Reference-семантика — V2 при появлении запроса.
3. **У агента `modes: AgentMode[]` и `defaultModeId: string | null`.** `ask` есть у каждого агента всегда, удалить нельзя. `defaultModeId: null` = `ask`. Новый агент получает копии всех пресетов с `installedByDefault: true` + `ask`. Существующие агенты бэкфиллится так же (bootstrap, только если `modes_json` пуст).
4. **Цепочка резолва одна:** `body.mode` > `thread.metadata.runMode` > `agent.defaultModeId` > `ask`. Значение валидно, если совпадает паттерн id и присутствует в `agent.modes`; невалидный id = отсутствующее значение (провал по цепочке). Удалённый у агента режим → дефолт агента → `ask`. Handoff меняет `agentId`, `runMode` не трогает — режим резолвится уже режимами нового агента.
5. **Бекенд без имён.** `RUN_MODES`, `RunMode`, `isRunMode`, `isPermissionMode`, `permissionMapFor`, `ThreadRunMode`, `COMPOSER_MODES`, `MODE_LABELS`, zod-enum режима удаляются. Валидация id — паттерн `^[a-z0-9][a-z0-9_-]*$` + вхождение в `agent.modes`. Единственный литерал — `DEFAULT_MODE_ID = 'ask'` в shared (и `PLAN_PACK_ID = 'plan'` — id пака, они и так ключи Capabilities).
6. **Пермишены из данных.** База: ask-карта (`fs.read: allow`, четыре гейта `ask`), поверх — `mode.permissions` по тем же ключам операций. Кастомный режим никогда не даёт базы светлее ask — эскалация через отсутствие данных невозможна.
7. **Паки режима — контекстная ось.** `mode.packs: string[]` — какие паки агента держат схемы инструментов в контексте сразу; остальные паки агента помечаются `exposure: 'deferred'` и грузятся через `load_tools`. Правила: пересечение с включёнными паками агента; поле отсутствует или пусто = все паки агента (сегодняшнее поведение); deferred не равно deny — исполняет только `permissions`. Смена режима в треде = один cache bust на шаге, режим в треде стабилен.
8. **Единственное касание библиотеки (Deferred-2):** `RunTarget.deferredPacks?: readonly string[]` — список имён паков, чьи инструменты при аттаче получают `exposure: 'deferred'`. Дженерик, без имён режимов; студия сама считает список. Без этого ось packs из Decision 7 невозможна: pack-инструменты создаются внутри библиотеки (`pack-run.ts`).
9. **Инструкции режима — в исходящий текст сообщения, в XML-блоке** (`<mode>` перед текстом, как сегодня план), не в notes-tail: инструкции статичны для треда, tail — только для динамики. Блок собирается из `instructions` + скиллов (`<mode-skills>`: «вызови load_skill для каждого перед работой в режиме» — V1; реальная принудительная загрузка — V2). Скиллы пересекаются с `agent.skills` при резолве. План-инъекция по имени удаляется: текст плана — это `instructions` пресета `plan`, механизм общий. `planFollowPrompt` (active-plan reminder) не трогается.
10. **План-гейт без имени.** `wire-packs` `isPlanRunMode` = «эффективный режим треда предзагружает пак `plan`» (`mode.packs` содержит `PLAN_PACK_ID`). Порт библиотеки `() => boolean` не меняется.
11. **Расписания — на modeId.** `schedules.mode_id text not null default 'ask'` (новая колонка, старая `mode` с CHECK остаётся в БД мёртвой), разовый backfill `UPDATE schedules SET mode_id = mode`. На create/update `modeId` валидируется на вхождение в режимы целевого агента. В диалоге расписания — select режимов агента, дефолт `agent.defaultModeId ?? ask`. При срабатывании `modeId` идёт в `body.mode`; если режим у агента исчез — цепочка Decision 4.
12. **Композер.** Список режимов селекта = режимы выбранного агента (label `name`, detail `description`, иконка общая). Фолбэк отображения: `schedule.modeId` > `thread.runMode` > `agent.defaultModeId` > `ask` — каждый с проверкой вхождения в режимы агента. Отправка шлёт id как есть.
13. **Создание агента из пресета открывает модалку с префиллом**, не создаёт агента и не открывает тред. Префилл — синтетический draft из `AgentPresetRecord` в существующий `AgentConfigDialog`; создание — по Save существующим путём. Серверный `/from-preset` остаётся, но из UI не зовётся.

## Data model

```ts
// shared/src/modes.ts
export const MODE_OPS = ['fs.write', 'process', 'network', 'mcp'] as const;
export type ModeOp = (typeof MODE_OPS)[number];
export type ModeOpGate = 'allow' | 'ask' | 'deny';
export type ModeOpPermissions = Partial<Record<ModeOp, ModeOpGate>>;
export const MODE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
export const DEFAULT_MODE_ID = 'ask';
export const PLAN_PACK_ID = 'plan';

export type AgentMode = {
  id: string;                // MODE_ID_RE, уникален в агенте; 'ask' зарезервирован
  name: string;              // 1..80
  description?: string;      // 0..200, detail в селекте
  instructions?: string;     // 0..4000, XML-блок <mode>
  skills?: string[];         // пересечение с agent.skills при резолве
  packs?: string[];          // пересечение с паками агента; нет/пусто = все
  permissions?: ModeOpPermissions;
};

export type ModePreset = AgentMode & {
  builtin: boolean;
  installedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

// AgentRecord: + defaultModeId?: string | null; + modes?: AgentMode[];
// ThreadRecord.runMode: string (id); Schedule.modeId: string.
```

SQLite: `agents.default_mode_id text`, `agents.modes_json text not null default '[]'`, `mode_presets` (колонки зеркалят `ModePreset`, json-поля в `_json`), `schedules.mode_id text not null default 'ask'`. Миграции — idempotent `ALTER TABLE ... ADD COLUMN` в `bootstrap.ts` (образец — `bootstrap.ts:282`), бэкфилл агентов — TS-проход по агентам с пустым `modes_json`.

## API

- `GET/POST /api/mode-presets`, `PATCH/DELETE /api/mode-presets/:id` (delete builtin → 409).
- `createAgentBody`/`updateAgentBody`: `defaultModeId: z.string().regex(MODE_ID_RE).max(48).nullish()`, `modes: z.array(agentModeBody).max(24).optional()`; use-case валидирует `defaultModeId ∈ modes ∪ {'ask'}` и уникальность id, `'ask'` в `modes` запрещён (встроенный, не редактируется).
- `sendThreadRunBody.mode`: `z.string().trim().min(1).max(48).optional()`; валидация вхождения — в use-case, против режимов агента треда.
- Schedule bodies: `modeId` с той же валидацией против агента.

## UX

- Settings → новая панель «Mode Presets»: таблица (name, id, описание, гейты, builtin-бейдж, installedByDefault-тумблер), create/duplicate/edit/delete, builtin без delete.
- Модалка агента → категория «Modes» (после Model): список режимов агента (name, id, summary гейтов), Add from preset (копия, повторная установка того же id заблокирована), Add blank, редактор (name, id, description, instructions, skills-пикер из доступных агенту, packs-пикер из включённых у агента паков, 4 гейта allow/ask/deny), Default Mode select из режимов агента.
- Композер: ModeSelect из режимов агента; иконка общая.
- From preset: клик по пресету агентов открывает модалку с заполненными полями.

## Migration

1. Сид `mode_presets` (id совпадают с прежними именами режимов) → старые `thread.metadata.runMode` и `schedules.mode` резолвятся без конвертации.
2. Бэкфилл агентов: `modes_json` пуст → установить `installedByDefault`-пресеты + `ask`; `default_mode_id` остаётся null.
3. `UPDATE schedules SET mode_id = mode` — разово, идемпотентно.

## Non-goals

Удаление `sandbox: true` у детей. Per-tool переключатели. Reference-семантика пресет↔агент. Реальная принудительная загрузка скиллов (V2). Пер-воркспейс пресеты. Миграция старых агентов на пресеты, которых нет в сиде. Захват `PermissionMode` в библиотеке `harnesys` — домен библиотеки не трогается.

## Verification (repo rules)

Тесты запрещены. `bun run lint`, `bun run typecheck`, живые порты `3000`/`5173`, curl-matrix `POST /api/threads/:id/runs` (дефолт ask / explicit mode / неизвестный id / schedule modeId), ручная матрица agent-browser (пресеты CRUD, Modes-таб, композер, расписание, from-preset модалка, план-режим с паком plan). Коммиты — только по явной просьбе.
