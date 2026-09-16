# Bug: Spawn results тащат reasoning и usage детей

Источник: самотест агента, память `e5d37a74`, п.5. Статус: open.

## Наблюдение

В `Spawn results` пришёл полный `reasoning` + `usage` каждого ребёнка. У безынструментного echo-делегата в reasoning — рассуждения про scaffold и deferred-tools, хотя пак `agents` у него вырезан.

## Код

- `packages/harnesys/src/application/graph-agent-controls.ts:210-248`: сериализует `results` целиком.
- `packages/harnesys/src/application/graph-spawn.ts:237-243,367-376`: `output` — целое последнее сообщение ребёнка.
- Каталог deferred-инструментов собирается в `packages/harnesys/src/application/llm.ts:144`, грант — `capability-set.ts:319-341`.

## Направление

По умолчанию отдавать только `content`, `reasoning`/`usage` — за флагом. Для безынструментных детей вырезать каталог deferred-инструментов из контекста. Меняет формат `Spawn results`, отдельная задача с решением по контракту.

## Приёмка

Родитель видит текст ответа ребёнка без reasoning/usage, пока флаг не включён.
