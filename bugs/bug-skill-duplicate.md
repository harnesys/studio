# Bug: дубль Skill / load_skill

Источник: самотест агента, память `e5d37a74`, п.12. Статус: open.

## Наблюдение

Две ручки на одну операцию загрузки скилла сбивают с толку при чтении каталога.

## Код

- `packages/harnesys/src/application/capability-set.ts:76`: `CORE_SERVICE_TOOLS = ['load_tools', 'load_skill', 'Skill']`.
- `packages/harnesys/src/application/skills/create-load-skill-tool.ts:7`: тул `load_skill`.
- Каталог: `packages/harnesys/src/application/skills/skills-catalog.ts:44`.

## Направление

Оставить одну ручку, вторую депрекейтить. Это разрыв API для существующих агентов, поэтому отдельная задача, не молчаливое переименование.

## Приёмка

В реестре одна ручка загрузки скилла, вторая отвечает deprecation-ошибкой или отсутствует везде включая пресеты.
