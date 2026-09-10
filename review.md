# Review: три правки

Отобраны после сверки с кодом. Остальное из черновика отброшено: ложные утверждения (`RuntimeHandle` «50+ методов», «нет zod», «exposure не применяется») и предложения уровня «переписать все порты».

### 1. `createRuntime` тихо поднимал in-memory stores

`packages/harnesys/src/application/create-runtime.ts`: при отсутствии `lifecycle`/`events` создавались `InMemoryRunEventStore` / `InMemoryRunLifecycleStore`. Данные пропадали при рестарте процесса.

**Правка:** `lifecycle` и `events` обязательны в `CreateRuntimeOptions`. Хост передаёт свои сторы или явно `new InMemory*`.

### 2. `run-engine.execute` смешивал подготовку сегмента

`packages/harnesys/src/application/run-engine.ts`: lease, журнал, HITL/user lookup, packs, сборка `GraphOpts` и `runSegment` жили в одной функции.

**Правка:** подготовка `GraphOpts` вынесена в `run-engine-prepare.ts`. `execute` оставляет lease, journal admit и запуск сегмента.

### 3. `studio.ts` собирал runtime inline

`apps/studio/server/composition/studio.ts` (~335 строк) склеивал sqlite run-store, engine, claimer, queues и ask-ticker рядом с HTTP wiring.

**Правка:** блок вынесен в `wire-runtime.ts` по образцу `wire-schedules` / `wire-memory`.
