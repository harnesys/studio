# Task: инжектить активный permission mode в промпт

Источник: самотест агента, память `e5d37a74`, п.7. Статус: open.

## Наблюдение

Пресеты врали «the user is asked per call» в режиме auto. Текст поправлен на mode-aware (`apps/studio/assets/presets/agents/*.json`, `## Permissions`), но активный режим агент из промпта узнать не может.

## Код

- `packages/harnesys/src/application/create-runtime.ts:72`, `run-engine-prepare.ts:154`: `permissionMode: ''`.
- Маппинг режимов: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts:171`.
- Режимы: `ask` / `auto` / `dont_ask` / `bypass` (`apps/studio/server/src/adapters/store/sqlite/bootstrap.ts:105-114`).

## Направление

Пробросить реальный mode в `permissionMode` и добавить одну строку в системный контекст (`active permission mode: auto`). Маленькая, но трогает рантайм-контракт, поэтому отдельной задачей.

## Приёмка

Агент в auto не пишет «причину для аппрува», в ask — пишет.
