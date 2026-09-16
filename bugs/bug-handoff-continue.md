# Investigation: утечка Continue в текст handoff

Источник: самотест агента, память `e5d37a74`, п.3. Статус: open, нужен лог треда.

## Наблюдение

Реплика Handoff Demo оборвалась артефактом «даже при желанииContinue»: внутренний токен в пользовательском тексте.

## Что уже проверено

Склейки с таким литералом в библиотеке нет. Кандидаты: хинт `Continue without pausing...` (`packages/harnesys/src/application/graph-agent-controls.ts:98`), скопированный моделью в ответ; склейка дельт без разделителя (`apps/studio/client/src/entities/session/model/coalesce-events.ts:75-80`) — корректна для стрима, пробел должен прийти от модели; кнопка `Continue` (`apps/studio/client/src/features/send-message/ui/hitl-prompt.tsx:196`) — UI, в транскрипт не пишет.

## Нужно для закрытия

`threadId` и сырые `text-delta` кадры реплики: чей токен `Continue` — модель, хинт или клиент.

## Приёмка

Виновник назван по кадрам, фикс точечный: хинт, сборка стрима или рендер.
