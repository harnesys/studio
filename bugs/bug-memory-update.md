# Bug: memory_write не чинится по id

Источник: самотест агента, память `e5d37a74`, п.10. Статус: open.

## Наблюдение

Опечатка в своей записи правилась через `delete` + `re-write`, потому что `key` при записи не передали. Патча по id нет.

## Код

- `packages/harnesys/src/packs/memory/create-semantic-tools.ts:27-56`: `memory_write` — upsert по опциональному `key`.
- Тот же файл, строки 77-94: `memory_delete` — по `id`.
- Порт: `../packages/harnesys/src/ports/memory.ts`.

## Направление

Либо обязательный `key` для scope `long`, либо `memory_update` по id. Меняет порт памяти, схему тулов, SQLite-репо Studio. Отдельная задача с решением по API.

## Приёмка

Запись правится одним вызовом по id без удаления.
